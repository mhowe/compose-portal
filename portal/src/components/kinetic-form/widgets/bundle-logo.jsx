import { forwardRef, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import bundledLogo from '../../../assets/images/logo.svg';

const SIZE_CLASSES = {
  sm: 'h-6 max-w-32',
  md: 'h-10 max-w-45', // matches the @utility logo size used by the auto-rendered header
  lg: 'h-14 max-w-60',
  xl: 'h-20 max-w-80',
};

const SIZES = Object.keys(SIZE_CLASSES);

const LogoImage = ({ src, size }) => {
  // Theme logo lives in redux state; falls back to the bundled svg.
  const themeLogo = useSelector(state => state.theme?.data?.logo?.default);
  let imgSrc;
  if (src == null || src === 'theme') {
    imgSrc = themeLogo || bundledLogo;
  } else if (src === 'bundled') {
    imgSrc = bundledLogo;
  } else {
    // Treat as an explicit URL (string).
    imgSrc = src;
  }
  return (
    <img
      src={imgSrc}
      alt=""
      className={clsx(
        'w-full object-contain',
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
      )}
    />
  );
};

const BundleLogoComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [mode, setMode] = useState('expanded');

  // Mode-aware api exposure. Synchronous mutation on a local ref is
  // idempotent and ensures `setMode` is on the api object the moment the
  // widget's promise resolves — so chrome can call it during initial mount.
  api.current.setMode = setMode;
  api.current.tooltip = config.tooltip ?? config.label;

  // In rail mode, use the rail-specific src/size if provided; otherwise
  // fall back to the expanded values but force a smaller default size so
  // the logo fits within a typical rail strip.
  const isRail = mode === 'rail';
  const effectiveSrc = isRail ? (config.railSrc ?? config.src) : config.src;
  const effectiveSize = isRail
    ? (config.railSize ?? 'sm')
    : config.size;

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture} className="flex-initial">
          <ClickActionWrapper
            clickAction={config.clickAction}
            target={config.target}
            label={config.label}
            widgetName="BundleLogo"
            instanceId={id}
            className="flex-initial inline-block"
          >
            <LogoImage src={effectiveSrc} size={effectiveSize} />
          </ClickActionWrapper>
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (config.src != null && typeof config.src !== 'string') {
    console.error(
      'BundleLogo Widget Error: src must be a string ("theme", "bundled", or an image URL).',
    );
    return false;
  }
  if (config.size != null && !SIZES.includes(config.size)) {
    console.error(
      `BundleLogo Widget Error: size must be one of ${SIZES.join(', ')}.`,
    );
    return false;
  }
  if (config.railSrc != null && typeof config.railSrc !== 'string') {
    console.error(
      'BundleLogo Widget Error: railSrc must be a string ("theme", "bundled", or an image URL).',
    );
    return false;
  }
  if (config.railSize != null && !SIZES.includes(config.railSize)) {
    console.error(
      `BundleLogo Widget Error: railSize must be one of ${SIZES.join(', ')}.`,
    );
    return false;
  }
  if (config.tooltip != null && typeof config.tooltip !== 'string') {
    console.error('BundleLogo Widget Error: tooltip must be a string.');
    return false;
  }
  if (!validateTarget(config.target, 'BundleLogo')) return false;
  if (config.label != null && typeof config.label !== 'string') {
    console.error('BundleLogo Widget Error: label must be a string.');
    return false;
  }
  if (!validateClickAction(config.clickAction, 'BundleLogo')) return false;
  return true;
};

/**
 * Initializes a BundleLogo widget instance.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.BundleLogo({
 *     container: K('content[Logo]').element(),
 *     config: {
 *       src: 'theme',                // 'theme' (default) | 'bundled' | URL
 *       size: 'md',                  // 'sm' | 'md' | 'lg' | 'xl'
 *       clickAction: { type: 'home' },
 *       target: 'current',           // 'current' (default) | 'new'
 *       label: 'Go home',            // optional; auto-derived for some types
 *     },
 *     id: 'logo',
 *   });
 *
 * clickAction shape:
 *   { type: 'none' }                              ← non-interactive
 *   { type: 'home' }                              ← runs landing resolver
 *   { type: 'internal', path: '/kapps/services' } ← top-level path
 *   { type: 'external', url: 'https://...' }      ← external URL
 *   { type: 'event', name: 'logo-clicked' }       ← CustomEvent
 *
 * For `type: 'event'`, listen on the form side via the bundle helper —
 * which is safe to call on every form load (replaces any prior handler
 * for the same event name, so listeners don't pile up across re-renders):
 *   bundle.utils.onWidgetEvent('logo-clicked', e => {
 *     // e.detail = { widget: 'BundleLogo', id, config: <clickAction> }
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] Configuration object — all fields optional.
 * @param {string} [config.src] Image source. 'theme' (default) reads the
 *   bundle's themed logo and falls back to the bundled svg. 'bundled' uses
 *   the bundled svg directly. Any other string is treated as an image URL.
 * @param {string} [config.size] One of 'sm' | 'md' | 'lg' | 'xl'. Default 'md'.
 * @param {Object} [config.clickAction] Discriminated by `type`. See above.
 *   Default `{ type: 'none' }`.
 * @param {string|Object} [config.target] 'current' (default), 'new', 'modal',
 *   or `{ type: 'container', id, replace? }` to render inline inside a named
 *   BundleContainer. Modal object form: `{ type: 'modal', size, title, closeOn }`
 *   (size sm|md|lg|xl|full, closeOn any subset of ['esc','backdrop','button']).
 *   Ignored for `type: 'none'` and `type: 'event'`. See CHROME_ACTIONS.md.
 * @param {string} [config.label] Accessibility label / tooltip. Auto-derived
 *   for `type: 'home'` and `type: 'external'` when not provided.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking. Multiple BundleLogo instances on the same page should each
 *   get a distinct id.
 */
export const BundleLogo = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleLogo');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleLogo, {
      container: resolved,
      Component: BundleLogoComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleLogo widget parameters are invalid. See the console for more details.',
  );
};
