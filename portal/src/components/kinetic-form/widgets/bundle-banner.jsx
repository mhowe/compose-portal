import { forwardRef, useRef } from 'react';
import { Provider, useSelector } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { readAttribute } from '../../../helpers/setup.js';

// Semantic color buckets that resolve to a kbanner-* utility. `hide` is a
// recognized bucket too — values matching it cause the banner to render
// nothing — but it has no associated color class.
const COLOR_KEYS = ['error', 'warning', 'success', 'info', 'neutral'];
const BUCKET_KEYS = [...COLOR_KEYS, 'hide'];

const COLOR_CLASSES = {
  error: 'kbanner-error',
  warning: 'kbanner-warning',
  success: 'kbanner-success',
  info: 'kbanner-info',
  neutral: 'kbanner-neutral',
};

// Default mapping for the common environment-indicator use case. Designers
// extend (not replace) these by passing their own `mapping` config.
const DEFAULT_MAPPING = {
  error: ['dev', 'development', 'devel', 'sandbox', 'local'],
  warning: ['test', 'testing', 'tst', 'uat', 'staging', 'stage', 'qa', 'demo'],
  success: [],
  info: [],
  neutral: [],
  hide: ['prod', 'production', 'live', 'prd'],
};

// Merges user-supplied mapping into the defaults — extend, don't replace.
// A bucket the user doesn't mention keeps its default words.
const mergeMapping = userMapping => {
  if (!userMapping) return DEFAULT_MAPPING;
  const out = {};
  for (const bucket of BUCKET_KEYS) {
    const userList = Array.isArray(userMapping[bucket])
      ? userMapping[bucket]
      : [];
    out[bucket] = [...DEFAULT_MAPPING[bucket], ...userList];
  }
  return out;
};

// Looks up a value (case-insensitive, trimmed) against the merged mapping.
// Returns the bucket name or null. Bucket order matters only when a value
// is duplicated across buckets — first match wins; we order error → warning
// → ... → hide so a designer who lists prod-words under both error and hide
// gets error precedence, but in practice bucket lists shouldn't overlap.
const resolveBucket = (value, mapping) => {
  if (typeof value !== 'string' || value.length === 0) return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  for (const bucket of BUCKET_KEYS) {
    if ((mapping[bucket] || []).some(w => w.toLowerCase() === needle)) {
      return bucket;
    }
  }
  return null;
};

// Replaces `{{value}}` (with optional internal whitespace) in `template` with
// the resolved attribute value. For richer interpolation, designers compose
// the string form-side and pass it as `template` directly.
const interpolate = (template, value) =>
  (template || '{{value}}').replace(/\{\{\s*value\s*\}\}/g, value || '');

const BundleBannerContent = ({ config = {} }) => {
  const {
    attributeName,
    template,
    color,
    className,
    barClassName,
    mapping,
  } = config;

  // Subscribes to the space record so the banner reacts when the attribute
  // value changes (e.g. a space settings edit while the page is open).
  const value = useSelector(s => {
    if (!attributeName) return '';
    return readAttribute(s.app?.space, attributeName) || '';
  });

  const merged = mergeMapping(mapping);

  // Two distinct render paths:
  //   - Dynamic mode (attributeName set): mapping decides color and visibility.
  //   - Static mode (no attributeName): always render, use `color` (or neutral).
  let resolvedColor;
  if (attributeName) {
    const bucket = resolveBucket(value, merged);
    if (!bucket || bucket === 'hide') return null;
    resolvedColor = bucket;
  } else {
    resolvedColor = COLOR_KEYS.includes(color) ? color : 'neutral';
  }

  const text = interpolate(template, value);
  if (!text) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx('kbanner', COLOR_CLASSES[resolvedColor], barClassName)}
    >
      <span className={className}>{text}</span>
    </div>
  );
};

