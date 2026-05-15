import { Fragment, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import { fetchKapp } from '@kineticdata/react';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { useInternalLinkInterceptor } from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { readAttribute } from '../../../helpers/setup.js';
import { useData } from '../../../helpers/hooks/useData.js';
import { Icon } from '../../../atoms/Icon.jsx';

/* ------------------------------------------------------------------ */
/* Enums + truthy table                                               */
/* ------------------------------------------------------------------ */

const CARD_VARIANTS = ['background', 'side', 'stacked', 'icon-only'];
const ORDER_BY = ['displayorder', 'name', 'createdat'];
const ORDER_DIRECTIONS = ['asc', 'desc'];
const NAVIGATION_MODES = ['widget']; // 'url' and 'page' deferred to v2

// Preset icon sizes (in pixels) usable via `config.iconSize: 'sm' | 'md' |
// 'lg' | 'xl'`. Designers can also pass a custom number for anything outside
// the preset range. When iconSize is omitted entirely, the variant's own
// default (VARIANTS[variant].iconSize) wins.
const ICON_SIZE_PRESETS = { sm: 24, md: 36, lg: 48, xl: 64 };

const resolveIconSize = (configValue, variantDefault) => {
  if (configValue == null) return variantDefault;
  if (typeof configValue === 'number') return configValue;
  if (typeof configValue === 'string') {
    const preset = ICON_SIZE_PRESETS[lc(configValue)];
    if (preset) return preset;
  }
  return variantDefault;
};

// Truthy text values for boolean-shaped attributes. Mirrors the Kapps widget
// convention so designers see consistent behavior across widgets.
const TRUTHY = new Set(['true', 'yes', '1', 'on']);

const lc = v => (v == null ? '' : String(v).trim().toLowerCase());

/* ------------------------------------------------------------------ */
/* Slot defaults                                                      */
/*                                                                    */
/* Mirrors the Profile widget convention: every styleable region is a */
/* named slot with a default class string. Designers layer additional */
/* classes (or remove tokens) via `config.classNames[slot]`.          */
/* ------------------------------------------------------------------ */

const SLOT_DEFAULTS = {
  // Outer wrapper of the whole widget.
  root: '',
  // Auto-fit CSS grid that lays out cards. The per-variant minimum column
  // width is applied inline so the same slot string works for every variant.
  grid: 'kd-category-grid w-full',
  // Each category card. Visual chrome (border, hover, transition) lives here;
  // per-variant structural styles (height, flex direction) are layered on at
  // render time.
  card: 'kd-category-card group relative flex w-full overflow-hidden text-left rounded-box bg-base-100 border border-base-300 hover:border-primary hover:shadow-md transition cursor-pointer no-underline text-base-content',
  // Image / icon container. Layout (size, position) is variant-specific and
  // applied as extras; the slot default just controls fallback styling.
  cardMedia: 'kd-category-media bg-base-200 overflow-hidden',
  // Legibility scrim for the `background` variant. Absent on other variants.
  cardOverlay: '',
  // Icon wrapper — used when an icon is rendered instead of (or alongside)
  // an image.
  cardIcon: 'kd-category-icon text-base-content/50',
  // <img> element when imageAttribute resolves a URL.
  cardImage: 'w-full h-full object-cover',
  // Title + description container.
  cardBody: 'kd-category-body flex-c-ss gap-2 p-4 w-full',
  // Category name.
  cardTitle: 'kd-category-title font-semibold text-base',
  // Optional description line.
  cardDescription: 'kd-category-description text-sm text-base-content/70 line-clamp-2',
  // Breadcrumb container on the detail view.
  breadcrumb: 'kd-category-breadcrumb flex-sc flex-wrap gap-1 text-sm text-base-content/70 mb-4',
  // Clickable breadcrumb crumb (the home link + every ancestor).
  breadcrumbItem: 'kd-category-breadcrumb-item kbtn kbtn-ghost kbtn-xs',
  // `/` separator between crumbs.
  breadcrumbSeparator: 'kd-category-breadcrumb-separator opacity-50 px-1',
  // Heading rendered above the sub-category list on a detail view.
  sectionTitle: 'kd-category-section-title text-sm font-semibold text-base-content/60 uppercase mt-6 mb-3',
  // Shown when the filtered list (or a leaf's sub-category list) is empty.
  emptyState: 'kd-category-empty text-base-content/60 italic py-8 text-center',
};

const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

/* ------------------------------------------------------------------ */
/* Per-variant layout config                                          */
/* ------------------------------------------------------------------ */

// Each variant sets:
//   - flex direction the card uses (row for `side`, column for the rest)
//   - extra classes layered on top of the `card` slot
//   - the grid's min column width (passed inline as gridTemplateColumns)
//   - extra classes for `cardMedia` (size / placement of image/icon)
//   - icon size when no image is present
//   - whether to render an overlay scrim over the media
const VARIANTS = {
  background: {
    cardExtras: 'flex-col min-h-44',
    minCol: 260,
    mediaExtras: 'absolute inset-0',
    bodyExtras: 'relative z-10 mt-auto bg-gradient-to-t from-base-100/95 via-base-100/85 to-transparent pt-12',
    iconSize: 64,
    overlay: true,
  },
  side: {
    cardExtras: 'flex-row items-stretch',
    minCol: 320,
    mediaExtras: 'flex-cc w-1/3 min-h-32 shrink-0',
    bodyExtras: 'flex-1',
    iconSize: 48,
    overlay: false,
  },
  stacked: {
    cardExtras: 'flex-col',
    minCol: 240,
    mediaExtras: 'flex-cc w-full h-32',
    bodyExtras: '',
    iconSize: 48,
    overlay: false,
  },
  'icon-only': {
    cardExtras: 'flex-col items-center text-center',
    minCol: 180,
    mediaExtras: 'flex-cc pt-6',
    bodyExtras: 'items-center',
    iconSize: 56,
    overlay: false,
  },
};

/* ------------------------------------------------------------------ */
/* Attribute readers                                                  */
/*                                                                    */
/* The widget reads the following category attributes (all optional): */
/*   Hidden               — boolean-shaped; respected by hideHidden    */
/*   <filterAttribute>    — boolean-shaped; opt-in via config          */
/*   Display Order        — numeric text; sorted by parseFloat         */
/*   <parentAttribute>    — parent category slug (default "Parent")    */
/*   <iconAttribute>      — Tabler icon name (default "Icon")          */
/*   <imageAttribute>     — image URL (default "Background Image")     */
/*   Description          — falls back to category.description         */
/* ------------------------------------------------------------------ */

const isHidden = cat => TRUTHY.has(lc(readAttribute(cat, 'Hidden')));

const matchesFilter = (cat, attrName) =>
  attrName ? TRUTHY.has(lc(readAttribute(cat, attrName))) : true;

// Display Order is stored as text on the category record. Parse to float;
// missing / non-numeric values sort to the end (alphabetical fallback by name).
const parseDisplayOrder = cat => {
  const v = readAttribute(cat, 'Display Order');
  if (v == null || v === '') return Number.POSITIVE_INFINITY;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

const getParentSlug = (cat, parentAttribute) => {
  const v = readAttribute(cat, parentAttribute);
  return v ? String(v).trim() : null;
};

// Tabler icon names are kebab-case lowercase; coerce so a designer entering
// 'Settings' resolves to the right icon.
const getIconName = (cat, attrName) => {
  if (!attrName) return null;
  const v = readAttribute(cat, attrName);
  return v ? lc(v) : null;
};

const getImageUrl = (cat, attrName) => {
  if (!attrName) return null;
  const v = readAttribute(cat, attrName);
  return v ? String(v).trim() : null;
};

const getCategoryDescription = cat =>
  readAttribute(cat, 'Description') || cat.description || '';

/* ------------------------------------------------------------------ */
/* Sort + filter                                                      */
/* ------------------------------------------------------------------ */

const sortCategories = (list, orderBy, orderDirection) => {
  const dir = orderDirection === 'desc' ? -1 : 1;
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

  if (orderBy === 'name') {
    return [...list].sort((a, b) => byName(a, b) * dir);
  }
  if (orderBy === 'createdat') {
    return [...list].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      if (ta !== tb) return (ta - tb) * dir;
      return byName(a, b); // tie-break stays alphabetical ascending
    });
  }
  // displayorder (default)
  return [...list].sort((a, b) => {
    const oa = parseDisplayOrder(a);
    const ob = parseDisplayOrder(b);
    if (oa !== ob) return (oa - ob) * dir;
    return byName(a, b);
  });
};

