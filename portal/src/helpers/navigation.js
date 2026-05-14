// Module-level handle to the React Router navigate function, populated by
// <NavBridge /> on mount. Stays null until the router has mounted — see
// `navigate()` for the fallback behavior in that window.
let _navigate = null;

/**
 * Internal — used by <NavBridge /> to register or clear the live impl.
 * Not part of the bundle-facing API.
 */
export const setNavigateImpl = impl => {
  _navigate = impl;
};

/**
 * Bundle-facing SPA navigation helper. Exposed to Kinetic forms as
 * `bundle.utils.navigate`. Prefer this over `window.location.href` for
 * in-bundle paths so the React tree stays mounted (no re-fetch of space /
 * profile / kapps) and back-arrow state can ride along.
 *
 * Defaults the destination's back affordance to the current page by capturing
 * `pathname + search` at call time and attaching it as `location.state.backPath`,
 * which `PageHeading` reads before falling back to a page's own `backTo` prop.
 *
 * @param {string} to Bundle path starting with `/` (e.g. `/settings/space`).
 * @param {object} [options]
 * @param {string|null|false} [options.backTo] Override the back target.
 *   Omitted → auto-capture current page. `null`/`false` → suppress entirely
 *   so the destination's own `backTo` wins.
 * @param {boolean} [options.replace] Replace the current history entry
 *   instead of pushing a new one.
 * @param {object} [options.state] Additional state to merge into the
 *   destination's `location.state`.
 */
export const navigate = (to, options = {}) => {
  if (typeof to !== 'string' || !to.startsWith('/')) {
    console.error(
      'bundle.utils.navigate: `to` must be a bundle path starting with "/".',
    );
    return;
  }
  if (!_navigate) {
    console.warn(
      'bundle.utils.navigate called before the router mounted — falling back to window.location. Any backTo state will be lost.',
    );
    window.location.href = `/#${to}`;
    return;
  }
  _navigate(to, options);
};
