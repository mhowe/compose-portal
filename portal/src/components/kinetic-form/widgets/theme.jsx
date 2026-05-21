import { forwardRef, useRef } from 'react';
import { Provider } from 'react-redux';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { Theme as ThemePage } from '../../../pages/theme/index.jsx';

// The widget is intentionally a thin shell over the page-level Theme
// component. The page resolves its target via (in order): explicit
// kappSlug prop → URL :kappSlug param → current kapp. Inside a widget
// HashRouter the URL param is never present, so the prop fully controls
// scope here: provide config.kappSlug to edit a specific kapp's theme,
// or leave it out (with target='space') to edit the space theme.

const ThemeWidgetComponent = forwardRef(({ target, kappSlug }, ref) => {
  const api = useRef({});
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <ThemePage target={target} kappSlug={kappSlug} />
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (config.kappSlug != null && typeof config.kappSlug !== 'string') {
    console.error(
      'Theme Widget Error: config.kappSlug must be a string when provided.',
    );
    return false;
  }
  if (config.kappSlug && config.kappSlug === '') {
    console.error(
      'Theme Widget Error: config.kappSlug must be a non-empty string.',
    );
    return false;
  }
  if (config.target != null && config.target !== 'space' && config.target !== 'kapp') {
    console.error(
      'Theme Widget Error: config.target must be either "space" or "kapp".',
    );
    return false;
  }
  return true;
};

/**
 * Initializes a Theme widget instance.
 *
 * Embeds the bundle's theme editor inside a form, scoped to either a
 * specific kapp (provide `config.kappSlug`) or the space as a whole
 * (provide `config.target: 'space'`). When neither is set, the widget
 * targets whichever kapp the rest of the bundle considers current.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container DOM element or
 *   `K('content[Name]').element()` array-like.
 * @param {Object} [config]
 * @param {string} [config.kappSlug] Slug of the kapp whose theme this
 *   instance edits. Mutually exclusive with `config.target: 'space'`.
 * @param {'space'|'kapp'} [config.target] Set to `'space'` to edit the
 *   space-level theme. Default `'kapp'`.
 * @param {string} [id] Optional id for instance tracking.
 */
export const Theme = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Theme');
  if (resolved && validateConfig(config)) {
    return registerWidget(Theme, {
      container: resolved,
      Component: ThemeWidgetComponent,
      props: {
        target: config.target || 'kapp',
        kappSlug: config.kappSlug,
      },
      id,
    });
  }
  return Promise.reject(
    'The Theme widget parameters are invalid. See the console for more details.',
  );
};
