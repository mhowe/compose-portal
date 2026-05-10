import { useCallback } from 'react';
import { openSearch } from '../../../helpers/search.js';
import { openModal } from './utils.js';

/* ------------------------------------------------------------------ */
/* BundleChrome mode constants and registry                           */
/*                                                                    */
/* The registry is a small pub/sub keyed by chrome id, used by        */
/* BundleChrome to publish state changes and by BundleChromeToggle    */
/* (and any other interested widget) to subscribe.                    */
/*                                                                    */
/* Subscriptions can be added BEFORE a chrome registers — they're     */
/* held on the emitter and fired as soon as the chrome emits its      */
/* first event. This is what lets a hamburger toggle in the header    */
/* drive a per-kapp chrome that hasn't loaded yet.                    */
/* ------------------------------------------------------------------ */

export const CHROME_MODES = ['expanded', 'rail', 'hidden'];
export const CHROME_MODE_CLASS = {
  expanded: 'kd-chrome-mode-expanded',
  rail: 'kd-chrome-mode-rail',
  hidden: 'kd-chrome-mode-hidden',
};
export const CHROME_MODE_CLASSES = Object.values(CHROME_MODE_CLASS);

const chromeRegistry = {
  emitters: {}, // id -> { event -> Set<fn> }
  controllers: {}, // id -> controller object
};

const getEmitter = id => {
  if (!chromeRegistry.emitters[id]) chromeRegistry.emitters[id] = {};
  return chromeRegistry.emitters[id];
};

export const chromeOn = (id, event, fn) => {
  const emitter = getEmitter(id);
  if (!emitter[event]) emitter[event] = new Set();
  emitter[event].add(fn);
};

export const chromeOff = (id, event, fn) => {
  const emitter = chromeRegistry.emitters[id];
  if (emitter && emitter[event]) emitter[event].delete(fn);
};

export const chromeEmit = (id, event, payload) => {
  const emitter = chromeRegistry.emitters[id];
  if (!emitter || !emitter[event]) return;
  for (const fn of emitter[event]) {
    try {
      fn(payload);
    } catch (e) {
      console.error(
        `BundleChrome[${id}] ${event} listener error:`,
        e,
      );
    }
  }
};

export const chromeRegister = (id, controller) => {
  chromeRegistry.controllers[id] = controller;
};

export const chromeUnregister = id => {
  delete chromeRegistry.controllers[id];
  // Keep the emitter — late subscribers may still listen for a future remount
  // under the same id (e.g., kapp nav remounting on kapp change).
};

export const chromeGetController = id => chromeRegistry.controllers[id];

/**
 * Click interceptor for chrome widgets — see project_chrome_widgets.md.
 *
 * Why this exists: chrome widgets mount in their own React tree (via
 * `createRoot`) with their own HashRouter, separate from the top-level app's
 * HashRouter. When react-router's `Link` calls `history.push`, `history` v5
 * uses `pushState` under the hood, which updates the URL hash but does NOT
 * fire any event the top-level router (in a different React tree) listens
 * to. The URL bar updates, but the top-level app doesn't route.
 *
 * The fix: attach this onClickCapture handler on a wrapping div around the
 * chrome content. It catches clicks on internal anchors before react-router's
 * Link.onClick runs, and navigates by assigning `window.location.hash`
 * directly — a real browser hash assignment that fires a real `hashchange`
 * event both routers reliably react to.
 *
 * `preventDefault` disables both the browser's default anchor navigation
 * AND react-router's Link.navigate (which checks `event.defaultPrevented`).
 * We deliberately do NOT `stopPropagation` — other handlers in the bubble
 * chain (popover close-on-click, etc.) still need to run.
 *
 * Skips: modified clicks (cmd/ctrl/shift/alt → user wants new tab),
 * non-primary buttons, anchors with `target="_blank"`, and external/absolute
 * URLs (browser handles those normally).
 */
