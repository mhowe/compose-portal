import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { useInternalLinkInterceptor } from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { readAttribute, readAttributeValues } from '../../../helpers/setup.js';
import { Icon } from '../../../atoms/Icon.jsx';

const TYPES = ['pill', 'tile', 'card'];
const SIZES = ['sm', 'md', 'lg', 'xl'];
const ACCORDION_MODES = ['all-open', 'first-open', 'all-closed', 'off'];
const ACCENT_PLACEMENTS = ['auto', 'left', 'top', 'right', 'bottom', 'none'];
const ICON_PLACEMENTS = {
  pill: ['auto', 'left', 'right', 'none'],
  tile: ['auto', 'top', 'none'],
  card: ['auto', 'hero', 'top-banner', 'inline-left', 'none'],
};
const SORT_MODES = ['order', 'name'];
const GROUP_BY = [null, 'category'];

const COLOR_KEYS = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'error',
  'info',
  'neutral',
];

// Per-type defaults — what `'auto'` resolves to.
const DEFAULT_ICON_PLACEMENT = { pill: 'left', tile: 'top', card: 'hero' };
const DEFAULT_ACCENT_PLACEMENT = { pill: 'none', tile: 'top', card: 'left' };

// Per-type size table. `min` feeds grid auto-fit minmax; `minH` keeps pills at
// a uniform height across rows even when names wrap. Tiles enforce a square
// aspect ratio; cards rely on grid-auto-rows + h-full for equal heights.
const SIZE_MAP = {
  pill: {
    sm: { min: 120, minH: 44, iconSize: 16, padding: 'px-3 py-2', text: 'text-sm' },
    md: { min: 160, minH: 56, iconSize: 20, padding: 'px-4 py-2', text: 'text-base' },
    lg: { min: 200, minH: 68, iconSize: 24, padding: 'px-5 py-3', text: 'text-lg' },
    xl: { min: 240, minH: 80, iconSize: 28, padding: 'px-6 py-3', text: 'text-xl' },
  },
  tile: {
    sm: { min: 100, iconSize: 28, padding: 'p-3', text: 'text-xs' },
    md: { min: 140, iconSize: 36, padding: 'p-4', text: 'text-sm' },
    lg: { min: 180, iconSize: 48, padding: 'p-5', text: 'text-base' },
    xl: { min: 220, iconSize: 56, padding: 'p-6', text: 'text-lg' },
  },
  card: {
    sm: { min: 220, iconSize: 28, padding: 'p-4', text: 'text-sm', descSize: 'text-xs' },
    md: { min: 280, iconSize: 36, padding: 'p-5', text: 'text-base', descSize: 'text-sm' },
    lg: { min: 340, iconSize: 44, padding: 'p-6', text: 'text-lg', descSize: 'text-sm' },
    xl: { min: 400, iconSize: 52, padding: 'p-7', text: 'text-xl', descSize: 'text-base' },
  },
};

// All text inputs — both attribute values and enum-style config values — are
// normalized through `lc` before comparison, so builders can enter values in
// any case (e.g. 'Primary', 'PRIMARY', 'primary' all resolve the same).
const lc = v => (v == null ? '' : String(v).trim().toLowerCase());

// Lowercases enum-style config fields and the values inside filter / include /
// exclude. Free-text fields (emptyText, ungroupedLabel, className) are left
// alone — case is meaningful for display copy.
const normalizeConfig = (config = {}) => {
  const out = { ...config };
  for (const key of [
    'type',
    'size',
    'iconPlacement',
    'accentPlacement',
    'accordion',
    'sort',
    'groupBy',
  ]) {
    if (typeof out[key] === 'string') out[key] = lc(out[key]);
  }
  if (typeof out.filter === 'string') {
    out.filter = lc(out.filter);
  } else if (Array.isArray(out.filter)) {
    out.filter = out.filter.map(v => (typeof v === 'string' ? lc(v) : v));
  }
  if (Array.isArray(out.include)) {
    out.include = out.include.map(v => (typeof v === 'string' ? lc(v) : v));
  }
  if (Array.isArray(out.exclude)) {
    out.exclude = out.exclude.map(v => (typeof v === 'string' ? lc(v) : v));
  }
  return out;
};