const BundleBannerComponent = forwardRef(({ config }, ref) => {
  const api = useRef({});
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <BundleBannerContent config={config} />
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (
    config.attributeName != null &&
    typeof config.attributeName !== 'string'
  ) {
    console.error(
      'BundleBanner Widget Error: attributeName must be a string.',
    );
    return false;
  }
  if (config.template != null && typeof config.template !== 'string') {
    console.error('BundleBanner Widget Error: template must be a string.');
    return false;
  }
  if (config.color != null && !COLOR_KEYS.includes(config.color)) {
    console.error(
      `BundleBanner Widget Error: color must be one of ${COLOR_KEYS.join(', ')}.`,
    );
    return false;
  }
  if (config.className != null && typeof config.className !== 'string') {
    console.error('BundleBanner Widget Error: className must be a string.');
    return false;
  }
  if (config.barClassName != null && typeof config.barClassName !== 'string') {
    console.error(
      'BundleBanner Widget Error: barClassName must be a string.',
    );
    return false;
  }
  if (config.mapping != null) {
    if (typeof config.mapping !== 'object' || Array.isArray(config.mapping)) {
      console.error(
        'BundleBanner Widget Error: mapping must be an object keyed by bucket name.',
      );
      return false;
    }
    for (const key of Object.keys(config.mapping)) {
      if (!BUCKET_KEYS.includes(key)) {
        console.error(
          `BundleBanner Widget Error: mapping bucket '${key}' is not one of ${BUCKET_KEYS.join(', ')}.`,
        );
        return false;
      }
      const list = config.mapping[key];
      if (!Array.isArray(list) || list.some(s => typeof s !== 'string')) {
        console.error(
          `BundleBanner Widget Error: mapping.${key} must be an array of strings.`,
        );
        return false;
      }
    }
  }
  return true;
};

/**
 * Initializes a BundleBanner widget instance.
 *
 * Two render modes, picked by whether `attributeName` is set:
 *
 * 1. **Dynamic mode** — read a space attribute, look its value up in
 *    `mapping`, and use the matched bucket as the color. If the value falls
 *    in the `hide` bucket *or* matches no bucket, the widget renders
 *    nothing. Production-by-default-hides comes from this rule plus the
 *    default mapping.
 *
 *      bundle.widgets.BundleBanner({
 *        container: K('content[Env Banner]').element(),
 *        config: {
 *          attributeName: 'Environment',
 *          template: 'Environment: {{value}}',
 *        },
 *        id: 'env-banner',
 *      });
 *
 * 2. **Static mode** — no `attributeName`, always render, color from `color`
 *    config (defaults to `neutral`). Use for hard-coded indicators like a
 *    classification banner.
 *
 *      bundle.widgets.BundleBanner({
 *        container: K('content[Classified]').element(),
 *        config: {
 *          template: 'CLASSIFIED',
 *          color: 'error',
 *        },
 *        id: 'classified-banner',
 *      });
 *
 * Template interpolation only substitutes `{{value}}` (the resolved
 * attribute value, or empty string in static mode). For richer text,
 * compose form-side and pass the result as `template`.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] All fields optional.
 * @param {string} [config.attributeName] Name of the space attribute whose
 *   value drives color/visibility. When omitted, the widget enters static
 *   mode (always show, color from `color`).
 * @param {string} [config.template] Display string. Defaults to `'{{value}}'`.
 *   Only `{{value}}` is interpolated; for other interpolation, compose the
 *   string in your bundle script and pass it here.
 * @param {string} [config.color] 'error' | 'warning' | 'success' | 'info' |
 *   'neutral'. Used in static mode only — ignored when `attributeName` is
 *   set (mapping decides). Defaults to `'neutral'` in static mode.
 * @param {string} [config.className] Extra classes on the inner text element.
 * @param {string} [config.barClassName] Extra classes on the parent bar
 *   element (where the background color lives).
 * @param {Object} [config.mapping] Override of the default value→bucket
 *   mapping. **Extends** the defaults — buckets you don't mention keep
 *   their default words. Bucket keys are 'error', 'warning', 'success',
 *   'info', 'neutral', 'hide'. Match is case-insensitive after trimming.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const BundleBanner = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleBanner');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleBanner, {
      container: resolved,
      Component: BundleBannerComponent,
      props: { config },
      id,
    });
  }
  return Promise.reject(
    'The BundleBanner widget parameters are invalid. See the console for more details.',
  );
};