const filterCategories = (list, { hideHidden, filterAttribute }) => {
  let out = list;
  if (hideHidden) out = out.filter(c => !isHidden(c));
  if (filterAttribute) out = out.filter(c => matchesFilter(c, filterAttribute));
  return out;
};

/* ------------------------------------------------------------------ */
/* Nesting helpers                                                    */
/* ------------------------------------------------------------------ */

const buildSlugMap = categories => {
  const map = new Map();
  for (const cat of categories) map.set(cat.slug, cat);
  return map;
};

// Walks the Parent attribute chain from `slug` up to the root. Returns the
// path ordered root → current (so the breadcrumb renders left-to-right).
// Cycle protection: a visited-set bails out if a parent eventually points
// back to a category we already saw, instead of looping forever.
const walkBreadcrumb = (slug, slugMap, parentAttribute) => {
  const path = [];
  const visited = new Set();
  let current = slug ? slugMap.get(slug) : null;
  while (current) {
    if (visited.has(current.slug)) {
      console.warn(
        `Categories Widget Warning: Parent cycle detected at "${current.slug}" — stopping breadcrumb walk.`,
      );
      break;
    }
    visited.add(current.slug);
    path.unshift(current);
    const parentSlug = getParentSlug(current, parentAttribute);
    if (!parentSlug) break;
    current = slugMap.get(parentSlug);
  }
  return path;
};

