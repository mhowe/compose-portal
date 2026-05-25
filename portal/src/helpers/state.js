import { throttle } from 'lodash-es';
import { fetchForms, fetchKapp, fetchSpace } from '@kineticdata/react';
import { regRedux } from '../redux.js';
import { getAttributeValue } from './records.js';
import { calculateThemeState, themeState } from './theme.js';

// Fields the bundle wants on a kapp record. Used both nested under "kapps.*"
// in the bulk space fetch (so one round trip populates the whole cache) and
// bare in fetchKapp for targeted refreshes.
const KAPP_INCLUDE_FIELDS = [
  'attributesMap',
  'kappAttributeDefinitions',
  'categoryAttributeDefinitions',
  'formAttributeDefinitions',
  'categories',
  'categories.attributesMap',
  'categorizations',
];

// Include string for fetchKapp (refreshing one kapp). Bare per-kapp fields.
export const KAPP_INCLUDE = KAPP_INCLUDE_FIELDS.join(',');

// Include string for the authenticated fetchSpace call. Pulls every kapp the
// user can see with full per-kapp details in a single round trip — populates
// state.app.kappCache via setSpace so widgets read kapp data from the cache
// instead of each issuing its own fetch.
export const SPACE_INCLUDE = [
  'attributesMap',
  'kapps',
  ...KAPP_INCLUDE_FIELDS.map(f => `kapps.${f}`),
  'spaceAttributeDefinitions',
  'userAttributeDefinitions',
  'userProfileAttributeDefinitions',
  'teamAttributeDefinitions',
].join(',');

// State for the customized theme
export const themeActions = regRedux(
  'theme',
  { ...themeState },
  {
    // Payload: { space, kapp } — either or both records (with attributesMap
    // included). Each contributes a layer to the cascade; missing records
    // contribute nothing.
    setTheme(state, payload) {
      calculateThemeState(state, {
        space: getAttributeValue(payload?.space, 'Theme'),
        kapp: getAttributeValue(payload?.kapp, 'Theme'),
      });
    },
    enableEditor(state) {
      state.editor = true;
    },
    disableEditor(state) {
      state.editor = false;
    },
  },
);

