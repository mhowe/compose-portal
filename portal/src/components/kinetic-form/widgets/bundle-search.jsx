import { forwardRef, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { BundleLinkContent } from './bundle-link.jsx';
import { store } from '../../../redux.js';

const DEFAULT_CONFIG = {
  icon: 'search',
  // Default clickAction opens the bundle's built-in search modal in the
  // searchOnly UI (autofocused input + results, no categories carousel).
  // Designers wanting the full UI write `clickAction: { type: 'openSearch',
  // mode: 'full' }`. Designers wanting their own search experience pick a
  // different clickAction entirely (event, internal, etc.) — the widget is
  // genuinely just a styled trigger.
  clickAction: { type: 'openSearch', mode: 'searchOnly' },
};

const BundleSearchComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [mode, setMode] = useState('expanded');
  // Designer config overrides defaults; shallow merge is enough since the
  // primitive fields don't nest meaningfully here.
  const merged = { ...DEFAULT_CONFIG, ...config };

  api.current.setMode = setMode;
  api.current.tooltip = config.tooltip ?? merged.text ?? 'Search';

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture} className="flex-initial">
          <BundleLinkContent id={id} config={merged} mode={mode} />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (config.icon != null && typeof config.icon !== 'string') {
    console.error('BundleSearch Widget Error: icon must be a string.');
    return false;
  }
  if (config.text != null && typeof config.text !== 'string') {
    console.error('BundleSearch Widget Error: text must be a string.');
    return false;
  }
  if (
    config.iconPosition != null &&
    config.iconPosition !== 'left' &&
    config.iconPosition !== 'right'
  ) {
    console.error(
      'BundleSearch Widget Error: iconPosition must be "left" or "right".',
    );
    return false;
  }
  if (
    config.size != null &&
    !['sm', 'md', 'lg', 'xl'].includes(config.size)
  ) {
    console.error(
      'BundleSearch Widget Error: size must be one of sm, md, lg, xl.',
    );
    return false;
  }
  if (config.label != null && typeof config.label !== 'string') {
    console.error('BundleSearch Widget Error: label must be a string.');
    return false;
  }
  if (config.tooltip != null && typeof config.tooltip !== 'string') {
    console.error('BundleSearch Widget Error: tooltip must be a string.');
    return false;
  }
  if (config.className != null && typeof config.className !== 'string') {
    console.error('BundleSearch Widget Error: className must be a string.');
    return false;
  }
  if (!validateTarget(config.target, 'BundleSearch')) return false;
  if (!validateClickAction(config.clickAction, 'BundleSearch')) return false;
  return true;
};

/**
 * Initializes a BundleSearch widget instance — a styled trigger that opens
 * the bundle's search modal by default. Built as a thin wrapper around
 * BundleLinkContent with `clickAction: { type: 'openSearch', mode: 'searchOnly' }`
 * pre-applied; the same Link-style visual config (icon, text, size, etc.)
 * applies, and any clickAction can be overridden if a designer wants the
 * trigger to do something else (custom event, internal route, etc.).
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.BundleSearch({
 *     container: K('content[Search]').element(),
 *     id: 'search',
 *   });
 *
 * Open the full search experience (categories + popular):
 *   bundle.widgets.BundleSearch({
 *     container: K('content[Search]').element(),
 *     config: {
 *       text: 'Submit a Request',
 *       clickAction: { type: 'openSearch', mode: 'full' },
 *     },
 *     id: 'search',
 *   });
 *
 * Wire the trigger to a custom search experience (form designer handles it):
 *   bundle.widgets.BundleSearch({
 *     container: K('content[Search]').element(),
 *     config: {
 *       clickAction: { type: 'event', name: 'open-my-search' },
 *     },
 *     id: 'search',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] All fields optional. Supports the same visual
 *   options as BundleLink (icon, text, iconPosition, size, label, className)
 *   plus the shared clickAction / target.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const BundleSearch = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleSearch');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleSearch, {
      container: resolved,
      Component: BundleSearchComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleSearch widget parameters are invalid. See the console for more details.',
  );
};