export const useInternalLinkInterceptor = () =>
  useCallback(e => {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = e.target.closest && e.target.closest('a');
    if (!anchor) return;
    if (anchor.target === '_blank') return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    let path;
    if (href.startsWith('#/')) {
      path = href.slice(1); // "#/foo" → "/foo"
    } else if (href.startsWith('/')) {
      path = href; // bare "/foo"
    } else {
      return; // external or other; let the browser handle it
    }
    e.preventDefault();
    window.location.hash = path;
  }, []);

/* ------------------------------------------------------------------ */
/* clickAction — discriminated union shared across chrome widgets     */
/*                                                                    */
/*   { type: 'none' }                                                 */
/*   { type: 'home' }                                                 */
/*   { type: 'internal', path: '/kapps/...' }                         */
/*   { type: 'external', url: 'https://...' }                         */
/*   { type: 'event', name: 'my-event' }                              */
/*   { type: 'openSearch', mode: 'searchOnly' | 'full' }              */
/* ------------------------------------------------------------------ */

export const CLICK_ACTION_TYPES = [
  'none',
  'home',
  'internal',
  'external',
  'event',
  'openSearch',
];

const SEARCH_MODES = ['searchOnly', 'full'];

export const validateClickAction = (clickAction, widgetName = 'Widget') => {
  if (clickAction == null) return true;
  if (typeof clickAction !== 'object') {
    console.error(
      `${widgetName} Widget Error: clickAction must be an object.`,
    );
    return false;
  }
  if (!CLICK_ACTION_TYPES.includes(clickAction.type)) {
    console.error(
      `${widgetName} Widget Error: clickAction.type must be one of ${CLICK_ACTION_TYPES.join(', ')}.`,
    );
    return false;
  }
  if (clickAction.type === 'internal') {
    if (
      typeof clickAction.path !== 'string' ||
      !clickAction.path.startsWith('/')
    ) {
      console.error(
        `${widgetName} Widget Error: clickAction.path is required for type='internal' and must start with '/'.`,
      );
      return false;
    }
  }
  if (clickAction.type === 'external') {
    if (
      typeof clickAction.url !== 'string' ||
      clickAction.url.length === 0
    ) {
      console.error(
        `${widgetName} Widget Error: clickAction.url is required for type='external'.`,
      );
      return false;
    }
  }
  if (clickAction.type === 'event') {
    if (
      typeof clickAction.name !== 'string' ||
      clickAction.name.length === 0
    ) {
      console.error(
        `${widgetName} Widget Error: clickAction.name is required for type='event'.`,
      );
      return false;
    }
  }
  if (clickAction.type === 'openSearch') {
    if (clickAction.mode != null && !SEARCH_MODES.includes(clickAction.mode)) {
      console.error(
        `${widgetName} Widget Error: clickAction.mode must be one of ${SEARCH_MODES.join(', ')}.`,
      );
      return false;
    }
  }
  return true;
};

/* ------------------------------------------------------------------ */
/* target — also a discriminated union, but accepts either a simple   */
/* string ('current' | 'new' | 'modal') or an object form.            */
/*                                                                    */
/*   'current'    ↔ { type: 'current' }                               */
/*   'new'        ↔ { type: 'new' }                                   */
/*   'modal'      ↔ { type: 'modal' }   (defaults applied)            */
/*   { type: 'modal', size, title, closeOn }                          */
/*   { type: 'container', id, replace }                               */
/*     — Navigate a named BundleContainer inline. Only meaningful     */
/*       with clickAction.type 'home' or 'internal'; for 'external'   */
/*       falls through to standard anchor (containers render bundle   */
/*       pages, not arbitrary URLs). Ignored entirely for 'event' /   */
/*       'openSearch' (those clickAction types ignore target).        */
/* ------------------------------------------------------------------ */

export const TARGET_TYPES = ['current', 'new', 'modal', 'container'];
const MODAL_SIZES = ['sm', 'md', 'lg', 'xl', 'full'];
const MODAL_CLOSE_OPTIONS = ['esc', 'backdrop', 'button'];
const DEFAULT_MODAL_CLOSE_ON = ['esc', 'backdrop', 'button'];