// State for global app data
export const appActions = regRedux(
  'app',
  {
    // Is the user authenticated
    authenticated: false,
    // Space record
    space: null,
    // Slug of the "current" kapp at the page (browser-URL) level. Per-container
    // scopes will live elsewhere when that lands; this one is global and
    // URL-driven.
    kappSlug: null,
    // Cache of full kapp records keyed by slug. Populated by setKapp; widgets
    // that need a kapp other than the global current read from here too. Avoids
    // duplicate fetches across the page when multiple things want kapp data.
    kappCache: {},
    // Profile record
    profile: null,
    // Error from fetching any app data
    error: null,
  },
  {
    setAuthenticated(state, payload) {
      state.authenticated = payload;
    },
    setSpace(state, { error, space }) {
      if (error) state.error = error;
      else {
        state.space = space;
        // Populate the kapp cache from space.kapps in the same atomic update,
        // so selectCurrentKapp / selectKappBySlug return data the moment
        // state.space is set. The authenticated fetchSpace include pulls full
        // kapp details (attributes, categories, categorizations) nested under
        // kapps.*, so one round trip primes the whole cache.
        if (Array.isArray(space?.kapps)) {
          for (const kapp of space.kapps) {
            if (kapp?.slug) state.kappCache[kapp.slug] = kapp;
          }
        }
        // Only auto-set kappSlug if nothing has set it yet. The URL → kappSlug
        // effect in App.jsx is the primary source; this remains the fallback
        // when the user lands on a route outside /kapps/<slug>/... .
        if (state.kappSlug == null) {
          state.kappSlug = getAttributeValue(
            space,
            'Service Portal Kapp Slug',
            'service-portal',
          );
        }
      }
    },
    setKappSlug(state, payload) {
      state.kappSlug = payload;
    },
    // Writes the fetched kapp into the cache, keyed by its own slug. Used by
    // targeted refresh helpers (refreshKapp) and by any widget that fetches a
    // specific kapp on its own — putting the result here lets the next
    // consumer skip a duplicate fetch.
    setKapp(state, { error, kapp }) {
      if (error) state.error = state.error || error;
      else if (kapp?.slug) state.kappCache[kapp.slug] = kapp;
    },
    // Bulk-writes an array of kapp records into the cache. Used by
    // refreshKapps() to drop in a fresh snapshot of every kapp after a
    // re-run of the bulk space fetch.
    setKapps(state, kapps) {
      if (!Array.isArray(kapps)) return;
      for (const kapp of kapps) {
        if (kapp?.slug) state.kappCache[kapp.slug] = kapp;
      }
    },
    setProfile(state, { error, profile }) {
      if (error) state.error = state.error || error;
      else state.profile = profile;
    },
    updateProfile(state, profile) {
      Object.assign(state.profile, profile);
    },
    // Shallow-merge a partial record into state.space. Useful after a targeted
    // save (updateSpace) so we refresh the changed fields without dropping
    // fields that weren't included in the mutation response.
    updateSpaceData(state, partial) {
      if (state.space && partial) Object.assign(state.space, partial);
    },
    // Shallow-merge a partial record into a specific kapp in the cache. Now
    // requires a `slug` so callers explicitly target which kapp to update —
    // important now that the cache holds many kapps. Payload shape:
    //   { slug: 'services', attributesMap: {...}, ... }
    updateKappData(state, { slug, ...partial } = {}) {
      if (slug && state.kappCache[slug] && partial && Object.keys(partial).length > 0) {
        Object.assign(state.kappCache[slug], partial);
      }
    },
    // Shallow-merge a partial record into a specific category nested under
    // a specific kapp in the cache. Mirrors updateKappData; pairs with
    // updateCategory for keeping redux in sync after a targeted save
    // without round-tripping the whole kapp. Payload shape:
    //   { kappSlug: 'services', categorySlug: 'hr', attributesMap: {...}, ... }
    updateKappCategoryData(state, { kappSlug, categorySlug, ...partial } = {}) {
      if (
        !kappSlug ||
        !categorySlug ||
        !partial ||
        Object.keys(partial).length === 0
      ) {
        return;
      }
      const kapp = state.kappCache[kappSlug];
      if (!kapp || !Array.isArray(kapp.categories)) return;
      const cat = kapp.categories.find(c => c.slug === categorySlug);
      if (cat) Object.assign(cat, partial);
    },
    // Drops a kapp from the cache, forcing the next consumer to re-fetch.
    // Forward-looking: pairs with a future bundle.refreshKapp(slug) helper.
    invalidateKapp(state, slug) {
      if (slug) delete state.kappCache[slug];
    },
    // Writes a form array onto a cached kapp record at `kappCache[slug].forms`.
    // The bulk space fetch does NOT include forms (form definitions are too
    // heavy for an eager whole-space pull), so this is the only path that
    // populates the per-kapp form list — fired by refreshKappForms after the
    // Forms widget triggers its on-mount fetch. Stores metadata only (no
    // pages/elements/layout); see refreshKappForms for the include policy.
    setKappForms(state, { slug, forms }) {
      if (!slug || !state.kappCache[slug] || !Array.isArray(forms)) return;
      state.kappCache[slug].forms = forms;
    },
  },
);

/**
 * Returns the kapp record for the current global `kappSlug`, or null when no
 * kapp is loaded yet. Replaces every `useSelector(s => s.app.kapp)` reader.
 * Forward-compat: when per-container kapp context lands, this stays the
 * "global" selector and a separate helper handles scoped contexts.
 */
export const selectCurrentKapp = state => {
  const slug = state.app?.kappSlug;
  return slug ? state.app.kappCache?.[slug] || null : null;
};

/**
 * Returns a selector that reads the cached kapp for a specific slug. Useful
 * for widgets that pin to a kapp regardless of the current URL.
 *
 *   const services = useSelector(selectKappBySlug('services'));
 */
export const selectKappBySlug = slug => state =>
  slug ? state.app?.kappCache?.[slug] || null : null;

/**
 * Re-fetches a single kapp and writes it into the cache, overwriting whatever
 * was there. Use after a known mutation (or on user request) to bring the
 * cache back in line with the server.
 *
 * Resolves with the @kineticdata/react response so callers can detect errors
 * (`response.error`); on error nothing is written and the existing cache
 * entry is preserved.
 *
 *   const { kapp, error } = await bundle.refreshKapp('services');
 *
 * @param {string} slug The kapp slug to refresh.
 * @returns {Promise<{ kapp?: Object, error?: any }>}
 */