const getChildren = (categories, parentSlug, parentAttribute) =>
  categories.filter(c => getParentSlug(c, parentAttribute) === parentSlug);

/* ------------------------------------------------------------------ */
/* Slot-class helper (copied from Profile, profile.jsx:334-345)        */
/* ------------------------------------------------------------------ */

const makeCn = config => (slot, ...extra) => {
  const base = clsx(SLOT_DEFAULTS[slot], ...extra);
  const override = config.classNames?.[slot];
  if (override == null) return base;
  if (typeof override === 'string') return clsx(base, override);
  // { add?, remove? } shape — first strip listed tokens out of the resolved
  // base, then append `add`. Removal is reliable even when Tailwind's content
  // scan can't see the override class because it lives in form bundle code.
  const removeList = Array.isArray(override.remove) ? override.remove : null;
  const filtered =
    removeList && removeList.length > 0
      ? base.split(/\s+/).filter(t => t && !removeList.includes(t)).join(' ')
      : base;
  return clsx(filtered, override.add);
};

/* ------------------------------------------------------------------ */
/* Components                                                         */
/* ------------------------------------------------------------------ */

const CategoryMedia = ({ iconName, imageUrl, variant, cn, iconSize, overlayClass }) => {
  const v = VARIANTS[variant];
  // Render the media slot unconditionally — even when a category has neither
  // an icon nor an image — so the empty placeholder preserves grid alignment
  // across rows. Cards without media still show the slot's background color
  // and reserve the same height as their populated neighbors.
  const size = resolveIconSize(iconSize, v.iconSize);
  return (
    <div className={cn('cardMedia', v.mediaExtras)}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className={cn('cardImage')} />
      ) : iconName ? (
        <span className={cn('cardIcon', 'flex-cc')}>
          <Icon name={iconName} size={size} />
        </span>
      ) : null}
      {v.overlay && imageUrl && (
        <div className={overlayClass} aria-hidden="true" />
      )}
    </div>
  );
};