// Truthy text values for boolean-shaped attributes. Anything else (including
// empty / missing) reads false.
const TRUTHY = new Set(['true', 'yes', '1', 'on']);
const isHiddenKapp = kapp => TRUTHY.has(lc(readAttribute(kapp, 'Display - Hidden')));

// Tabler icon names are kebab-case lowercase, so a builder typing 'Settings'
// in the attribute should still resolve to the right icon.
const readKappIconName = kapp => {
  const v = readAttribute(kapp, 'Display - Icon');
  return v ? lc(v) : null;
};

// Display - Order is stored as text. Parse to float; missing / non-numeric
// values sort to the end (alphabetical fallback by name).
const parseOrder = kapp => {
  const v = readAttribute(kapp, 'Display - Order');
  if (v == null || v === '') return Number.POSITIVE_INFINITY;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

const readCategories = kapp => readAttributeValues(kapp, 'Display - Category');

const sortKapps = (kapps, sort) => {
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  if (sort === 'name') return [...kapps].sort(byName);
  return [...kapps].sort((a, b) => {
    const oa = parseOrder(a);
    const ob = parseOrder(b);
    if (oa !== ob) return oa - ob;
    return byName(a, b);
  });
};

// Filter + include / exclude + hidden. Order: hidden first (so include/exclude
// can still override by surfacing a hidden kapp via includeHidden), then
// allowlist, then denylist, then category filter. All string comparisons are
// case-insensitive — config values are pre-lowercased by normalizeConfig, and
// attribute values are lowercased here at the comparison point.
const filterKapps = (kapps, { filter, include, exclude, includeHidden }) => {
  let list = kapps;
  if (!includeHidden) list = list.filter(k => !isHiddenKapp(k));
  if (Array.isArray(include) && include.length > 0) {
    const set = new Set(include);
    list = list.filter(k => set.has(lc(k.slug)));
  }
  if (Array.isArray(exclude) && exclude.length > 0) {
    const set = new Set(exclude);
    list = list.filter(k => !set.has(lc(k.slug)));
  }
  if (filter != null) {
    const wanted = Array.isArray(filter) ? filter : [filter];
    const set = new Set(wanted);
    list = list.filter(k => readCategories(k).some(c => set.has(lc(c))));
  }
  return list;
};

// Groups by Display - Category. Multi-valued categories cause a kapp to
// appear in each group it belongs to. Kapps with no category go into the
// ungrouped bucket, rendered last with `ungroupedLabel`. Empty buckets are
// never returned.
//
// Bucketing is case-insensitive (so 'Admin' and 'admin' end up in the same
// group), but the display label preserves the original case from the first
// kapp seen in that bucket — so headings read naturally rather than being
// forced to lowercase.
const groupKapps = (kapps, ungroupedLabel) => {
  const buckets = new Map();
  const ungrouped = [];
  for (const kapp of kapps) {
    const cats = readCategories(kapp);
    if (cats.length === 0) {
      ungrouped.push(kapp);
      continue;
    }
    for (const c of cats) {
      const key = lc(c);
      if (!buckets.has(key)) buckets.set(key, { label: c, items: [] });
      buckets.get(key).items.push(kapp);
    }
  }
  const groups = [...buckets.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  if (ungrouped.length > 0) groups.push({ label: ungroupedLabel, items: ungrouped });
  return groups;
};

// Translates `Display - Color` into an inline border style. Semantic keys
// resolve to daisyUI CSS variables so the accent tracks the active theme;
// hex / rgb / var(...) strings pass through (lowercased — hex is
// case-insensitive). Returns null when nothing applies — caller renders no
// accent.
const resolveAccent = (kapp, placement) => {
  if (placement === 'none') return null;
  const raw = readAttribute(kapp, 'Display - Color');
  if (!raw) return null;
  const color = lc(raw);
  const cssColor =
    color.startsWith('#') || color.startsWith('rgb') || color.startsWith('var(')
      ? color
      : COLOR_KEYS.includes(color)
        ? `var(--color-${color})`
        : null;
  if (!cssColor) return null;
  const side =
    placement === 'top'
      ? 'Top'
      : placement === 'right'
        ? 'Right'
        : placement === 'bottom'
          ? 'Bottom'
          : 'Left';
  return {
    [`border${side}Width`]: '4px',
    [`border${side}Style`]: 'solid',
    [`border${side}Color`]: cssColor,
  };
};

const initialOpenState = (groups, accordion) => {
  if (!groups) return {};
  if (accordion === 'all-closed') {
    return Object.fromEntries(groups.map(g => [g.label, false]));
  }
  if (accordion === 'first-open') {
    return Object.fromEntries(groups.map((g, i) => [g.label, i === 0]));
  }
  // 'all-open' and 'off' both initialize open; 'off' just doesn't render a toggle.
  return Object.fromEntries(groups.map(g => [g.label, true]));
};

const KappIconNode = ({ name, size }) => {
  if (!name) return null;
  return <Icon name={name} size={size} />;
};

const KappPill = ({ kapp, sizeConfig, showIcon, iconPlacement, accentStyle }) => {
  const iconName = readKappIconName(kapp);
  const hasIcon = showIcon && iconName && iconPlacement !== 'none';
  return (
    <Link
      to={`/kapps/${kapp.slug}`}
      style={{ minHeight: sizeConfig.minH, ...(accentStyle || {}) }}
      className={clsx(
        'kd-kapp-pill flex-cc gap-2 rounded-box bg-base-100 border border-base-300',
        'hover:border-primary hover:shadow-md transition no-underline text-base-content',
        sizeConfig.padding,
        sizeConfig.text,
      )}
    >
      {hasIcon && iconPlacement === 'left' && (
        <KappIconNode name={iconName} size={sizeConfig.iconSize} />
      )}
      <span className="kd-kapp-pill-name font-medium text-center line-clamp-2">
        {kapp.name}
      </span>
      {hasIcon && iconPlacement === 'right' && (
        <KappIconNode name={iconName} size={sizeConfig.iconSize} />
      )}
    </Link>
  );
};

const KappTile = ({
  kapp,
  sizeConfig,
  showIcon,
  showName,
  iconPlacement,
  accentStyle,
}) => {
  const iconName = readKappIconName(kapp);
  const hasIcon = showIcon && iconName && iconPlacement !== 'none';
  return (
    <Link
      to={`/kapps/${kapp.slug}`}
      style={{ aspectRatio: '1', ...(accentStyle || {}) }}
      className={clsx(
        'kd-kapp-tile flex-c-cc gap-2 rounded-box bg-base-100 border border-base-300',
        'hover:border-primary hover:shadow-md transition text-center no-underline text-base-content',
        sizeConfig.padding,
        sizeConfig.text,
      )}
    >
      {hasIcon && (
        <div className="kd-kapp-tile-icon">
          <KappIconNode name={iconName} size={sizeConfig.iconSize} />
        </div>
      )}
      {showName && (
        <span className="kd-kapp-tile-name font-medium line-clamp-2">
          {kapp.name}
        </span>
      )}
    </Link>
  );
};

const KappCard = ({
  kapp,
  sizeConfig,
  showIcon,
  showName,
  showDescription,
  iconPlacement,
  accentStyle,
}) => {
  const iconName = readKappIconName(kapp);
  const description =
    readAttribute(kapp, 'Display - Description') || kapp.description;
  const hasIcon = showIcon && iconName && iconPlacement !== 'none';
  const heroIconSize = Math.round(sizeConfig.iconSize * 1.5);

  return (
    <Link
      to={`/kapps/${kapp.slug}`}
      style={accentStyle || undefined}
      className={clsx(
        'kd-kapp-card flex-c-ss rounded-box bg-base-100 border border-base-300 overflow-hidden',
        'hover:border-primary hover:shadow-md transition h-full no-underline text-base-content',
      )}
    >
      {hasIcon && iconPlacement === 'top-banner' && (
        <div className="kd-kapp-card-banner flex-cc bg-base-200 py-6 w-full">
          <KappIconNode name={iconName} size={heroIconSize} />
        </div>
      )}
      <div className={clsx('kd-kapp-card-body flex-c-ss gap-2 w-full', sizeConfig.padding)}>
        {hasIcon && iconPlacement === 'hero' && (
          <div className="kd-kapp-card-hero self-center mb-2">
            <KappIconNode name={iconName} size={heroIconSize} />
          </div>
        )}
        {hasIcon && iconPlacement === 'inline-left' ? (
          <div className="kd-kapp-card-title flex-sc gap-3 w-full">
            <KappIconNode name={iconName} size={sizeConfig.iconSize} />
            {showName && (
              <span className={clsx('font-semibold flex-1', sizeConfig.text)}>
                {kapp.name}
              </span>
            )}
          </div>
        ) : (
          showName && (
            <span
              className={clsx(
                'kd-kapp-card-title font-semibold',
                sizeConfig.text,
              )}
            >
              {kapp.name}
            </span>
          )
        )}
        {showDescription && description && (
          <span
            className={clsx(
              'kd-kapp-card-description text-base-content/70 line-clamp-2',
              sizeConfig.descSize,
            )}
          >
            {description}
          </span>
        )}
      </div>
    </Link>
  );
};

const KappGroupSection = ({ label, isOpen, isClickable, onToggle, children }) => (
  <div className="kd-kapp-group">
    {isClickable ? (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="kd-kapp-group-heading flex-sc gap-2 w-full text-left mt-6 mb-3"
      >
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} />
        <span className="font-semibold text-base-content/80 uppercase text-sm">
          {label}
        </span>
      </button>
    ) : (
      <div className="kd-kapp-group-heading mt-6 mb-3">
        <span className="font-semibold text-base-content/80 uppercase text-sm">
          {label}
        </span>
      </div>
    )}
    {isOpen && children}
  </div>
);

const KappsContent = ({ config: rawConfig }) => {
  // Normalize all enum-like inputs to lowercase up front so designers can
  // enter values in any case without surprises.
  const config = useMemo(() => normalizeConfig(rawConfig), [rawConfig]);
  const {
    type = 'tile',
    size = 'md',
    showIcon = true,
    showName = true,
    showDescription = true,
    iconPlacement: rawIconPlacement = 'auto',
    accentPlacement: rawAccentPlacement = 'auto',
    filter = null,
    include = null,
    exclude = null,
    includeHidden = false,
    groupBy = null,
    ungroupedLabel = 'Other',
    accordion = 'all-open',
    sort = 'order',
    emptyText = 'No kapps to display',
    className,
  } = config;

  // Subscribe so a space refresh (e.g. attribute update, kapp added) reflows
  // the widget.
  const kapps = useSelector(s => s.app.space?.kapps || []);

  // Resolve placements with per-type fallbacks. Invalid values for the current
  // type silently fall back to that type's default — better than throwing in
  // a form designer's face.
  const resolvedType = TYPES.includes(type) ? type : 'tile';
  const iconPlacement =
    rawIconPlacement === 'auto' ||
    !ICON_PLACEMENTS[resolvedType].includes(rawIconPlacement)
      ? DEFAULT_ICON_PLACEMENT[resolvedType]
      : rawIconPlacement;
  const accentPlacement =
    rawAccentPlacement === 'auto' ||
    !ACCENT_PLACEMENTS.includes(rawAccentPlacement)
      ? DEFAULT_ACCENT_PLACEMENT[resolvedType]
      : rawAccentPlacement;

  const sizeConfig =
    SIZE_MAP[resolvedType][size] || SIZE_MAP[resolvedType].md;

  const visible = useMemo(
    () =>
      sortKapps(
        filterKapps(kapps, { filter, include, exclude, includeHidden }),
        sort,
      ),
    [kapps, filter, include, exclude, includeHidden, sort],
  );

  const groups = useMemo(
    () => (groupBy === 'category' ? groupKapps(visible, ungroupedLabel) : null),
    [visible, groupBy, ungroupedLabel],
  );

  // Accordion state — local only, never persisted. When the group label set
  // changes (e.g. a new category was added), bring in defaults for new
  // labels while preserving existing user toggles.
  const groupLabels = useMemo(
    () => (groups ? groups.map(g => g.label) : []),
    [groups],
  );
  const groupLabelKey = groupLabels.join('|');
  const [openGroups, setOpenGroups] = useState(() =>
    initialOpenState(groups, accordion),
  );
  useEffect(() => {
    if (!groups) {
      setOpenGroups({});
      return;
    }
    setOpenGroups(prev => {
      const defaults = initialOpenState(groups, accordion);
      const next = {};
      let changed = false;
      for (const label of groupLabels) {
        if (label in prev) next[label] = prev[label];
        else {
          next[label] = defaults[label];
          changed = true;
        }
      }
      if (Object.keys(prev).length !== groupLabels.length) changed = true;
      return changed ? next : prev;
    });
  }, [groupLabelKey, accordion, groups, groupLabels]);

  // Empty-state condition: zero kapps after filter/access. Empty groups
  // never render — the group filter below handles that.
  if (visible.length === 0) {
    return (
      <div className={clsx('kd-kapps kd-kapps-empty kd-callout', className)}>
        {emptyText}
      </div>
    );
  }

  const renderKapp = kapp => {
    const accentStyle = resolveAccent(kapp, accentPlacement);
    const shared = { kapp, sizeConfig, showIcon, iconPlacement, accentStyle };
    if (resolvedType === 'pill') return <KappPill key={kapp.slug} {...shared} />;
    if (resolvedType === 'tile')
      return <KappTile key={kapp.slug} {...shared} showName={showName} />;
    return (
      <KappCard
        key={kapp.slug}
        {...shared}
        showName={showName}
        showDescription={showDescription}
      />
    );
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${sizeConfig.min}px, 1fr))`,
    // Equal-height rows for cards; ignored visually for pills/tiles which
    // already enforce their own sizing.
    ...(resolvedType === 'card' ? { gridAutoRows: '1fr' } : {}),
  };

  const renderGrid = items => (
    <div className="kd-kapps-grid grid gap-4" style={gridStyle}>
      {items.map(renderKapp)}
    </div>
  );

  if (!groups) {
    return (
      <div className={clsx('kd-kapps', `kd-kapps-${resolvedType}`, className)}>
        {renderGrid(visible)}
      </div>
    );
  }

  return (
    <div className={clsx('kd-kapps', `kd-kapps-${resolvedType}`, className)}>
      {groups
        .filter(g => g.items.length > 0)
        .map(({ label, items }) => {
          const isClickable = accordion !== 'off';
          const isOpen = !isClickable || openGroups[label] !== false;
          return (
            <KappGroupSection
              key={label}
              label={label}
              isOpen={isOpen}
              isClickable={isClickable}
              onToggle={() =>
                setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
              }
            >
              {renderGrid(items)}
            </KappGroupSection>
          );
        })}
    </div>
  );
};

const KappsComponent = forwardRef(({ config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [currentConfig, setCurrentConfig] = useState(config);

  // Re-sync if the host hands us a new config (rare in practice — most
  // updates come through the imperative API below).
  useEffect(() => {
    setCurrentConfig(config);
  }, [config]);

  api.current.update = patch =>
    setCurrentConfig(prev => ({ ...prev, ...(patch || {}) }));

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture}>
          <KappsContent config={currentConfig} />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const isStringArray = v => Array.isArray(v) && v.every(s => typeof s === 'string');

// Asserts that a config field is either omitted or a string whose lowercased
// form is a member of `allowed`. Lets designers enter enum values in any case.
const checkEnum = (value, allowed, fieldName) => {
  if (value == null) return true;
  if (typeof value !== 'string' || !allowed.includes(lc(value))) {
    console.error(
      `Kapps Widget Error: ${fieldName} must be one of ${allowed.join(', ')}.`,
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  if (!checkEnum(config.type, TYPES, 'type')) return false;
  if (!checkEnum(config.size, SIZES, 'size')) return false;
  for (const k of ['showIcon', 'showName', 'showDescription', 'includeHidden']) {
    if (config[k] != null && typeof config[k] !== 'boolean') {
      console.error(`Kapps Widget Error: ${k} must be a boolean.`);
      return false;
    }
  }
  if (config.iconPlacement != null && typeof config.iconPlacement !== 'string') {
    console.error('Kapps Widget Error: iconPlacement must be a string.');
    return false;
  }
  if (!checkEnum(config.accentPlacement, ACCENT_PLACEMENTS, 'accentPlacement'))
    return false;
  if (
    config.filter != null &&
    typeof config.filter !== 'string' &&
    !isStringArray(config.filter)
  ) {
    console.error('Kapps Widget Error: filter must be a string or array of strings.');
    return false;
  }
  if (config.include != null && !isStringArray(config.include)) {
    console.error('Kapps Widget Error: include must be an array of strings.');
    return false;
  }
  if (config.exclude != null && !isStringArray(config.exclude)) {
    console.error('Kapps Widget Error: exclude must be an array of strings.');
    return false;
  }
  if (
    config.groupBy != null &&
    !(typeof config.groupBy === 'string' && GROUP_BY.includes(lc(config.groupBy)))
  ) {
    console.error("Kapps Widget Error: groupBy must be 'category' or null.");
    return false;
  }
  if (config.ungroupedLabel != null && typeof config.ungroupedLabel !== 'string') {
    console.error('Kapps Widget Error: ungroupedLabel must be a string.');
    return false;
  }
  if (!checkEnum(config.accordion, ACCORDION_MODES, 'accordion')) return false;
  if (!checkEnum(config.sort, SORT_MODES, 'sort')) return false;
  if (config.emptyText != null && typeof config.emptyText !== 'string') {
    console.error('Kapps Widget Error: emptyText must be a string.');
    return false;
  }
  if (config.className != null && typeof config.className !== 'string') {
    console.error('Kapps Widget Error: className must be a string.');
    return false;
  }
  return true;
};

/**
 * Initializes a Kapps widget instance.
 *
 * Renders the kapps the current user can see — as **pills**, **tiles**, or
 * **cards** — into the supplied container. Each item links to its kapp
 * landing page (`/kapps/<slug>`).
 *
 * Kapp presentation is driven by per-kapp attributes (all optional):
 *
 *   Display - Category    (multi-valued — used by filter / groupBy)
 *   Display - Description (card body copy; falls back to kapp.description)
 *   Display - Icon        (tabler icon name)
 *   Display - Color       (daisy semantic key or hex — renders as accent border)
 *   Display - Hidden      ('true' hides the kapp from this widget by default)
 *   Display - Order       (numeric sort key when sort='order')
 *
 * Example:
 *
 *   bundle.widgets.Kapps({
 *     container: K('content[Kapps]').element(),
 *     config: {
 *       type: 'card',
 *       size: 'lg',
 *       groupBy: 'category',
 *       accordion: 'first-open',
 *     },
 *     id: 'space-home-kapps',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container DOM element or an
 *   array-like whose first entry is one (e.g. `K('content[...]').element()`).
 * @param {Object} [config] Configuration object. All fields optional.
 * @param {string} [config.type] 'pill' | 'tile' (default) | 'card'.
 * @param {string} [config.size] 'sm' | 'md' (default) | 'lg' | 'xl'.
 * @param {boolean} [config.showIcon] Render `Display - Icon`. Default true.
 * @param {boolean} [config.showName] Render the kapp name. Default true.
 * @param {boolean} [config.showDescription] Render description (card only).
 *   Default true.
 * @param {string} [config.iconPlacement] Where the icon sits. 'auto' resolves
 *   per type: pill → 'left'; tile → 'top'; card → 'hero'. Other allowed
 *   values per type: pill 'left'|'right'|'none'; tile 'top'|'none'; card
 *   'hero'|'top-banner'|'inline-left'|'none'.
 * @param {string} [config.accentPlacement] Where the `Display - Color`
 *   accent border renders. 'auto' resolves per type: pill → 'none'; tile →
 *   'top'; card → 'left'. Other values: 'left'|'top'|'right'|'bottom'|'none'.
 * @param {string|Array<string>} [config.filter] Restrict to kapps whose
 *   `Display - Category` matches (any of these values, if multiple).
 * @param {Array<string>} [config.include] Allowlist of kapp slugs.
 * @param {Array<string>} [config.exclude] Denylist of kapp slugs.
 * @param {boolean} [config.includeHidden] Show kapps with
 *   `Display - Hidden = true`. Default false.
 * @param {string|null} [config.groupBy] 'category' to group by
 *   `Display - Category`, or null (default) for a flat grid.
 * @param {string} [config.ungroupedLabel] Section heading for kapps missing
 *   a category when grouping. Default `'Other'`.
 * @param {string} [config.accordion] 'all-open' (default) | 'first-open' |
 *   'all-closed' | 'off'. Only meaningful when `groupBy` is set. 'off' makes
 *   headings non-clickable. State is in-session only — never persisted.
 * @param {string} [config.sort] 'order' (default — `Display - Order` then
 *   alphabetical) | 'name'.
 * @param {string} [config.emptyText] Shown when no kapps are visible.
 *   Default `'No kapps to display'`.
 * @param {string} [config.className] Extra classes on the root element.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const Kapps = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Kapps');
  if (resolved && validateConfig(config)) {
    return registerWidget(Kapps, {
      container: resolved,
      Component: KappsComponent,
      props: { config },
      id,
    });
  }
  return Promise.reject(
    'The Kapps widget parameters are invalid. See the console for more details.',
  );
};