export const refreshKapp = async slug => {
  if (!slug || typeof slug !== 'string') {
    return { error: 'refreshKapp: slug must be a non-empty string.' };
  }
  const response = await fetchKapp({ kappSlug: slug, include: KAPP_INCLUDE });
  if (!response?.error) appActions.setKapp(response);
  return response;
};

/**
 * Re-fetches the space record with full kapp detail and refreshes the entire
 * cache — picks up newly added kapps, dropped kapps, and changes to any
 * existing kapp. Identical to the bootstrap fetch in App.jsx; safe to call
 * any time.
 *
 *   const { space, error } = await bundle.refreshKapps();
 *
 * @returns {Promise<{ space?: Object, error?: any }>}
 */
export const refreshKapps = async () => {
  const response = await fetchSpace({ include: SPACE_INCLUDE });
  if (!response?.error) appActions.setSpace(response);
  return response;
};

// Include string for the Forms-widget fetch. Metadata only — attributesMap and
// the category join records. Deliberately omits pages / elements / layout so
// the cache stays small (form definitions can be megabytes; we never need
// them for card rendering). formAttributeDefinitions live on the kapp record
// (populated by the bulk space fetch) and don't need to be re-fetched here.
export const FORMS_INCLUDE = 'attributesMap,categorizations,categorizations.category';

// Per-kapp in-flight fetch promises. Coalesces concurrent on-mount fetches so
// two Forms widgets pointed at the same kapp don't double-issue. Cleared once
// the promise settles. Cache miss + in-flight = await the existing promise;
// cache hit = no fetch.
const formsInFlight = new Map();

/**
 * Fetches every form in a kapp (metadata only — no layout) and writes the
 * resulting array to `state.app.kappCache[slug].forms`. Used both for the
 * initial on-mount populate (when the cache slot is undefined) and for
 * user-triggered refreshes. Concurrent callers for the same slug share one
 * HTTP request; the in-flight promise resolves with the @kineticdata/react
 * response shape so callers can inspect `response.error`.
 *
 * On error, the existing cache slot is preserved (call fails open, not
 * destructive — same contract as refreshKapp).
 *
 *   const { forms, error } = await bundle.refreshKappForms('services');
 *
 * @param {string} slug The kapp slug to refresh forms for.
 * @returns {Promise<{ forms?: Array, error?: any }>}
 */
export const refreshKappForms = async slug => {
  if (!slug || typeof slug !== 'string') {
    return { error: 'refreshKappForms: slug must be a non-empty string.' };
  }
  if (formsInFlight.has(slug)) return formsInFlight.get(slug);
  const promise = (async () => {
    const response = await fetchForms({
      kappSlug: slug,
      include: FORMS_INCLUDE,
      limit: 1000,
    });
    if (!response?.error && Array.isArray(response?.forms)) {
      appActions.setKappForms({ slug, forms: response.forms });
    }
    return response;
  })();
  formsInFlight.set(slug, promise);
  try {
    return await promise;
  } finally {
    formsInFlight.delete(slug);
  }
};

// Per-container state — published by each BundleContainer to broadcast its
// inner "current kapp" context to widgets rendered inside it. Keyed by
// container slotPath (auto-derived from mount position, collision-free across
// nested containers and same-id containers in different parts of the tree),
// not by user-provided id.
//
// Shape: { [slotPath]: { kappSlug: <slug> | null } }
//
// A widget rendered inside a container reads
// `state.containers[slotPath].kappSlug` through useKappContext (with
// kappSlug: 'auto') and observes the container's kapp instead of the global
// URL-driven kapp. Widgets outside any container fall through to the global
// state.app.kappSlug. See KAPP_CACHE.md for the full contract.
export const containerActions = regRedux(
  'containers',
  {},
  {
    setContainerKappSlug(state, { slot, slug }) {
      if (!slot) return;
      if (!state[slot]) state[slot] = {};
      state[slot].kappSlug = slug;
    },
    removeContainer(state, slot) {
      if (slot) delete state[slot];
    },
  },
);

/**
 * Returns the kapp slug published by the named container slot, or null when
 * no container with that slot has registered (or it's on a non-kapp path).
 */
export const selectContainerKappSlug = slot => state =>
  slot ? state.containers?.[slot]?.kappSlug ?? null : null;

