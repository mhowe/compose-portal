import { forwardRef, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { Icon } from '../../../atoms/Icon.jsx';

// Sizes are coherent sets — picking a size sets padding, icon size, and
// font size together so designers don't have to reason about three knobs.
// Keys match the canonical four-size set used across all chrome widgets
// that expose a `size` config (sm | md | lg | xl).
const SIZES = {
  sm: { btn: 'kbtn kbtn-ghost kbtn-sm', icon: 16 },
  md: { btn: 'kbtn kbtn-ghost', icon: 20 },
  lg: { btn: 'kbtn kbtn-ghost kbtn-lg', icon: 24 },
  xl: { btn: 'kbtn kbtn-ghost kbtn-xl', icon: 28 },
};

const SIZE_KEYS = Object.keys(SIZES);

/**
 * Plain React component that renders a configurable link's content. Exported
 * so future widgets that compose multiple links (e.g. a links-group widget)
 * can render N copies inside a single React root rather than mounting N
 * widget roots.
 *
 * Caller is responsible for putting this inside a `<Provider>` (chrome
 * widgets do that around the whole tree) and inside a div with the
 * `useInternalLinkInterceptor` onClickCapture handler so internal links
 * navigate the top-level app correctly.
 */
export const BundleLinkContent = ({ id, config = {}, mode = 'expanded' }) => {
  const {
    icon,
    text,
    iconPosition = 'left',
    clickAction,
    target,
    label,
    size,
    className,
  } = config;

  const sizeKey = SIZE_KEYS.includes(size) ? size : 'md';
  const sizeSpec = SIZES[sizeKey];

  // Hide the text label in rail mode when an icon is available — falling
  // back to the icon-only button shape. If no icon was configured, leave
  // the text visible so the link still has something to render.
  const hideText = mode === 'rail' && !!icon;

  // Designer-supplied className wins. Otherwise default to a ghost-button
  // styling that fits comfortably in a header. Add `kbtn-square` only when
  // the rendered shape is icon-only.
  const isIconOnly = !!icon && (!text || hideText);
  const computedClass = isIconOnly
    ? `${sizeSpec.btn} kbtn-square`
    : sizeSpec.btn;
  const finalClass = clsx(className ?? computedClass);

  const iconNode = icon ? <Icon name={icon} size={sizeSpec.icon} /> : null;
  const textNode = text && !hideText ? <span>{text}</span> : null;
  const right = iconPosition === 'right';

  return (
    <ClickActionWrapper
      clickAction={clickAction}
      target={target}
      label={label || text}
      widgetName="BundleLink"
      instanceId={id}
      className={finalClass}
    >
      {right ? (
        <>
          {textNode}
          {iconNode}
        </>
      ) : (
        <>
          {iconNode}
          {textNode}
        </>
      )}
    </ClickActionWrapper>
  );
};

const BundleLinkComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [mode, setMode] = useState('expanded');

  api.current.setMode = setMode;
  api.current.tooltip = config.tooltip ?? config.text ?? config.label;

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture} className="flex-initial">
          <BundleLinkContent id={id} config={config} mode={mode} />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (config.icon != null && typeof config.icon !== 'string') {
    console.error('BundleLink Widget Error: icon must be a string (Tabler icon name).');
    return false;
  }
  if (config.text != null && typeof config.text !== 'string') {
    console.error('BundleLink Widget Error: text must be a string.');
    return false;
  }
  if (
    config.iconPosition != null &&
    config.iconPosition !== 'left' &&
    config.iconPosition !== 'right'
  ) {
    console.error('BundleLink Widget Error: iconPosition must be "left" or "right".');
    return false;
  }
  if (config.size != null && !SIZE_KEYS.includes(config.size)) {
    console.error(
      `BundleLink Widget Error: size must be one of ${SIZE_KEYS.join(', ')}.`,
    );
    return false;
  }
  if (!validateTarget(config.target, 'BundleLink')) return false;
  if (config.label != null && typeof config.label !== 'string') {
    console.error('BundleLink Widget Error: label must be a string.');
    return false;
  }
  if (config.tooltip != null && typeof config.tooltip !== 'string') {
    console.error('BundleLink Widget Error: tooltip must be a string.');
    return false;
  }
  if (config.className != null && typeof config.className !== 'string') {
    console.error('BundleLink Widget Error: className must be a string.');
    return false;
  }
  if (!validateClickAction(config.clickAction, 'BundleLink')) return false;
  // Must have *something* to render.
  if (!config.icon && !config.text) {
    console.error(
      'BundleLink Widget Error: at least one of `icon` or `text` is required.',
    );
    return false;
  }
  return true;
};

/**
 * Initializes a BundleLink widget instance — a configurable icon + text link
 * with the same clickAction options as BundleLogo.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.BundleLink({
 *     container: K('content[Home Link]').element(),
 *     config: {
 *       icon: 'home',
 *       text: 'Home',
 *       clickAction: { type: 'home' },
 *     },
 *     id: 'home-link',
 *   });
 *
 * For text that depends on user/runtime state (e.g. "Welcome, Matthew"),
 * resolve the value form-side via Kinetic helpers BEFORE calling the widget;
 * widgets receive static config:
 *   bundle.widgets.BundleLink({
 *     container: K('content[Greeting]').element(),
 *     config: {
 *       icon: 'user',
 *       text: `Welcome, ${identity('attribute:First Name')}`,
 *       clickAction: { type: 'internal', path: '/profile' },
 *     },
 *     id: 'greeting',
 *   });
 *
 * clickAction shape (shared with BundleLogo):
 *   { type: 'none' }                              ← non-interactive
 *   { type: 'home' }                              ← runs landing resolver
 *   { type: 'internal', path: '/kapps/services' } ← top-level path
 *   { type: 'external', url: 'https://...' }      ← external URL
 *   { type: 'event', name: 'my-event' }           ← CustomEvent
 *
 * For `type: 'event'`, listen with `bundle.utils.onWidgetEvent(name, handler)`.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} config Configuration object. At least one of `icon` or
 *   `text` is required; everything else is optional.
 * @param {string} [config.icon] Tabler icon name (e.g. 'home', 'border-all').
 *   Invalid names render as a marked "missing" icon.
 * @param {string} [config.text] Visible label.
 * @param {string} [config.iconPosition] 'left' (default) or 'right'.
 * @param {Object} [config.clickAction] Discriminated by `type`. See above.
 *   Default `{ type: 'none' }`.
 * @param {string|Object} [config.target] 'current' (default), 'new', 'modal',
 *   or `{ type: 'container', id, replace? }` to render inline inside a named
 *   BundleContainer. Modal object form: `{ type: 'modal', size, title, closeOn }`
 *   (size sm|md|lg|xl|full, closeOn any subset of ['esc','backdrop','button']).
 *   String shorthand applies defaults. See CHROME_ACTIONS.md.
 * @param {string} [config.label] Accessibility label override. Auto-derived
 *   from `text` when not provided (and from clickAction type for some cases).
 * @param {string} [config.size] 'sm' | 'md' (default) | 'lg' | 'xl'. Sets
 *   padding, icon size, and font size as a coherent set. Same four-size
 *   set used by other chrome widgets that expose a `size` config.
 * @param {string} [config.className] Override the default ghost-button
 *   styling. Use DaisyUI semantic classes (e.g. 'kbtn kbtn-primary'), not
 *   raw Tailwind utility chains.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking. Multiple BundleLink instances on the same page should each
 *   get a distinct id.
 */
export const BundleLink = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleLink');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleLink, {
      container: resolved,
      Component: BundleLinkComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleLink widget parameters are invalid. See the console for more details.',
  );
};
