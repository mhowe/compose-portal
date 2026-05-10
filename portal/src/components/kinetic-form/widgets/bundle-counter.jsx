import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
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
import { useIntegration, validateIntegrationBase } from './integration.js';

const SIZES = ['sm', 'md', 'lg', 'xl'];
const POSITIONS = ['left', 'right', 'between'];
const LAYOUTS = ['inline', 'stacked'];
const COLOR_KEYS = ['error', 'warning', 'success', 'info', 'neutral'];

// Coherent size set keyed by layout × size:
//   - inline  — counter sits in a horizontal chrome row alongside other
//     widgets. Uses the full kbtn-ghost-{size} suffix so heights match
//     BundleLink / BundleMenu trigger at the same size.
//   - stacked — counter is in a vertical list (e.g., side-nav). Drops the
//     `kbtn-{size}` suffix so all sizes share the same horizontal padding,
//     keeping left/right edges aligned across mixed-size stacks. Heights
//     and font still differ via `text-{size}` and `kbadge-{size}`.
//
// `text-{size}` is added explicitly because some DaisyUI builds only scale
// btn padding via the size suffix and leave font-size alone — without an
// explicit text-X on the parent, the inner text span has no font-size cue
// to inherit and stays at default.
const SIZE_CLASSES = {
  inline: {
    sm: { btn: 'kbtn kbtn-ghost kbtn-sm text-sm', badge: 'kbadge-sm' },
    md: { btn: 'kbtn kbtn-ghost text-base', badge: '' },
    lg: { btn: 'kbtn kbtn-ghost kbtn-lg text-lg', badge: 'kbadge-lg' },
    xl: { btn: 'kbtn kbtn-ghost kbtn-xl text-xl', badge: 'kbadge-xl' },
  },
  stacked: {
    sm: { btn: 'kbtn kbtn-ghost text-sm', badge: 'kbadge-sm' },
    md: { btn: 'kbtn kbtn-ghost text-base', badge: '' },
    lg: { btn: 'kbtn kbtn-ghost text-lg', badge: 'kbadge-lg' },
    xl: { btn: 'kbtn kbtn-ghost text-xl', badge: 'kbadge-xl' },
  },
};

// `between` stretches the widget to fill its parent. The text-vs-badge
// alignment is then handled at the badge level by adding `ml-auto` (added
// in the badge clsx below) — flex's `margin-X-auto` absorbs all available
// space on that side, which is well-defined and doesn't fight kbtn's own
// `justify-content` like `!justify-between` would.
const POSITION_EXTRAS = {
  left: '',
  right: '',
  between: 'w-full',
};

// Walks the thresholds in order; first whose `upTo` is null/undefined or
// `>= count` wins. The catch-all is whichever entry omits `upTo`. When no
// thresholds are configured (or count is null), defaults to 'neutral'.
const resolveBadgeColor = (count, thresholds) => {
  if (count == null) return 'neutral';
  if (!Array.isArray(thresholds) || thresholds.length === 0) return 'neutral';
  for (const t of thresholds) {
    if (t.upTo == null || count <= t.upTo) {
      return COLOR_KEYS.includes(t.color) ? t.color : 'neutral';
    }
  }
  return 'neutral';
};

// Resolves the displayed count from either integration data or a static
// `count` config. Integration wins when both are configured.
//
// Returns `{ display, numeric, unevaluatableReason }`:
//   display              — string for the badge ('15', '0', '-', etc.)
//   numeric              — number (for threshold lookup) or null
//   unevaluatableReason  — null when fine, or a string for the warn message
const resolveCount = ({ integration, count, list, loading, error }) => {
  if (integration) {
    if (loading) return { display: '-', numeric: null, unevaluatableReason: null };
    if (error) {
      return {
        display: '-',
        numeric: null,
        unevaluatableReason: `integration error: ${error.message || 'unknown'}`,
      };
    }
    if (Array.isArray(list)) {
      return { display: String(list.length), numeric: list.length, unevaluatableReason: null };
    }
    // Hook hasn't populated yet but no loading/error — treat as loading-ish.
    return { display: '-', numeric: null, unevaluatableReason: null };
  }
  if (count != null) {
    const n = Number(count);
    if (Number.isFinite(n)) {
      return { display: String(n), numeric: n, unevaluatableReason: null };
    }
    return {
      display: '-',
      numeric: null,
      unevaluatableReason: `count value ${JSON.stringify(count)} is not numeric`,
    };
  }
  return {
    display: '-',
    numeric: null,
    unevaluatableReason: 'neither integration nor count provided',
  };
};