/**
 * Normalizes `target` into a consistent object shape regardless of how the
 * designer wrote it. String form ('current' | 'new' | 'modal') is sugar for
 * `{ type: <string> }`. Modal-specific options (size, title, closeOn) only
 * meaningful when type is 'modal'.
 */
export const normalizeTarget = target => {
  if (typeof target === 'string') return { type: target };
  if (target && typeof target === 'object') return target;
  return { type: 'current' };
};

export const validateTarget = (target, widgetName = 'Widget') => {
  if (target == null) return true;
  const normalized = normalizeTarget(target);
  if (!TARGET_TYPES.includes(normalized.type)) {
    console.error(
      `${widgetName} Widget Error: target.type must be one of ${TARGET_TYPES.join(', ')}.`,
    );
    return false;
  }
  if (normalized.type === 'modal') {
    if (
      normalized.size != null &&
      !MODAL_SIZES.includes(normalized.size)
    ) {
      console.error(
        `${widgetName} Widget Error: target.size must be one of ${MODAL_SIZES.join(', ')}.`,
      );
      return false;
    }
    if (normalized.title != null && typeof normalized.title !== 'string') {
      console.error(
        `${widgetName} Widget Error: target.title must be a string.`,
      );
      return false;
    }
    if (normalized.closeOn != null) {
      if (!Array.isArray(normalized.closeOn)) {
        console.error(
          `${widgetName} Widget Error: target.closeOn must be an array of close mechanisms (e.g. ['esc', 'backdrop', 'button']).`,
        );
        return false;
      }
      const invalid = normalized.closeOn.filter(
        c => !MODAL_CLOSE_OPTIONS.includes(c),
      );
      if (invalid.length > 0) {
        console.error(
          `${widgetName} Widget Error: target.closeOn entries must be one of ${MODAL_CLOSE_OPTIONS.join(', ')}. Got: ${invalid.join(', ')}.`,
        );
        return false;
      }
    }
    if (
      normalized.onClose != null &&
      typeof normalized.onClose !== 'function'
    ) {
      console.error(
        `${widgetName} Widget Error: target.onClose must be a function when provided.`,
      );
      return false;
    }
  }
  if (normalized.type === 'container') {
    if (typeof normalized.id !== 'string' || normalized.id.length === 0) {
      console.error(
        `${widgetName} Widget Error: target.id is required for type='container' and must be a non-empty string.`,
      );
      return false;
    }
    if (normalized.replace != null && typeof normalized.replace !== 'boolean') {
      console.error(
        `${widgetName} Widget Error: target.replace must be a boolean.`,
      );
      return false;
    }
  }
  return true;
};

// Auto-derived accessibility label when the form designer doesn't provide
// `label` themselves. Returns undefined for cases where the designer should
// supply their own.
const getDefaultLabel = clickAction => {
  if (!clickAction || clickAction.type === 'none') return undefined;
  if (clickAction.type === 'home') return 'Home';
  if (clickAction.type === 'openSearch') return 'Search';
  if (clickAction.type === 'external') {
    try {
      return `Open ${new URL(clickAction.url).hostname}`;
    } catch {
      return 'External link';
    }
  }
  return undefined;
};

// Builds the modal config for a clickAction whose target is 'modal'. Pulled
// out so the wrapper's render logic stays focused on element selection.
const buildModalConfigForClickAction = (clickAction, targetSpec) => {
  const base = {
    size: targetSpec.size || 'md',
    title: targetSpec.title,
    closeOn: targetSpec.closeOn || DEFAULT_MODAL_CLOSE_ON,
    onClose: targetSpec.onClose,
  };
  if (clickAction.type === 'home') return { ...base, type: 'internal', path: '/' };
  if (clickAction.type === 'internal')
    return { ...base, type: 'internal', path: clickAction.path };
  if (clickAction.type === 'external')
    return { ...base, type: 'external', url: clickAction.url };
  return null;
};