const CategoryCard = ({ category, variant, cn, showDescription, iconAttribute, imageAttribute, iconSize, onClick }) => {
  const v = VARIANTS[variant];
  const iconName = getIconName(category, iconAttribute);
  const imageUrl = getImageUrl(category, imageAttribute);
  const description = getCategoryDescription(category);

  const overlayClass = cn(
    'cardOverlay',
    'absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/40 to-transparent pointer-events-none',
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('card', v.cardExtras)}
    >
      <CategoryMedia
        iconName={iconName}
        imageUrl={imageUrl}
        variant={variant}
        cn={cn}
        iconSize={iconSize}
        overlayClass={overlayClass}
      />
      <div className={cn('cardBody', v.bodyExtras)}>
        <span className={cn('cardTitle')}>{category.name}</span>
        {showDescription && description && (
          <span className={cn('cardDescription')}>{description}</span>
        )}
      </div>
    </button>
  );
};

const Breadcrumb = ({ path, cn, homeLabel, onNavigate }) => (
  <nav className={cn('breadcrumb')} aria-label="Category breadcrumb">
    <button
      type="button"
      onClick={() => onNavigate(null)}
      className={cn('breadcrumbItem')}
    >
      {homeLabel}
    </button>
    {path.map((cat, idx) => {
      const isLast = idx === path.length - 1;
      return (
        <Fragment key={cat.slug}>
          <span className={cn('breadcrumbSeparator')} aria-hidden="true">/</span>
          {isLast ? (
            <span className={cn('breadcrumbItem', 'pointer-events-none opacity-100')}>
              {cat.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate(cat.slug)}
              className={cn('breadcrumbItem')}
            >
              {cat.name}
            </button>
          )}
        </Fragment>
      );
    })}
  </nav>
);