const BundleCounterContent = ({ id, config = {}, apiRef, mode = 'expanded' }) => {
  const {
    integration,
    count,
    text,
    badgePosition = 'right',
    size = 'md',
    layout = 'inline',
    thresholds,
    className,
    textClassName,
    badgeClassName,
    clickAction,
    target,
    label,
  } = config;

  // Hook is inert when integration is undefined — list/loading/error stay
  // null/false/null and refresh is a no-op.
  const { list, loading, error, refresh } = useIntegration(integration);

  const { display, numeric, unevaluatableReason } = resolveCount({
    integration,
    count,
    list,
    loading,
    error,
  });

  // Warn (not error) on unevaluatable states. Fires only when the reason
  // string changes, so a sequence of identical render passes doesn't spam
  // the console.
  useEffect(() => {
    if (unevaluatableReason) {
      const idSuffix = id ? ` (${id})` : '';
      console.warn(
        `BundleCounter${idSuffix}: ${unevaluatableReason}; rendering "-".`,
      );
    }
  }, [unevaluatableReason, id]);

  // Imperative API. `getCount` reads through a ref so it always sees the
  // freshest value without needing to re-attach on every render.
  const numericRef = useRef(null);
  numericRef.current = numeric;
  useEffect(() => {
    apiRef.current.refresh = refresh;
    apiRef.current.getCount = () => numericRef.current;
  }, [refresh, apiRef]);

  const layoutTable = SIZE_CLASSES[layout] || SIZE_CLASSES.inline;
  const sizeStyles = layoutTable[size] || layoutTable.md;
  const positionExtras = POSITION_EXTRAS[badgePosition] || POSITION_EXTRAS.right;

  const badgeColor = useMemo(
    () => resolveBadgeColor(numeric, thresholds),
    [numeric, thresholds],
  );

  // Designer-supplied className wins. Otherwise default to ghost-button
  // styling that lines up with BundleLink / BundleMenu in chrome layouts.
  // Same `??` convention BundleLink uses.
  const computedClass = clsx(sizeStyles.btn, positionExtras);
  const rootClasses = className ?? computedClass;

  // For 'between', `ml-auto` on the badge consumes all available margin-left
  // space, pushing the badge to the right edge while the text stays at the
  // start (where it landed naturally as the first child). No special class
  // on the text needed.
  const badge = (
    <span
      className={clsx(
        'kbadge',
        `kbadge-${badgeColor}`,
        sizeStyles.badge,
        badgePosition === 'between' && 'ml-auto',
        badgeClassName,
      )}
    >
      {display}
    </span>
  );

  // In rail mode, hide the text label and let only the badge speak. The
  // count alone reads well at icon scale.
  const hideText = mode === 'rail';
  const textNode = text && !hideText ? (
    <span className={textClassName}>{text}</span>
  ) : null;

  return (
    <ClickActionWrapper
      clickAction={clickAction}
      target={target}
      label={label || text || undefined}
      widgetName="BundleCounter"
      instanceId={id}
      className={rootClasses}
    >
      {badgePosition === 'left' && badge}
      {textNode}
      {(badgePosition === 'right' || badgePosition === 'between') && badge}
    </ClickActionWrapper>
  );
};

const BundleCounterComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [mode, setMode] = useState('expanded');

  api.current.setMode = setMode;
  api.current.tooltip = config.tooltip ?? config.text ?? config.label;

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture} className="flex-initial">
          <BundleCounterContent id={id} config={config} apiRef={api} mode={mode} />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateThresholds = thresholds => {
  if (thresholds == null) return true;
  if (!Array.isArray(thresholds)) {
    console.error('BundleCounter Widget Error: thresholds must be an array.');
    return false;
  }
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i];
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      console.error(
        `BundleCounter Widget Error: thresholds[${i}] must be an object.`,
      );
      return false;
    }
    if (!COLOR_KEYS.includes(t.color)) {
      console.error(
        `BundleCounter Widget Error: thresholds[${i}].color must be one of ${COLOR_KEYS.join(', ')}.`,
      );
      return false;
    }
    if (t.upTo != null && typeof t.upTo !== 'number') {
      console.error(
        `BundleCounter Widget Error: thresholds[${i}].upTo must be a number when provided.`,
      );
      return false;
    }
  }
  return true;
};

const validateConfig = (config = {}) => {
  if (
    config.count != null &&
    typeof config.count !== 'number' &&
    typeof config.count !== 'string'
  ) {
    console.error(
      'BundleCounter Widget Error: count must be a number or numeric string.',
    );
    return false;
  }
  if (config.text != null && typeof config.text !== 'string') {
    console.error('BundleCounter Widget Error: text must be a string.');
    return false;
  }
  if (
    config.badgePosition != null &&
    !POSITIONS.includes(config.badgePosition)
  ) {
    console.error(
      `BundleCounter Widget Error: badgePosition must be one of ${POSITIONS.join(', ')}.`,
    );
    return false;
  }
  if (config.size != null && !SIZES.includes(config.size)) {
    console.error(
      `BundleCounter Widget Error: size must be one of ${SIZES.join(', ')}.`,
    );
    return false;
  }
  if (config.layout != null && !LAYOUTS.includes(config.layout)) {
    console.error(
      `BundleCounter Widget Error: layout must be one of ${LAYOUTS.join(', ')}.`,
    );
    return false;
  }
  if (!validateThresholds(config.thresholds)) return false;
  if (config.className != null && typeof config.className !== 'string') {
    console.error('BundleCounter Widget Error: className must be a string.');
    return false;
  }
  if (config.textClassName != null && typeof config.textClassName !== 'string') {
    console.error(
      'BundleCounter Widget Error: textClassName must be a string.',
    );
    return false;
  }
  if (
    config.badgeClassName != null &&
    typeof config.badgeClassName !== 'string'
  ) {
    console.error(
      'BundleCounter Widget Error: badgeClassName must be a string.',
    );
    return false;
  }
  if (config.label != null && typeof config.label !== 'string') {
    console.error('BundleCounter Widget Error: label must be a string.');
    return false;
  }
  if (config.tooltip != null && typeof config.tooltip !== 'string') {
    console.error('BundleCounter Widget Error: tooltip must be a string.');
    return false;
  }
  if (!validateClickAction(config.clickAction, 'BundleCounter')) return false;
  if (!validateTarget(config.target, 'BundleCounter')) return false;
  if (!validateIntegrationBase(config.integration, 'BundleCounter')) return false;
  return true;
};

