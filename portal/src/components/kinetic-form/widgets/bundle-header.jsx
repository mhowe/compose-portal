import { forwardRef, useRef } from 'react';
import { Provider } from 'react-redux';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { useInternalLinkInterceptor } from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { HeaderContent } from '../../header/Header.jsx';

/**
 * Renders the bundle's standard header inline at the widget's mount point.
 * Same content as the auto-rendered top-level header (logo, all-kapps grid,
 * search, avatar, menu popover) — reused via the shared `HeaderContent`
 * component, which keeps this widget in lockstep with the rest of the
 * bundle's UX.
 *
 * Differences from the auto-rendered top-level header:
 *  - Renders inline at the widget's container (no `#app-header` portal),
 *    so it sits where the form designer placed it.
 *  - Always renders, regardless of `state.layout.chromeHidden` — the form
 *    designer placed it on purpose, so we don't second-guess via global
 *    chrome state.
 *
 * Navigation behavior: links inside the header (`/`, `/kapps`, `/profile`,
 * etc.) update `window.location.hash` via the widget's HashRouter, which
 * the top-level app's HashRouter also reads — clicking the logo navigates
 * the *application*, not just the widget. This matches what users expect
 * from chrome.
 */
const BundleHeaderComponent = forwardRef((_props, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture}>
          <HeaderContent />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

/**
 * Initializes a BundleHeader widget instance.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.BundleHeader({
 *     container: K('content[Header]').element(),
 *   });
 *
 * Place markup or other widgets above/below this widget in your form to
 * augment the header — e.g. an environment marker bar, a system alert,
 * or custom branding.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking. Multiple BundleHeader instances on the same page should each
 *   get a distinct id.
 */
export const BundleHeader = ({ container, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleHeader');
  if (resolved) {
    return registerWidget(BundleHeader, {
      container: resolved,
      Component: BundleHeaderComponent,
      props: {},
      id,
    });
  }
  return Promise.reject(
    'The BundleHeader widget parameters are invalid. See the console for more details.',
  );
};