const CategoryGrid = ({ items, variant, cn, showDescription, iconAttribute, imageAttribute, iconSize, onCardClick }) => {
  const v = VARIANTS[variant];
  return (
    <div
      className={cn('grid')}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${v.minCol}px, 1fr))`,
        gridAutoRows: '1fr',
        gap: '1rem',
      }}
    >
      {items.map(cat => (
        <CategoryCard
          key={cat.slug}
          category={cat}
          variant={variant}
          cn={cn}
          showDescription={showDescription}
          iconAttribute={iconAttribute}
          imageAttribute={imageAttribute}
          iconSize={iconSize}
          onClick={() => onCardClick(cat)}
        />
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Config normalization                                               */
/* ------------------------------------------------------------------ */

const normalizeConfig = (config = {}) => {
  const out = { ...config };
  for (const key of ['cardVariant', 'orderBy', 'orderDirection', 'navigationMode']) {
    if (typeof out[key] === 'string') out[key] = lc(out[key]);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Main app component                                                 */
/* ------------------------------------------------------------------ */

const CategoriesContent = ({ config: rawConfig, onCategoryClick }) => {
  const config = useMemo(() => normalizeConfig(rawConfig), [rawConfig]);
  const {
    kappSlug: explicitKappSlug = null,
    parentAttribute = 'Parent',
    hideHidden = true,
    filterAttribute = null,
    limit = null,
    orderBy: rawOrderBy = 'displayorder',
    orderDirection: rawOrderDirection = 'asc',
    cardVariant: rawCardVariant = 'stacked',
    iconAttribute = 'Icon',
    imageAttribute = 'Background Image',
    iconSize = null,
    showDescription = true,
    showBreadcrumb = true,
    breadcrumbHomeLabel = 'All',
    subCategoriesTitle = 'Categories',
    emptyText = 'No categories to display',
    loadingText = 'Loading categories…',
    categoryClickAction,
    className,
    debug = false,
  } = config;

  // Resolve enums with safe fallbacks.
  const orderBy = ORDER_BY.includes(rawOrderBy) ? rawOrderBy : 'displayorder';
  const orderDirection = ORDER_DIRECTIONS.includes(rawOrderDirection)
    ? rawOrderDirection
    : 'asc';
  const cardVariant = CARD_VARIANTS.includes(rawCardVariant)
    ? rawCardVariant
    : 'stacked';

  const reduxKapp = useSelector(s => s.app.kapp);
  const [currentSlug, setCurrentSlug] = useState(null);

  // Resolve which kapp's categories we're showing:
  //   - explicit config.kappSlug (escape hatch — render any kapp's categories
  //     regardless of where the user has navigated)
  //   - else whichever kapp Redux currently holds (which now follows the URL
  //     via the App.jsx URL → kappSlug effect)
  const targetKappSlug = explicitKappSlug || reduxKapp?.slug || null;
  // When the target matches Redux, use Redux. When it differs (explicit slug
  // pointing at a kapp other than the current one), fetch that kapp ourselves
  // so the widget can render cross-kapp without disturbing global state.
  const useRedux = targetKappSlug && reduxKapp?.slug === targetKappSlug;

  const fetchParams = useMemo(
    () =>
      useRedux || !targetKappSlug
        ? null
        : {
            kappSlug: targetKappSlug,
            include: 'categories,categories.attributesMap',
          },
    [useRedux, targetKappSlug],
  );
  const { loading: fetchLoading, response: fetched } = useData(
    fetchKapp,
    fetchParams,
  );

  const categories = useMemo(() => {
    if (useRedux) return reduxKapp?.categories || [];
    return fetched?.kapp?.categories || [];
  }, [useRedux, reduxKapp, fetched]);

  // Optional diagnostic: when `debug: true` is set in config, log what the
  // widget is reading every time it computes a new result. Helpful when the
  // widget renders empty and you want to know whether it's a state problem
  // (no kapp / no categories loaded) or a filtering problem (kapp +
  // categories present but every one is hidden or nested).
  useEffect(() => {
    if (!debug) return;
    /* eslint-disable no-console */
    console.groupCollapsed('[Categories widget] data snapshot');
    console.log('source:', useRedux ? 'redux' : explicitKappSlug ? 'fetch' : '(none)');
    console.log('targetKappSlug:', targetKappSlug ?? '(none)');
    console.log('reduxKapp?.slug:', reduxKapp?.slug ?? '(no kapp in redux)');
    console.log('categories.length:', categories.length);
    if (categories.length > 0) {
      console.table(
        categories.map(c => ({
          slug: c.slug,
          name: c.name,
          hidden: readAttribute(c, 'Hidden') ?? '',
          parent: readAttribute(c, parentAttribute) ?? '',
          displayOrder: readAttribute(c, 'Display Order') ?? '',
          icon: (iconAttribute && readAttribute(c, iconAttribute)) ?? '',
          image: (imageAttribute && readAttribute(c, imageAttribute)) ?? '',
          description: readAttribute(c, 'Description') ?? c.description ?? '',
        })),
      );
    }
    console.groupEnd();
    /* eslint-enable no-console */
  }, [
    debug,
    useRedux,
    explicitKappSlug,
    targetKappSlug,
    reduxKapp,
    categories,
    parentAttribute,
    iconAttribute,
    imageAttribute,
  ]);

  // If the categories list changes (kapp reloaded), drop the current selection
  // if the previously-selected slug no longer exists.
  useEffect(() => {
    if (!currentSlug) return;
    if (!categories.some(c => c.slug === currentSlug)) setCurrentSlug(null);
  }, [categories, currentSlug]);

  const cn = useMemo(() => makeCn(config), [config]);

  const slugMap = useMemo(() => buildSlugMap(categories), [categories]);

  const visible = useMemo(
    () =>
      sortCategories(
        filterCategories(categories, { hideHidden, filterAttribute }),
        orderBy,
        orderDirection,
      ),
    [categories, hideHidden, filterAttribute, orderBy, orderDirection],
  );

  const children = useMemo(
    () => getChildren(visible, currentSlug, parentAttribute),
    [visible, currentSlug, parentAttribute],
  );

  const limited = useMemo(
    () => (limit && limit > 0 ? children.slice(0, limit) : children),
    [children, limit],
  );

  const breadcrumbPath = useMemo(
    () =>
      currentSlug ? walkBreadcrumb(currentSlug, slugMap, parentAttribute) : [],
    [currentSlug, slugMap, parentAttribute],
  );

  const handleCardClick = cat => {
    if (typeof categoryClickAction === 'function') {
      // Escape hatch. The caller-supplied function gets the full category and
      // a default navigator it can choose to invoke (or skip).
      const navigateDefault = () => setCurrentSlug(cat.slug);
      categoryClickAction({ category: cat, navigate: navigateDefault });
      return;
    }
    if (typeof onCategoryClick === 'function') {
      onCategoryClick(cat);
    }
    setCurrentSlug(cat.slug);
  };

  const isDetailView = currentSlug != null;

  return (
    <div className={cn('root', className)}>
      {isDetailView && showBreadcrumb && (
        <Breadcrumb
          path={breadcrumbPath}
          cn={cn}
          homeLabel={breadcrumbHomeLabel}
          onNavigate={setCurrentSlug}
        />
      )}

      {isDetailView && subCategoriesTitle && limited.length > 0 && (
        <h3 className={cn('sectionTitle')}>{subCategoriesTitle}</h3>
      )}

      {limited.length > 0 ? (
        <CategoryGrid
          items={limited}
          variant={cardVariant}
          cn={cn}
          showDescription={showDescription}
          iconAttribute={iconAttribute}
          imageAttribute={imageAttribute}
          iconSize={iconSize}
          onCardClick={handleCardClick}
        />
      ) : fetchLoading ? (
        <div className={cn('emptyState')}>{loadingText}</div>
      ) : (
        <div className={cn('emptyState')}>{emptyText}</div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* forwardRef wrapper + WidgetAPI                                     */
/* ------------------------------------------------------------------ */

const CategoriesComponent = forwardRef(({ config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [currentConfig, setCurrentConfig] = useState(config);

  useEffect(() => {
    setCurrentConfig(config);
  }, [config]);

  api.current.update = patch =>
    setCurrentConfig(prev => ({ ...prev, ...(patch || {}) }));

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture}>
          <CategoriesContent config={currentConfig} />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

/* ------------------------------------------------------------------ */
/* Config validation                                                  */
/* ------------------------------------------------------------------ */

const validateClassNames = (classNames, widgetName) => {
  if (classNames == null) return true;
  if (typeof classNames !== 'object' || Array.isArray(classNames)) {
    console.error(
      `${widgetName} Widget Error: config.classNames must be an object keyed by slot name.`,
    );
    return false;
  }
  for (const [slot, value] of Object.entries(classNames)) {
    if (!SLOT_NAMES.includes(slot)) {
      console.warn(
        `${widgetName} Widget Warning: config.classNames.${slot} is not a recognized slot (expected one of ${SLOT_NAMES.join(', ')}). The entry is ignored.`,
      );
      continue;
    }
    if (value == null) continue;
    if (typeof value === 'string') continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (value.add != null && typeof value.add !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.classNames.${slot}.add must be a string when provided.`,
        );
        return false;
      }
      if (value.remove != null) {
        if (
          !Array.isArray(value.remove) ||
          !value.remove.every(s => typeof s === 'string')
        ) {
          console.error(
            `${widgetName} Widget Error: config.classNames.${slot}.remove must be an array of strings.`,
          );
          return false;
        }
      }
      continue;
    }
    console.error(
      `${widgetName} Widget Error: config.classNames.${slot} must be a string or { add?, remove? } object.`,
    );
    return false;
  }
  return true;
};

