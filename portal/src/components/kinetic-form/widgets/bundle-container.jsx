import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import { KineticLib } from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import {
  containerActions,
  selectContainerKappSlug,
} from '../../../helpers/state.js';
import {
  ContainerHistoryContext,
  FormChromeContext,
  FORM_CHROME_BARE,
  FORM_CHROME_DEFAULT,
  RenderModeContext,
  RENDER_MODE_CONTAINER,
  RENDER_MODE_MODAL,
} from '../../../helpers/container-scope.js';
import { getAttributeValue } from '../../../helpers/records.js';
import {
  buildStyleObject,
  mergeThemes,
  parseThemeConfig,
} from '../../../helpers/theme.js';
import { BundleRoutes } from '../../../pages/BundleRoutes.jsx';

// Parses a kapp slug out of a container's inner path. Same shape as the
// outer URL parser in App.jsx — keeps the resolution rule consistent across
// the global and per-container scopes.
const parseKappSlugFromPath = path => {
  if (typeof path !== 'string') return null;
  const m = path.match(/^\/kapps\/([^/?#]+)/);
  return m ? m[1] : null;
};

// Globals (jQuery, moment, date-fns) needed by CoreForm. Kicked off as a
// promise import the way the top-level app does it; CoreForm awaits it.
const globals = import('../globals.jsx');

/* ------------------------------------------------------------------ */
/* URL sync helpers — work against the hash's search portion since the */
/* top-level app uses HashRouter. Each container with `urlSync: true`  */
/* claims a search-param key prefixed `ctr.<slotPath>` so several      */
/* containers can sync independently and the prefix prevents           */
/* collisions with any future top-level search params.                 */
/*                                                                     */
/* `slotPath` is *not* just the user's `id`. It's auto-derived from    */
/* mount position by walking up the DOM at registration time:          */
/*   - Top-level container with id='main' → slotPath = 'main'          */
/*   - Container with id='inner' nested inside above → 'main.inner'    */
/*   - Same form recursively mounted, both id='main' →                 */
/*       outer 'main', inner 'main.main' (no collision)                */
/* This makes URL sync collision-resistant against the recursion case  */
/* (a form's container loading the same form, which has the same      */
/* container id) without forcing form designers to coordinate ids      */
/* across forms they don't co-own.                                     */
/* ------------------------------------------------------------------ */

const SLOT_PREFIX = 'ctr.';
const SLOT_DATA_ATTR = 'data-bundle-container-slot';

// Walks up the DOM from `element` looking for a parent container's slot
// marker. Returns the parent's slotPath or null if this is a top-level
// container (no enclosing BundleContainer in the document).
const findParentSlotPath = element => {
  let el = element?.parentElement;
  while (el) {
    const slot = el.getAttribute(SLOT_DATA_ATTR);
    if (slot != null) return slot;
    el = el.parentElement;
  }
  return null;
};

const parseHash = (hash = window.location.hash) => {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIndex = stripped.indexOf('?');
  const path = qIndex === -1 ? stripped : stripped.slice(0, qIndex);
  const search = qIndex === -1 ? '' : stripped.slice(qIndex + 1);
  return { path: path || '/', params: new URLSearchParams(search) };
};

const buildHash = (path, params) => {
  const search = params.toString();
  return `#${path}${search ? `?${search}` : ''}`;
};

const readContainerPath = id => {
  const { params } = parseHash();
  const value = params.get(`${SLOT_PREFIX}${id}`);
  // Ignore corrupt URL slot values rather than letting an invalid path
  // get pushed into MemoryRouter.
  return typeof value === 'string' && value.startsWith('/') ? value : '';
};

const writeContainerPath = (id, path, { replace = false } = {}) => {
  const { path: outerPath, params } = parseHash();
  const key = `${SLOT_PREFIX}${id}`;
  if (path) {
    params.set(key, path);
  } else {
    params.delete(key);
  }
  const newHash = buildHash(outerPath, params);
  if (newHash === window.location.hash) return;
  if (replace) {
    const url =
      window.location.pathname + window.location.search + newHash;
    window.history.replaceState(null, '', url);
  } else {
    window.location.hash = newHash;
  }
};

/**
 * Inner content component — runs inside the MemoryRouter so it can use
 * useNavigate / useLocation to drive the container's history. Exposes the
 * widget's API via the ref pattern.
 */
const BundleContainerInner = forwardRef(
  ({ id, slotPath, initiallyBlank, urlSync }, ref) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isBlank, setIsBlank] = useState(!!initiallyBlank);

    // Live ref for `api.getCurrent()` — '' while blank.
    const pathRef = useRef(initiallyBlank ? '' : location.pathname);
    useEffect(() => {
      pathRef.current = isBlank ? '' : location.pathname;
    }, [location.pathname, isBlank]);

    // History "floor" — the location.key of the first real (non-blank) entry
    // in this container's MemoryRouter. We can't rely on the literal key
    // 'default' to detect "nothing to go back to": a blank-container start
    // followed by a forced replace gives the new entry a fresh key, so the
    // 'default' check would falsely show a back button on the first page.
    //
    // For containers that mount with a real initialPath, location.key on
    // mount is 'default' — initialize the floor to that immediately.
    // For blank-mount containers, the floor is null until the first non-
    // blank render captures location.key.
    //
    // canGoBack is then simply "we're past the floor" — it stays false on
    // the first real page (which IS the floor) and flips true after any
    // push that creates a new entry above it.
    const [historyFloorKey, setHistoryFloorKey] = useState(
      initiallyBlank ? null : 'default',
    );
    // Tracks whether the MemoryRouter's initial '/' placeholder is still the
    // current router entry. True only when the container mounted blank AND
    // has not yet been navigated to a real path. The first real navigation
    // replaces (overwrites) the placeholder rather than pushing, then this
    // flips to false for the rest of the container's life. A programmatic
    // clear (`api.navigate('')` / `null`) does NOT restore the placeholder
    // — it leaves inner router history untouched and only flips isBlank —
    // so re-navigation after a clear pushes normally.
    const hasPlaceholderRef = useRef(!!initiallyBlank);
    useEffect(() => {
      if (!isBlank && historyFloorKey === null) {
        setHistoryFloorKey(location.key);
        hasPlaceholderRef.current = false;
      }
    }, [isBlank, location.key, historyFloorKey]);
    const canGoBack =
      historyFloorKey !== null && location.key !== historyFloorKey;

    // Outbound navigation event. Fires whenever the container's effective
    // path changes — including the initial arrival on mount, blank→path,
    // path→path, and path→blank — so other widgets can subscribe to
    // "what path is this container on?" and treat the first event as the
    // source of truth for initial state. On the mount event, `previousPath`
    // is `undefined`; on every subsequent event, it's the prior `path`.
    // The sentinel ref also suppresses redundant dispatches when nothing
    // actually changed between renders.
    const lastDispatchedPathRef = useRef(undefined);
    useEffect(() => {
      const currentPath = isBlank ? '' : location.pathname;
      const previousPath = lastDispatchedPathRef.current;
      lastDispatchedPathRef.current = currentPath;
      if (previousPath === currentPath) return;
      window.dispatchEvent(
        new CustomEvent('bundle:container:navigated', {
          detail: { id, path: currentPath, previousPath },
        }),
      );
    }, [id, location.pathname, isBlank]);

    // Publish the container's "current kapp" slug to state.containers[slotPath]
    // so widgets rendered inside this container can observe it via
    // useKappContext. Slug is parsed from the container's inner path — blank
    // and non-kapp paths publish null.
    useEffect(() => {
      const path = isBlank ? '' : location.pathname;
      containerActions.setContainerKappSlug({
        slot: slotPath,
        slug: parseKappSlugFromPath(path),
      });
    }, [slotPath, location.pathname, isBlank]);

    // urlSync bookkeeping: tracks the last value we either wrote to the URL
    // or read from it during an external change. Effect 1 only writes when
    // the inner state diverges from this ref, which prevents feedback loops
    // (an external URL change navigates the inner router, which would
    // otherwise re-trigger a write of the same value).
    const lastSyncedRef = useRef(null);
    const isFirstWriteRef = useRef(true);

    // Effect 1 — write inner state to URL when it changes (urlSync only).
    // The first write replaces history (we don't want page-load to push a
    // navigation entry); subsequent writes push so browser back navigates
    // the container. URL key is the auto-derived slotPath, not the user's
    // `id`, so nested containers with the same id can't collide on URL.
    useEffect(() => {
      if (!urlSync) return;
      const value = isBlank ? '' : location.pathname;
      if (lastSyncedRef.current === value) return;
      const replace = isFirstWriteRef.current;
      isFirstWriteRef.current = false;
      lastSyncedRef.current = value;
      writeContainerPath(slotPath, value, { replace });
    }, [urlSync, slotPath, isBlank, location.pathname]);

    // Effect 2 — react to external URL changes (browser back/forward, page
    // refresh of just the hash, manual edit). Hashchange fires on
    // `window.location.hash =` writes; popstate fires on history navigation.
    useEffect(() => {
      if (!urlSync) return;
      const handler = () => {
        const target = readContainerPath(slotPath);
        if (lastSyncedRef.current === target) return;
        // Mark synced *before* mutating so effect 1 sees no divergence.
        lastSyncedRef.current = target;
        if (!target) {
          setIsBlank(true);
        } else {
          setIsBlank(false);
          navigate(target);
        }
      };
      window.addEventListener('hashchange', handler);
      window.addEventListener('popstate', handler);
      return () => {
        window.removeEventListener('hashchange', handler);
        window.removeEventListener('popstate', handler);
      };
    }, [urlSync, slotPath, navigate]);

    // Cross-tree navigation events. Form code or other widgets can dispatch:
    //   window.dispatchEvent(new CustomEvent('bundle:container:navigate', {
    //     detail: { id, path, replace }
    //   }))
    // When `detail.id` matches this container's id, navigate. When `detail.id`
    // is omitted, every container responds (broadcast). Path must start with
    // "/" to navigate, OR be the explicit value '' or null to clear (blank)
    // the container without touching inner router history. `replace` is
    // optional — when true, the inner history entry is replaced rather than
    // pushed (back button skips it). Ignored on clear.
    useEffect(() => {
      const handler = event => {
        const detail = event?.detail || {};
        if (detail.id != null && detail.id !== id) return;
        // Clear signal — explicit '' or null only. Undefined (missing key)
        // falls through to the typeof check below so a malformed event still
        // gets rejected rather than silently clearing every container.
        if (detail.path === '' || detail.path === null) {
          setIsBlank(true);
          return;
        }
        if (typeof detail.path !== 'string' || !detail.path.startsWith('/')) {
          return;
        }
        const replacePlaceholder = hasPlaceholderRef.current;
        hasPlaceholderRef.current = false;
        setIsBlank(false);
        navigate(
          detail.path,
          detail.replace || replacePlaceholder ? { replace: true } : undefined,
        );
      };
      window.addEventListener('bundle:container:navigate', handler);
      return () =>
        window.removeEventListener('bundle:container:navigate', handler);
    }, [id, navigate]);

    // Imperative API — picked up by registerWidget via the ref'd WidgetAPI
    // wrapper, then exposed at bundle.widgets.BundleContainer.instances[id].api.
    // Calling `navigate` with a valid path also un-blanks the container.
    // Calling it with the explicit value '' or null clears the container —
    // flips it back to blank without touching inner router history, so a
    // later navigate pushes onto the existing history rather than over it.
    const api = useRef({
      navigate: (path, { replace } = {}) => {
        if (path === '' || path === null) {
          setIsBlank(true);
          return;
        }
        if (typeof path !== 'string' || !path.startsWith('/')) {
          console.error(
            'BundleContainer Widget Error: navigate(path) requires a string starting with "/", or the explicit value "" / null to clear the container.',
          );
          return;
        }
        const replacePlaceholder = hasPlaceholderRef.current;
        hasPlaceholderRef.current = false;
        setIsBlank(false);
        navigate(path, replace || replacePlaceholder ? { replace: true } : undefined);
      },
      getCurrent: () => pathRef.current,
    });

    // Resolve a theme overlay for whichever kapp this container is currently
    // hosting. Container scope is published to state.containers[slotPath] by
    // the inner-location effect above; we read it back here, look up the kapp
    // record, and merge its Theme over the space Theme. The merged result is
    // applied as inline CSS variables on a contents-display wrapper around
    // the inner route output — vars cascade through the DOM, so every
    // descendant restyles automatically without any per-component change.
    //
    // The wrapper only emits style overrides when the container is on a kapp
    // path (containerKappSlug != null). On non-kapp inner paths the global
    // stylesheet (already kapp-stripped by App.jsx's URL-driven cascade) is
    // the correct answer, so we leave style undefined.
    //
    // Known limitation: things rendered into top-level React portals (modals
    // via ModalSlot, toasts via Toaster, panels into #app-panels, ark-ui
    // Portal-based dropdowns/popovers) are not descendants of this wrapper
    // and therefore inherit the global theme, not the container's overlay.
    // See project_theme_portal_leak.md for the planned fix.
    const containerKappSlug = useSelector(selectContainerKappSlug(slotPath));
    const space = useSelector(s => s.app.space);
    const containerKapp = useSelector(s =>
      containerKappSlug ? s.app.kappCache?.[containerKappSlug] || null : null,
    );
    const overrideStyles = useMemo(() => {
      if (!containerKappSlug) return undefined;
      const merged = mergeThemes(
        parseThemeConfig(getAttributeValue(space, 'Theme')),
        parseThemeConfig(getAttributeValue(containerKapp, 'Theme')),
      );
      return Object.keys(merged).length === 0
        ? undefined
        : buildStyleObject(merged);
    }, [containerKappSlug, space, containerKapp]);

    return (
      <WidgetAPI ref={ref} api={api.current}>
        <ContainerHistoryContext.Provider value={{ canGoBack }}>
          {!isBlank && (
            <div className="contents" style={overrideStyles}>
              <BundleRoutes />
            </div>
          )}
        </ContainerHistoryContext.Provider>
      </WidgetAPI>
    );
  },
);

/**
 * Outer component — sets up Redux + KineticLib + MemoryRouter +
 * ContainerScopeContext so the bundle pages rendered inside have everything
 * they need (store, SDK globals, routing context) and know they're inside a
 * container so they don't mutate global chrome state.
 *
 * When `urlSync` is true, the URL slot wins over `initialPath` on mount —
 * a user landing with `?ctr.<slotPath>=/kapps/services` in the hash gets
 * that page, regardless of what the form configured as a default.
 *
 * When the resolved path is missing / null / empty, the container mounts
 * blank (the React tree, store, and API are all live; the inner route
 * table just isn't rendered until something calls `api.navigate(path)`).
 *
 * `containerEl` is passed in so we can manage the slotPath data attribute
 * lifecycle — it gets set synchronously at registration time (before this
 * component mounts, so descendant containers registering moments later can
 * already find us via DOM walk) and removed on unmount.
 */
const BundleContainerComponent = forwardRef(
  (
    {
      id,
      slotPath,
      containerEl,
      initialPath,
      urlSync,
      renderMode,
      hideFormChrome,
    },
    ref,
  ) => {
    useEffect(() => {
      if (!containerEl) return;
      // Idempotent — set was already done synchronously in the registration
      // function before mount, but we re-set here so the cleanup function
      // closes over the right element/value.
      containerEl.setAttribute(SLOT_DATA_ATTR, slotPath);
      return () => {
        // Only clear if we still own the marker (some other widget could
        // have repurposed the same DOM element with its own marker, in which
        // case we leave that one alone).
        if (containerEl.getAttribute(SLOT_DATA_ATTR) === slotPath) {
          containerEl.removeAttribute(SLOT_DATA_ATTR);
        }
        // Drop this container's published kapp slug from global state so
        // widgets that may briefly outlive the container don't observe a
        // stale slug from a re-mounted same-slot container.
        containerActions.removeContainer(slotPath);
        // Drop this container's URL slot. Without this, when a parent
        // container clears or navigates away — unmounting nested children —
        // the children's slots would linger as orphans (e.g. parent slot
        // gone but `ctr.parent.child=...` still in the URL). Use replace so
        // the cleanup doesn't add a browser history entry of its own; it
        // happens during the same commit as the parent's history push.
        if (urlSync) {
          writeContainerPath(slotPath, '', { replace: true });
        }
      };
    }, [containerEl, slotPath, urlSync]);

    // URL slot wins over configured initialPath when urlSync is on. Read
    // once on mount; subsequent URL changes are handled inside the inner
    // component's hashchange/popstate listener.
    const fromUrl = urlSync ? readContainerPath(slotPath) : '';
    const effectivePath = fromUrl || initialPath;
    const hasPath =
      typeof effectivePath === 'string' && effectivePath.length > 0;
    const formChrome = hideFormChrome ? FORM_CHROME_BARE : FORM_CHROME_DEFAULT;
    return (
      <Provider store={store}>
        <KineticLib globals={globals} locale="en">
          <RenderModeContext.Provider value={renderMode}>
            <FormChromeContext.Provider value={formChrome}>
              <MemoryRouter initialEntries={[hasPath ? effectivePath : '/']}>
                <BundleContainerInner
                  ref={ref}
                  id={id}
                  slotPath={slotPath}
                  initiallyBlank={!hasPath}
                  urlSync={urlSync}
                />
              </MemoryRouter>
            </FormChromeContext.Provider>
          </RenderModeContext.Provider>
        </KineticLib>
      </Provider>
    );
  },
);

const validateConfig = config => {
  if (!config || typeof config.id !== 'string' || config.id.length === 0) {
    console.error(
      'BundleContainer Widget Error: `id` is required and must be a non-empty string.',
    );
    return false;
  }
  // initialPath is optional. Missing / null / '' → container mounts blank.
  // When provided as a non-empty string, it must start with "/".
  if (
    config.initialPath != null &&
    config.initialPath !== '' &&
    (typeof config.initialPath !== 'string' ||
      !config.initialPath.startsWith('/'))
  ) {
    console.error(
      'BundleContainer Widget Error: `initialPath`, when provided, must be a string starting with "/", or omitted/null/"" to mount blank.',
    );
    return false;
  }
  if (config.urlSync != null && typeof config.urlSync !== 'boolean') {
    console.error(
      'BundleContainer Widget Error: `urlSync`, when provided, must be a boolean.',
    );
    return false;
  }
  if (
    config.hideFormChrome != null &&
    typeof config.hideFormChrome !== 'boolean'
  ) {
    console.error(
      'BundleContainer Widget Error: `hideFormChrome`, when provided, must be a boolean.',
    );
    return false;
  }
  if (
    config.renderMode != null &&
    config.renderMode !== RENDER_MODE_CONTAINER &&
    config.renderMode !== RENDER_MODE_MODAL
  ) {
    console.error(
      `BundleContainer Widget Error: \`renderMode\`, when provided, must be "${RENDER_MODE_CONTAINER}" or "${RENDER_MODE_MODAL}".`,
    );
    return false;
  }
  return true;
};

// Warns when a second container with the same `id` is mounted while the
// first is still attached to the document. Imperative API addressing
// (`bundle.widgets.BundleContainer.get(id)`) resolves to the most recently
// registered instance, so the older one becomes unaddressable. URL slots
// auto-namespace via slotPath so they don't collide; this is purely about
// API/event addressing.
const warnIfIdCollision = (id, newContainer) => {
  const existing = BundleContainer.instances?.[id];
  if (!existing || typeof existing.container !== 'function') return;
  const otherEl = existing.container();
  if (otherEl === newContainer) return;
  if (!document.body.contains(otherEl)) return;
  console.warn(
    `BundleContainer Widget Warning: Two containers with id="${id}" are mounted at the same time. ` +
      `URL sync slots are auto-namespaced by mount position, so the URL is fine. But ` +
      `bundle.widgets.BundleContainer.get('${id}') resolves to the most recently registered instance — ` +
      `the older one becomes unaddressable via id alone. Use a different id, or address by the ` +
      `data-bundle-container-slot attribute on the DOM element if you need to reach a specific instance.`,
  );
};

/**
 * Initializes a BundleContainer widget instance.
 *
 * Usage from a Kinetic form's bundle script — `container` accepts a real DOM
 * element OR the array-like wrapper returned by Kinetic's `.element()` (no
 * jQuery, no `[0]` required):
 *   bundle.widgets.BundleContainer({
 *     container: K('content[Page Container]').element(),
 *     config: { id: 'main', initialPath: '/kapps', urlSync: true },
 *     id: 'main',
 *   });
 *
 * With `urlSync: true`, the container's current path round-trips through a
 * search param `ctr.<slotPath>` inside the URL hash — F5 restores inner
 * state, browser back navigates the container, and links are bookmarkable.
 * `slotPath` is auto-derived from mount position (top-level → just the id;
 * nested → `<parent>.<id>`) so a form's container loading the same form
 * recursively can't collide on URL.
 *
 * Once initialized, navigate the container by either:
 *   - Imperative:  bundle.widgets.BundleContainer.get('main').navigate('/kapps/services')
 *   - Event:       window.dispatchEvent(new CustomEvent(
 *                    'bundle:container:navigate',
 *                    { detail: { id: 'main', path: '/kapps/services' } }
 *                  ))
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} config Configuration object.
 * @param {string} config.id Identifier for this container instance, used for
 *   imperative API and event-target addressing. URL sync uses an auto-derived
 *   slotPath, not this id directly, so id collisions across nested containers
 *   don't break URL sync (they do still affect API addressing — see warning).
 * @param {string} [config.initialPath] Initial path the container's internal
 *   router opens at. Optional — missing / null / "" all mount the container
 *   blank (no routed content rendered) until `api.navigate(path)` is called.
 *   When provided as a non-empty string, must start with "/". Overridden by
 *   the URL slot when `urlSync` is on and the slot is populated.
 * @param {boolean} [config.urlSync] When true, two-way binds the container's
 *   current path to the URL via a search param `ctr.<slotPath>` (in the hash,
 *   since the top-level app uses HashRouter). Default false.
 * @param {'container'|'modal'} [config.renderMode] Hint to inner pages about
 *   the render context. Defaults to 'container'. ModalSlot passes 'modal' so
 *   form chrome (PageHeading) is suppressed inside modals; the modal already
 *   provides its own title/close chrome.
 * @param {boolean} [config.hideFormChrome] When true, forms loaded inside
 *   this container render without their page wrapper — no PageHeading
 *   (icon / form name / settings link), no gutter, no max-width centering,
 *   no bordered content card. Use when the host page owns the layout and
 *   only wants the form fields to appear. Default false. Overrides a per-
 *   form `Form Chrome` attribute when set true; if false (the default), an
 *   individual form can still opt into bare via its attribute.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking. When omitted, falls back to config.id.
 */
export const BundleContainer = ({ container, config, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleContainer');
  if (resolved && validateConfig(config)) {
    // Compute slotPath via DOM walk *before* registering. The marker has to
    // be set synchronously so any descendant container that registers
    // moments later (e.g. on the same form's load event) finds us.
    const parentSlot = findParentSlotPath(resolved);
    const slotPath = parentSlot != null
      ? `${parentSlot}.${config.id}`
      : config.id;
    resolved.setAttribute(SLOT_DATA_ATTR, slotPath);

    // Publish the initial kapp slug synchronously, before any descendant
    // widget mounts. Without this, kapp-aware widgets inside the container
    // would render once with no scope, then re-render after the inner-
    // location effect fires. The initial value matches what
    // BundleContainerInner computes from its first render's effective path.
    const initialResolvedPath =
      (config.urlSync ? readContainerPath(slotPath) : '') ||
      config.initialPath ||
      '';
    containerActions.setContainerKappSlug({
      slot: slotPath,
      slug: initialResolvedPath
        ? parseKappSlugFromPath(initialResolvedPath)
        : null,
    });

    warnIfIdCollision(config.id, resolved);

    return registerWidget(BundleContainer, {
      container: resolved,
      Component: BundleContainerComponent,
      props: {
        id: config.id,
        slotPath,
        containerEl: resolved,
        initialPath: config.initialPath,
        urlSync: !!config.urlSync,
        renderMode: config.renderMode || RENDER_MODE_CONTAINER,
        hideFormChrome: !!config.hideFormChrome,
      },
      id: id || config.id,
      // BundleContainer provides its own MemoryRouter internally; the default
      // HashRouter wrap would conflict with the inner router (react-router v6
      // disallows nested Routers).
      skipRouter: true,
    });
  }
  return Promise.reject(
    'The BundleContainer widget parameters are invalid. See the console for more details.',
  );
};