// Cross-widget selection state — lets sibling widgets auto-bind to whatever
// another widget has drilled into, without explicit wiring through the
// designer's form bundle code.
//
// `categorySelection` is keyed by resolved kapp slug (Categories publishes,
// Forms reads). `teamSelection` is keyed by Teams widget id (Teams publishes,
// TeamMembers / Attributes read for `team: 'current'`). Different keying
// because multiple Teams widgets on one page each have their own breadcrumb
// state and shouldn't share, whereas Categories↔Forms naturally pairs per
// kapp.
export const widgetActions = regRedux(
  'widgets',
  { categorySelection: {}, teamSelection: {} },
  {
    setCategorySelection(state, { kappSlug, categorySlug }) {
      if (!kappSlug) return;
      if (categorySlug == null) {
        delete state.categorySelection[kappSlug];
      } else {
        state.categorySelection[kappSlug] = categorySlug;
      }
    },
    // Payload: { widgetId, team }. `team` is either null (clear) or
    // `{ name, slug }`. Clearing is also achievable by passing
    // `clearTeamSelection(widgetId)` below.
    setTeamSelection(state, { widgetId, team }) {
      if (!widgetId) return;
      if (team == null) {
        delete state.teamSelection[widgetId];
      } else {
        state.teamSelection[widgetId] = team;
      }
    },
    clearTeamSelection(state, widgetId) {
      if (widgetId) delete state.teamSelection[widgetId];
    },
  },
);

/**
 * Selector — reads the currently-selected category slug for a given kapp, or
 * null when nothing is selected. Used by the Forms widget's auto-bind path
 * when `config.categorySlug` is not set.
 */
export const selectCategorySelection = kappSlug => state =>
  kappSlug ? state.widgets?.categorySelection?.[kappSlug] ?? null : null;

/**
 * Selector — reads the currently-selected team published by a specific Teams
 * widget instance, or null when nothing is selected (e.g. user is browsing
 * the root level). Returns `{ name, slug }` when set. Consumed by
 * TeamMembers (and a future Attributes `target: 'current'` mode for
 * `type: 'team'`) to follow Teams' breadcrumb selection without designer
 * wiring beyond a `teamsWidgetId` config prop.
 */
export const selectTeamSelection = widgetId => state =>
  widgetId ? state.widgets?.teamSelection?.[widgetId] ?? null : null;

// Layout state — controls bundle-level chrome (Header, etc.). Pages set
// chromeHidden to render full-bleed (e.g. forms with Display Mode = fullscreen)
// and clear it on unmount so the rest of the portal keeps its chrome.
export const layoutActions = regRedux(
  'layout',
  { chromeHidden: false },
  {
    setChromeHidden(state, payload) {
      state.chromeHidden = !!payload;
    },
  },
);

// Modal stack — drives the global ModalSlot rendered in App.jsx. Stacked so a
// modal opened from inside another modal layers on top rather than replacing.
// Each entry: { id, type, path?, url?, size, title, closeOn }.
export const modalActions = regRedux(
  'modal',
  { stack: [] },
  {
    push(state, modal) {
      state.stack.push(modal);
    },
    remove(state, id) {
      state.stack = state.stack.filter(m => m.id !== id);
    },
    popTop(state) {
      state.stack.pop();
    },
    clear(state) {
      state.stack = [];
    },
  },
);

// State for the current view size of the app
const viewActions = regRedux(
  'view',
  { ...calcViewState() },
  {
    handleResize(state) {
      calcViewState(state);
    },
  },
);
// Register a resize handler to update the view state
window.addEventListener('resize', throttle(viewActions.handleResize, 200));

/**
 * Function that updates a state object with the latest view data
 * @param {Object} state
 * @returns {Object}
 */
function calcViewState(state = {}) {
  state.width = window.innerWidth;
  if (window.innerWidth < 640) {
    state.size = 'xs'; // 0 <-> 639
  } else if (window.innerWidth < 768) {
    state.size = 'sm'; // 640 <-> 767
  } else if (window.innerWidth < 1024) {
    state.size = 'md'; // 768 <-> 1023
  } else if (window.innerWidth < 1280) {
    state.size = 'lg'; // 1024 <-> 1279
  } else if (window.innerWidth < 1536) {
    state.size = 'xl'; // 1280 <-> 1535
  } else {
    state.size = '2xl'; // 1536 <-> ...
  }
  state.mobile = ['xs', 'sm'].includes(state.size);
  state.tablet = ['md', 'lg'].includes(state.size);
  state.desktop = ['xl', '2xl'].includes(state.size);
  return state;
}