const checkEnum = (value, allowed, fieldName) => {
  if (value == null) return true;
  if (typeof value !== 'string' || !allowed.includes(lc(value))) {
    console.error(
      `Categories Widget Error: ${fieldName} must be one of ${allowed.join(', ')}.`,
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  if (!checkEnum(config.cardVariant, CARD_VARIANTS, 'cardVariant')) return false;
  if (!checkEnum(config.orderBy, ORDER_BY, 'orderBy')) return false;
  if (!checkEnum(config.orderDirection, ORDER_DIRECTIONS, 'orderDirection'))
    return false;
  if (!checkEnum(config.navigationMode, NAVIGATION_MODES, 'navigationMode'))
    return false;
  for (const k of ['hideHidden', 'showDescription', 'showBreadcrumb']) {
    if (config[k] != null && typeof config[k] !== 'boolean') {
      console.error(`Categories Widget Error: ${k} must be a boolean.`);
      return false;
    }
  }
  for (const k of [
    'kappSlug',
    'parentAttribute',
    'filterAttribute',
    'iconAttribute',
    'imageAttribute',
    'breadcrumbHomeLabel',
    'subCategoriesTitle',
    'emptyText',
    'loadingText',
    'className',
  ]) {
    if (config[k] != null && typeof config[k] !== 'string') {
      console.error(`Categories Widget Error: ${k} must be a string.`);
      return false;
    }
  }
  if (
    config.limit != null &&
    !(typeof config.limit === 'number' && Number.isFinite(config.limit) && config.limit >= 0)
  ) {
    console.error('Categories Widget Error: limit must be a non-negative number.');
    return false;
  }
  if (config.iconSize != null) {
    const isPositiveNumber =
      typeof config.iconSize === 'number' &&
      Number.isFinite(config.iconSize) &&
      config.iconSize > 0;
    const isPreset =
      typeof config.iconSize === 'string' &&
      Object.prototype.hasOwnProperty.call(
        ICON_SIZE_PRESETS,
        config.iconSize.trim().toLowerCase(),
      );
    if (!isPositiveNumber && !isPreset) {
      console.error(
        "Categories Widget Error: iconSize must be a positive number or one of 'sm', 'md', 'lg', 'xl'.",
      );
      return false;
    }
  }
  if (
    config.categoryClickAction != null &&
    typeof config.categoryClickAction !== 'function'
  ) {
    console.error(
      'Categories Widget Error: categoryClickAction must be a function.',
    );
    return false;
  }
  if (config.debug != null && typeof config.debug !== 'boolean') {
    console.error('Categories Widget Error: debug must be a boolean.');
    return false;
  }
  if (!validateClassNames(config.classNames, 'Categories')) return false;
  return true;
};

/* ------------------------------------------------------------------ */
/* Public widget function                                             */
/* ------------------------------------------------------------------ */

/**
 * Initializes a Categories widget instance.
 *
 * Renders the categories of the current kapp as cards in a CSS-grid layout.
 * Click a card → drill into that category's sub-categories (via the
 * `Parent` attribute convention) with a breadcrumb. Navigation is purely
 * client-side in v1 (`navigationMode: 'widget'`).
 *
 * Category presentation reads from optional per-category attributes:
 *
 *   Parent           (slug of parent category — convention; configurable)
 *   Icon             (Tabler icon name; attr name configurable)
 *   Background Image (image URL; attr name configurable)
 *   Description      (falls back to category.description)
 *   Hidden           ('true' hides the category by default)
 *   Display Order    (numeric sort key for orderBy='displayOrder')
 *   <filterAttribute>(opt-in boolean filter, e.g. 'Promoted')
 *
 * Example:
 *
 *   bundle.widgets.Categories({
 *     container: K('content[Catalog]').element(),
 *     config: { cardVariant: 'stacked' },
 *     id: 'service-catalog',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container DOM element or an
 *   array-like whose first entry is one (e.g. `K('content[...]').element()`).
 * @param {Object} [config] Configuration object. All fields optional.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const Categories = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Categories');
  if (resolved && validateConfig(config)) {
    return registerWidget(Categories, {
      container: resolved,
      Component: CategoriesComponent,
      props: { config },
      id,
    });
  }
  return Promise.reject(
    'The Categories widget parameters are invalid. See the console for more details.',
  );
};