/**
 * Initializes a BundleCounter widget instance.
 *
 * Renders a label-with-badge pair — text plus a count badge whose color can
 * change with the value. Supports two data sources:
 *
 *   1. An integration that returns an array (badge displays array length).
 *   2. A static `count` value (number or numeric string).
 *
 * **Precedence:** when both `integration` and `count` are configured,
 * integration wins. The widget never falls back from one to the other.
 *
 * **Bad data is non-fatal.** When the count can't be evaluated (non-numeric
 * `count`, missing `listProperty`, integration error, or neither source
 * configured) the badge displays `'-'` and a `console.warn` (not error) is
 * logged. Loading state also displays `'-'` but without a warning.
 *
 * Examples:
 *
 *   // Integration-driven inbox counter that opens a list page on click.
 *   bundle.widgets.BundleCounter({
 *     container: K('content[Inbox]').element(),
 *     config: {
 *       text: 'Inbox',
 *       integration: {
 *         kappSlug: 'services',
 *         integrationName: 'My Open Tickets',
 *         listProperty: 'Submissions',
 *       },
 *       thresholds: [
 *         { upTo: 10, color: 'neutral' },
 *         { upTo: 20, color: 'warning' },
 *         { color: 'error' },
 *       ],
 *       clickAction: { type: 'internal', path: '/kapps/services/inbox' },
 *     },
 *     id: 'inbox-counter',
 *   });
 *
 *   // Static count, badge-only (no label).
 *   bundle.widgets.BundleCounter({
 *     container: K('content[Notifications]').element(),
 *     config: { count: 7, badgePosition: 'left' },
 *     id: 'notifications',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] All fields optional, but at least one of
 *   `integration` or `count` should be set or the badge will render '-'.
 * @param {Object} [config.integration] Integration descriptor — same shape
 *   as BundleMenu's. `kappSlug`, `integrationName`, and `listProperty` are
 *   required when `integration` is set. The badge displays the resolved
 *   array's `.length`. See BUNDLE_COUNTER.md for the full field list.
 * @param {number|string} [config.count] Static count. Number or numeric
 *   string. Ignored when `integration` is set.
 * @param {string} [config.text] Optional label rendered alongside the badge.
 *   When omitted, only the badge renders.
 * @param {string} [config.badgePosition] 'left' | 'right' (default) |
 *   'between'. 'between' stretches the widget to fill its parent and
 *   pushes text and badge to opposite ends.
 * @param {string} [config.size] 'sm' | 'md' (default) | 'lg' | 'xl'. Drives
 *   font and badge size as a coherent set.
 * @param {string} [config.layout] 'inline' (default) | 'stacked'. Use
 *   `'inline'` for counters in a horizontal chrome row — heights match
 *   BundleLink / BundleMenu trigger at the same size. Use `'stacked'` when
 *   stacking multiple counters vertically (e.g. side-nav) so left/right
 *   padding stays consistent across mixed-size stacks. Stacked still scales
 *   font and badge by `size`; only horizontal padding is normalized.
 * @param {Array} [config.thresholds] Optional array of `{ upTo?, color }`
 *   evaluated in order; first whose `upTo` is null or `>= count` wins.
 *   `color` is one of 'error', 'warning', 'success', 'info', 'neutral'.
 *   Default badge color (no thresholds, or unevaluatable count): 'neutral'.
 * @param {string} [config.className] Override the default ghost-button
 *   styling on the parent. **Designer-supplied className wins entirely** —
 *   if you set this, the default `kbtn kbtn-ghost kbtn-{size}` is replaced,
 *   not extended. Use DaisyUI / `kd-*` semantic classes when you need a
 *   different look.
 * @param {string} [config.textClassName] Extra classes on the text element.
 *   Additive — added alongside any default text styling.
 * @param {string} [config.badgeClassName] Extra classes on the badge.
 *   Additive — added alongside the kbadge / size / color defaults.
 * @param {Object} [config.clickAction] Standard chrome-widget clickAction.
 *   Wraps the whole widget. Default `{ type: 'none' }`.
 * @param {string|Object} [config.target] Standard chrome-widget target —
 *   'current' (default), 'new', 'modal', or `{ type: 'container', id }`.
 *   See CHROME_ACTIONS.md.
 * @param {string} [config.label] Accessibility label override. Defaults to
 *   `text` when not provided.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking, also used in console warnings.
 */
export const BundleCounter = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleCounter');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleCounter, {
      container: resolved,
      Component: BundleCounterComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleCounter widget parameters are invalid. See the console for more details.',
  );
};