/**
 * Renders the appropriate wrapper element for a chrome widget's clickAction
 * + target combination. Chrome widgets call this around their visible
 * content (an `<img>` for BundleLogo, an avatar for BundleAvatar, etc.) to
 * get consistent navigation behavior, accessibility, modal handling, and
 * event dispatch.
 *
 * Element selection:
 *  - clickAction 'none' → `<span>` (non-interactive)
 *  - clickAction 'event' → `<button>` (target ignored — event handler owns the destination)
 *  - clickAction 'openSearch' → `<button>` (search modal already handles itself)
 *  - target 'modal' (with internal/home/external) → `<button>` (opens modal on click)
 *  - target 'current' or 'new' (with internal/home/external) → `<a>` (anchor)
 */
export const ClickActionWrapper = ({
  clickAction,
  target,
  label,
  widgetName,
  instanceId,
  className,
  children,
}) => {
  const effectiveLabel = label ?? getDefaultLabel(clickAction);
  const targetSpec = normalizeTarget(target);

  if (!clickAction || clickAction.type === 'none') {
    return (
      <span className={className} aria-label={effectiveLabel}>
        {children}
      </span>
    );
  }

  if (clickAction.type === 'event') {
    const handle = () => {
      window.dispatchEvent(
        new CustomEvent(clickAction.name, {
          detail: {
            widget: widgetName,
            id: instanceId,
            config: clickAction,
          },
        }),
      );
    };
    return (
      <button
        type="button"
        onClick={handle}
        aria-label={effectiveLabel}
        className={className}
      >
        {children}
      </button>
    );
  }

  if (clickAction.type === 'openSearch') {
    const mode = clickAction.mode || 'searchOnly';
    const handle = () => openSearch({ searchOnly: mode === 'searchOnly' });
    return (
      <button
        type="button"
        onClick={handle}
        aria-label={effectiveLabel}
        className={className}
      >
        {children}
      </button>
    );
  }

  // home / internal / external from here on.
  if (targetSpec.type === 'modal') {
    const modalConfig = buildModalConfigForClickAction(clickAction, targetSpec);
    const handle = () => openModal(modalConfig);
    return (
      <button
        type="button"
        onClick={handle}
        aria-label={effectiveLabel}
        className={className}
      >
        {children}
      </button>
    );
  }

  // Container target — navigate a named BundleContainer inline. Only meaningful
  // for home/internal (containers render bundle pages, not external URLs); for
  // external we fall through to the standard anchor branch below.
  if (
    targetSpec.type === 'container' &&
    (clickAction.type === 'home' || clickAction.type === 'internal')
  ) {
    const path = clickAction.type === 'home' ? '/' : clickAction.path;
    const handle = () => {
      window.dispatchEvent(
        new CustomEvent('bundle:container:navigate', {
          detail: {
            id: targetSpec.id,
            path,
            replace: !!targetSpec.replace,
          },
        }),
      );
    };
    return (
      <button
        type="button"
        onClick={handle}
        aria-label={effectiveLabel}
        className={className}
      >
        {children}
      </button>
    );
  }

  // current / new — anchor navigation.
  const targetAttr = targetSpec.type === 'new' ? '_blank' : undefined;
  const rel = targetAttr === '_blank' ? 'noopener noreferrer' : undefined;

  if (clickAction.type === 'home' || clickAction.type === 'internal') {
    const path = clickAction.type === 'home' ? '/' : clickAction.path;
    return (
      <a
        href={`#${path}`}
        target={targetAttr}
        rel={rel}
        aria-label={effectiveLabel}
        className={className}
      >
        {children}
      </a>
    );
  }

  if (clickAction.type === 'external') {
    return (
      <a
        href={clickAction.url}
        target={targetAttr}
        rel={rel}
        aria-label={effectiveLabel}
        className={className}
      >
        {children}
      </a>
    );
  }

  return children;
};
