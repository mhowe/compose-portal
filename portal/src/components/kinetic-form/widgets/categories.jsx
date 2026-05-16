import { Fragment, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { useInternalLinkInterceptor } from './chrome-utils.jsx';
import {
  CARD_VARIANTS,
  VARIANTS,
  SIZES,
  SIZE_TEXT,
  SIZE_LAYOUT,
  CARD_WIDTHS,
  TEXT_VERTICAL,
  TEXT_HORIZONTAL,
  TEXT_VERTICAL_CLASS,
  TEXT_HORIZONTAL_CLASS,
  ICON_SIZE_PRESETS,
  resolveIconSize,
  makeCn,
  validateClassNames,
} from './card-helpers.js';
import { store } from '../../../redux.js';
import { readAttribute } from '../../../helpers/setup.js';
import { widgetActions } from '../../../helpers/state.js';
import { useKappContext } from '../../../helpers/widget-context.js';
import { Icon } from '../../../atoms/Icon.jsx';

/* ------------------------------------------------------------------ */
/* Enums + truthy table                                               */
/* ------------------------------------------------------------------ */

// CARD_VARIANTS, TEXT_VERTICAL, TEXT_HORIZONTAL, SIZES, SIZE_TEXT,
// SIZE_LAYOUT, VARIANTS, ICON_SIZE_PRESETS, resolveIconSize, makeCn, and
// validateClassNames all live in ./card-helpers.js so the Forms widget (and
// any future card-style widget) can share the same vocabulary.

const ORDER_BY = ['displayorder', 'name', 'createdat'];
const ORDER_DIRECTIONS = ['asc', 'desc'];
const NAVIGATION_MODES = ['widget']; // 'url' and 'page' deferred to v2
const FORM_COUNT_PLACEMENTS = ['title-right', 'inline', 'corner'];
// Top-level presentation mode. 'cards' uses the full card vocabulary
// (cardVariant, size, slot system, etc.). 'list' renders a hierarchical
// text tree — same data, same click semantics, no visual chrome. 'picker'
// is intentionally absent in v1 while the unified category+form picker
// design is being worked out separately.
const PRESENTATIONS = ['cards', 'list'];

// Render-time classes layered on top of the `cardFormCount` slot default for
// each placement. The slot default stays placement-agnostic (text styling
// only); these handle layout and image-legibility.
const FORM_COUNT_PLACEMENT_EXTRAS = {
  'title-right': 'whitespace-nowrap shrink-0',
  inline: '',
  corner:
    'absolute top-2 right-2 z-20 rounded-full bg-base-100/80 backdrop-blur-sm px-2 py-0.5 shadow-sm',
};

const formatFormCount = count => {
  if (count === 1) return '1 form';
  return `${count || 0} forms`;
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
  // Title + description container. Padding scales with `size` and is layered
  // on at render — the slot default stays padding-free so designers can
  // override without fighting a hard-coded `p-4`.
  cardBody: 'kd-category-body flex-c-ss gap-2 w-full',
  // Category name. Font size scales with `size`.
  cardTitle: 'kd-category-title font-semibold',
  // Form-count badge rendered between title and description when
  // `showFormCount: true`. Reads the count from the kapp's `categorizations`
  // array — direct forms only (forms in descendant categories aren't summed).
  cardFormCount: 'kd-category-form-count text-xs font-medium text-base-content/60',
  // Optional description line. Font size scales with `size`.
  cardDescription: 'kd-category-description text-base-content/70 line-clamp-2',
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

  // ---- presentation: 'list' ----
  // Outer <ul> for the list rendering. Resets default browser list styling.
  listRoot: 'kd-category-list flex-c-st gap-0 m-0 p-0 list-none w-full',
  // Each list row's clickable element. Padding is moderate; indent comes from
  // the listIndent slot's inline padding-left applied at render-time per depth.
  listItem: 'kd-category-list-item flex-sc gap-2 w-full px-3 py-2 rounded-md cursor-pointer hover:bg-base-200 transition text-left text-base-content',
  // Layered on top of listItem when the item's slug matches currentSlug —
  // gives the picked category a visual highlight in the tree.
  listItemActive: 'bg-base-200 font-semibold',
  // Icon wrapper inside a list row. Renders unconditionally when
  // `iconAttribute` is configured (even for categories with no icon value)
  // so names align across rows. The width matches the rendered icon size.
  listIcon: 'kd-category-list-icon flex-cc w-4 shrink-0 text-base-content/60',
  // Indent stripe rendered before the label per nesting level. Default is
  // empty (depth padding is applied as an inline style); override this slot
  // to draw tree-lines or any other indent treatment.
  listIndent: 'kd-category-list-indent',
};

const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

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

const filterCategories = (
  list,
  { hideHidden, filterAttribute, hideEmpty, formCounts, subtreeFormCounts },
) => {
  let out = list;
  if (hideHidden) out = out.filter(c => !isHidden(c));
  if (filterAttribute) out = out.filter(c => matchesFilter(c, filterAttribute));
  if (hideEmpty === 'subtree') {
    out = out.filter(c => (subtreeFormCounts?.get(c.slug) || 0) > 0);
  } else if (hideEmpty) {
    // true / 'direct' — only direct categorizations count
    out = out.filter(c => (formCounts?.get(c.slug) || 0) > 0);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Categorization helpers                                             */
/*                                                                    */
/* kapp.categorizations is a flat array of join records — each entry  */
/* is { category: { slug, ... }, form: { slug, name, ... } }. We      */
/* derive per-category form counts client-side from the array.        */
/* ------------------------------------------------------------------ */

// Map<categorySlug, count> — count of direct categorizations only.
const buildFormCounts = categorizations => {
  const map = new Map();
  for (const c of categorizations || []) {
    const slug = c?.category?.slug;
    if (slug) map.set(slug, (map.get(slug) || 0) + 1);
  }
  return map;
};

// Map<categorySlug, count> — count of this category's direct forms PLUS the
// form counts of every descendant category (via the Parent attribute chain).
// Cycle protection: a per-recursion visited set prevents A↔B Parent loops
// from spinning. Results are memoized within the build so a deeply-shared
// subtree isn't recomputed.
const buildSubtreeFormCounts = (categories, formCounts, parentAttribute) => {
  const childrenBySlug = new Map();
  for (const cat of categories) {
    const ps = getParentSlug(cat, parentAttribute);
    if (ps) {
      if (!childrenBySlug.has(ps)) childrenBySlug.set(ps, []);
      childrenBySlug.get(ps).push(cat.slug);
    }
  }
  const result = new Map();
  const compute = (slug, visited) => {
    if (result.has(slug)) return result.get(slug);
    if (visited.has(slug)) return 0; // cycle — bail at this point
    visited.add(slug);
    let count = formCounts.get(slug) || 0;
    const childSlugs = childrenBySlug.get(slug) || [];
    for (const childSlug of childSlugs) count += compute(childSlug, visited);
    visited.delete(slug);
    result.set(slug, count);
    return count;
  };
  for (const cat of categories) compute(cat.slug, new Set());
  return result;
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
/* Components                                                         */
/* ------------------------------------------------------------------ */

const CategoryMedia = ({ iconName, imageUrl, variant, size, cn, iconSize, overlayClass }) => {
  const v = VARIANTS[variant];
  const layout = SIZE_LAYOUT[variant][size];
  // Render the media slot unconditionally — even when a category has neither
  // an icon nor an image — so the empty placeholder preserves grid alignment
  // across rows. Cards without media still show the slot's background color
  // and reserve the same height as their populated neighbors.
  const iconPx = resolveIconSize(iconSize, layout.iconSize);
  return (
    <div className={cn('cardMedia', v.mediaExtras, layout.mediaExtra)}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className={cn('cardImage')} />
      ) : iconName ? (
        <span className={cn('cardIcon', 'flex-cc')}>
          <Icon name={iconName} size={iconPx} />
        </span>
      ) : null}
      {v.overlay && imageUrl && (
        <div className={overlayClass} aria-hidden="true" />
      )}
    </div>
  );
};

const CategoryCard = ({
  category,
  variant,
  size,
  cn,
  showDescription,
  showFormCount,
  formCount,
  formCountPlacement,
  textVertical,
  textHorizontal,
  iconAttribute,
  imageAttribute,
  iconSize,
  onClick,
}) => {
  const v = VARIANTS[variant];
  const sizeText = SIZE_TEXT[size];
  const sizeLayout = SIZE_LAYOUT[variant][size];
  const iconName = getIconName(category, iconAttribute);
  const imageUrl = getImageUrl(category, imageAttribute);
  const description = getCategoryDescription(category);

  const overlayClass = cn(
    'cardOverlay',
    'absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/40 to-transparent pointer-events-none',
  );

  const showCount = showFormCount;
  const countText = showCount ? formatFormCount(formCount) : null;
  const cornerCount = showCount && formCountPlacement === 'corner';
  const titleRightCount = showCount && formCountPlacement === 'title-right';
  const inlineCount = showCount && formCountPlacement === 'inline';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('card', v.cardExtras, sizeLayout.cardExtra)}
    >
      <CategoryMedia
        iconName={iconName}
        imageUrl={imageUrl}
        variant={variant}
        size={size}
        cn={cn}
        iconSize={iconSize}
        overlayClass={overlayClass}
      />
      {cornerCount && (
        <span className={cn('cardFormCount', FORM_COUNT_PLACEMENT_EXTRAS.corner)}>
          {countText}
        </span>
      )}
      <div
        className={cn(
          'cardBody',
          v.bodyExtras,
          sizeText.padding,
          TEXT_VERTICAL_CLASS[textVertical],
          TEXT_HORIZONTAL_CLASS[textHorizontal],
        )}
      >
        {titleRightCount ? (
          <div className="flex-sc gap-2 w-full">
            <span className={cn('cardTitle', sizeText.titleSize, 'flex-1')}>
              {category.name}
            </span>
            <span
              className={cn(
                'cardFormCount',
                FORM_COUNT_PLACEMENT_EXTRAS['title-right'],
              )}
            >
              {countText}
            </span>
          </div>
        ) : (
          <span className={cn('cardTitle', sizeText.titleSize)}>
            {category.name}
            {inlineCount && (
              <>
                <span className="opacity-50 mx-1.5" aria-hidden="true">·</span>
                <span
                  className={cn(
                    'cardFormCount',
                    FORM_COUNT_PLACEMENT_EXTRAS.inline,
                  )}
                >
                  {countText}
                </span>
              </>
            )}
          </span>
        )}
        {showDescription && description && (
          <span className={cn('cardDescription', sizeText.descSize)}>
            {description}
          </span>
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

const CategoryGrid = ({
  items,
  variant,
  size,
  cardWidth,
  cn,
  showDescription,
  showFormCount,
  formCountPlacement,
  textVertical,
  textHorizontal,
  formCounts,
  iconAttribute,
  imageAttribute,
  iconSize,
  onCardClick,
}) => {
  const sizeLayout = SIZE_LAYOUT[variant][size];
  // Column count is calculated at `min` in both modes (1fr is non-definite,
  // so grid auto-(fill|fit) uses the minimum). What changes is how empty
  // slots behave:
  //   'fixed'   → `auto-fill` keeps empty tracks; occupied cards stay at
  //               the same width whether the row is full or sparse.
  //   'stretch' → `auto-fit` collapses empty tracks; occupied cards
  //               stretch to fill the row.
  const repeatMode = cardWidth === 'stretch' ? 'auto-fit' : 'auto-fill';
  const trackTemplate = `repeat(${repeatMode}, minmax(${sizeLayout.min}px, 1fr))`;
  return (
    <div
      className={cn('grid')}
      style={{
        display: 'grid',
        gridTemplateColumns: trackTemplate,
        gridAutoRows: '1fr',
        gap: '1rem',
      }}
    >
      {items.map(cat => (
        <CategoryCard
          key={cat.slug}
          category={cat}
          variant={variant}
          size={size}
          cn={cn}
          showDescription={showDescription}
          showFormCount={showFormCount}
          formCount={formCounts?.get(cat.slug) || 0}
          formCountPlacement={formCountPlacement}
          textVertical={textVertical}
          textHorizontal={textHorizontal}
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
/* List presentation                                                  */
/*                                                                    */
/* Recursive tree rendering. Every category is visible at once with   */
/* nested categories indented one step further. Clicking any name     */
/* drills (sets currentSlug + fires categoryClickAction) — same as    */
/* card click. The currently-selected category receives the           */
/* `listItemActive` slot extras for visual feedback.                  */
/* ------------------------------------------------------------------ */

const ListItem = ({
  category,
  depth,
  cn,
  iconAttribute,
  currentSlug,
  childrenByParent,
  onItemClick,
  visited = new Set(),
}) => {
  if (visited.has(category.slug)) return null; // cycle guard
  const iconName = getIconName(category, iconAttribute);
  const isActive = currentSlug === category.slug;
  const kids = childrenByParent.get(category.slug) || [];
  // Pass a *new* visited set down each branch so siblings can re-visit the
  // same ancestors independently — only a true loop within one branch trips.
  const nextVisited = new Set(visited);
  nextVisited.add(category.slug);
  return (
    <li>
      <button
        type="button"
        onClick={() => onItemClick(category)}
        className={cn('listItem', isActive && cn('listItemActive'))}
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        {iconAttribute && (
          <span className={cn('listIcon')} aria-hidden="true">
            {iconName ? <Icon name={iconName} size={16} /> : null}
          </span>
        )}
        <span className="truncate">{category.name}</span>
      </button>
      {kids.length > 0 && (
        <ul className="kd-category-list-sublist m-0 p-0 list-none">
          {kids.map(kid => (
            <ListItem
              key={kid.slug}
              category={kid}
              depth={depth + 1}
              cn={cn}
              iconAttribute={iconAttribute}
              currentSlug={currentSlug}
              childrenByParent={childrenByParent}
              onItemClick={onItemClick}
              visited={nextVisited}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const CategoryList = ({
  topLevel,
  childrenByParent,
  cn,
  iconAttribute,
  currentSlug,
  onItemClick,
}) => (
  <ul className={cn('listRoot')}>
    {topLevel.map(cat => (
      <ListItem
        key={cat.slug}
        category={cat}
        depth={0}
        cn={cn}
        iconAttribute={iconAttribute}
        currentSlug={currentSlug}
        childrenByParent={childrenByParent}
        onItemClick={onItemClick}
      />
    ))}
  </ul>
);

/* ------------------------------------------------------------------ */
/* Config normalization                                               */
/* ------------------------------------------------------------------ */

const normalizeConfig = (config = {}) => {
  const out = { ...config };
  for (const key of [
    'presentation',
    'cardVariant',
    'size',
    'cardWidth',
    'orderBy',
    'orderDirection',
    'navigationMode',
    'formCountPlacement',
    'textVertical',
    'textHorizontal',
  ]) {
    if (typeof out[key] === 'string') out[key] = lc(out[key]);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Main app component                                                 */
/* ------------------------------------------------------------------ */

const CategoriesContent = ({ config: rawConfig, onCategoryClick, onSelectionChange }) => {
  const config = useMemo(() => normalizeConfig(rawConfig), [rawConfig]);
  const {
    kappSlug: explicitKappSlug = null,
    parentAttribute = 'Parent',
    hideHidden = true,
    hideEmpty = false,
    filterAttribute = null,
    limit = null,
    orderBy: rawOrderBy = 'displayorder',
    orderDirection: rawOrderDirection = 'asc',
    presentation: rawPresentation = 'cards',
    cardVariant: rawCardVariant = 'stacked',
    size: rawSize = 'md',
    cardWidth: rawCardWidth = 'fixed',
    iconAttribute = 'Icon',
    imageAttribute = 'Background Image',
    iconSize = null,
    showDescription = true,
    showFormCount = false,
    formCountPlacement: rawFormCountPlacement = 'title-right',
    textVertical: rawTextVertical = 'top',
    textHorizontal: rawTextHorizontal = 'left',
    showBreadcrumb = true,
    breadcrumbHomeLabel = 'All',
    subCategoriesTitle = 'Categories',
    emptyText = 'No categories to display',
    categoryClickAction,
    className,
    debug = false,
  } = config;

  // Resolve enums with safe fallbacks.
  const presentation = PRESENTATIONS.includes(rawPresentation)
    ? rawPresentation
    : 'cards';
  const orderBy = ORDER_BY.includes(rawOrderBy) ? rawOrderBy : 'displayorder';
  const orderDirection = ORDER_DIRECTIONS.includes(rawOrderDirection)
    ? rawOrderDirection
    : 'asc';
  const cardVariant = CARD_VARIANTS.includes(rawCardVariant)
    ? rawCardVariant
    : 'stacked';
  const size = SIZES.includes(rawSize) ? rawSize : 'md';
  const cardWidth = CARD_WIDTHS.includes(rawCardWidth) ? rawCardWidth : 'fixed';
  const formCountPlacement = FORM_COUNT_PLACEMENTS.includes(
    rawFormCountPlacement,
  )
    ? rawFormCountPlacement
    : 'title-right';
  const textVertical = TEXT_VERTICAL.includes(rawTextVertical)
    ? rawTextVertical
    : 'top';
  const textHorizontal = TEXT_HORIZONTAL.includes(rawTextHorizontal)
    ? rawTextHorizontal
    : 'left';

  // Resolve which kapp's categories we're showing via the shared
  // useKappContext hook:
  //   - explicit config.kappSlug → pin to that slug
  //   - else 'auto' (default) → use the nearest BundleContainer's published
  //     kapp slug if this widget is rendered inside one; otherwise fall
  //     through to the global URL-driven kapp.
  // Either way the kapp record comes out of the shared cache (populated by
  // App.jsx's bulk space fetch) — no extra network call.
  const { kapp: targetKapp, slug: targetKappSlug } = useKappContext({
    kappSlug: explicitKappSlug || 'auto',
  });
  // Stable empty-array fallback so downstream useMemo / useEffect deps don't
  // see a new reference on every render when the target kapp has no
  // categories (or hasn't landed in the cache yet).
  const categories = useMemo(
    () => targetKapp?.categories || [],
    [targetKapp],
  );
  const categorizations = useMemo(
    () => targetKapp?.categorizations || [],
    [targetKapp],
  );

  // Per-category form counts derived from the cached `categorizations` array.
  // Always computed (cheap — one pass over the join array) so the badge can
  // read it without a separate code path; `subtreeFormCounts` is only built
  // when `hideEmpty === 'subtree'` because the recursive walk is wasted work
  // otherwise.
  const formCounts = useMemo(
    () => buildFormCounts(categorizations),
    [categorizations],
  );
  const subtreeFormCounts = useMemo(
    () =>
      hideEmpty === 'subtree'
        ? buildSubtreeFormCounts(categories, formCounts, parentAttribute)
        : null,
    [hideEmpty, categories, formCounts, parentAttribute],
  );

  const [currentSlug, setCurrentSlug] = useState(null);

  // Optional diagnostic: when `debug: true` is set in config, log what the
  // widget is reading every time it computes a new result. Helpful when the
  // widget renders empty and you want to know whether it's a state problem
  // (target kapp not in cache) or a filtering problem (categories present
  // but every one is hidden or nested).
  useEffect(() => {
    if (!debug) return;
    console.groupCollapsed('[Categories widget] data snapshot');
    console.log('targetKappSlug:', targetKappSlug ?? '(none)');
    console.log('targetKapp in cache:', !!targetKapp);
    console.log('categories.length:', categories.length);
    console.log('categorizations.length:', categorizations.length);
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
          formCount: formCounts.get(c.slug) || 0,
          subtreeFormCount: subtreeFormCounts?.get(c.slug) ?? '(not computed)',
        })),
      );
    }
    console.groupEnd();
  }, [
    debug,
    targetKappSlug,
    targetKapp,
    categories,
    categorizations,
    parentAttribute,
    iconAttribute,
    imageAttribute,
    formCounts,
    subtreeFormCounts,
  ]);

  // If the categories list changes (kapp reloaded), drop the current selection
  // if the previously-selected slug no longer exists.
  useEffect(() => {
    if (!currentSlug) return;
    if (!categories.some(c => c.slug === currentSlug)) setCurrentSlug(null);
  }, [categories, currentSlug]);

  // Publish the current selection to the shared widgets slice so a sibling
  // Forms widget (auto-bind mode) can observe it without explicit wiring.
  // Keyed by the resolved kapp slug so two unrelated kapps on one page each
  // track their own selection. On unmount the entry is cleared, so a Forms
  // widget that outlives this Categories widget falls back to its default
  // "all forms in kapp" view.
  //
  // Also forwards the change up to the forwardRef wrapper so the widget's
  // imperative `getSelection()` API can return the current slug without
  // reaching into Redux.
  useEffect(() => {
    if (typeof onSelectionChange === 'function') onSelectionChange(currentSlug);
    if (!targetKappSlug) return;
    widgetActions.setCategorySelection({
      kappSlug: targetKappSlug,
      categorySlug: currentSlug,
    });
    return () => {
      widgetActions.setCategorySelection({
        kappSlug: targetKappSlug,
        categorySlug: null,
      });
    };
  }, [targetKappSlug, currentSlug, onSelectionChange]);

  const cn = useMemo(() => makeCn(SLOT_DEFAULTS, config), [config]);

  const slugMap = useMemo(() => buildSlugMap(categories), [categories]);

  const visible = useMemo(
    () =>
      sortCategories(
        filterCategories(categories, {
          hideHidden,
          filterAttribute,
          hideEmpty,
          formCounts,
          subtreeFormCounts,
        }),
        orderBy,
        orderDirection,
      ),
    [
      categories,
      hideHidden,
      filterAttribute,
      hideEmpty,
      formCounts,
      subtreeFormCounts,
      orderBy,
      orderDirection,
    ],
  );

  const children = useMemo(
    () => getChildren(visible, currentSlug, parentAttribute),
    [visible, currentSlug, parentAttribute],
  );

  const limited = useMemo(
    () => (limit && limit > 0 ? children.slice(0, limit) : children),
    [children, limit],
  );

  // List presentation builds its own top-level + children-by-parent maps so
  // the recursive tree shows every visible category at once (vs. the cards
  // presentation, which only renders direct children of currentSlug).
  const visibleSlugs = useMemo(
    () => new Set(visible.map(c => c.slug)),
    [visible],
  );
  const listTopLevel = useMemo(() => {
    if (presentation !== 'list') return [];
    const tops = visible.filter(c => {
      const ps = getParentSlug(c, parentAttribute);
      return !ps || !visibleSlugs.has(ps);
    });
    return limit && limit > 0 ? tops.slice(0, limit) : tops;
  }, [presentation, visible, visibleSlugs, parentAttribute, limit]);
  const childrenByParent = useMemo(() => {
    if (presentation !== 'list') return new Map();
    const map = new Map();
    for (const cat of visible) {
      const ps = getParentSlug(cat, parentAttribute);
      if (ps) {
        if (!map.has(ps)) map.set(ps, []);
        map.get(ps).push(cat);
      }
    }
    return map;
  }, [presentation, visible, parentAttribute]);

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

  // List presentation: render the whole tree at once. Breadcrumb and the
  // "Categories" section title don't apply (the full hierarchy is already
  // visible in-place). Empty top-level → emptyText.
  if (presentation === 'list') {
    return (
      <div className={cn('root', className)}>
        {listTopLevel.length > 0 ? (
          <CategoryList
            topLevel={listTopLevel}
            childrenByParent={childrenByParent}
            cn={cn}
            iconAttribute={iconAttribute}
            currentSlug={currentSlug}
            onItemClick={handleCardClick}
          />
        ) : (
          <div className={cn('emptyState')}>{emptyText}</div>
        )}
      </div>
    );
  }

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
          size={size}
          cardWidth={cardWidth}
          cn={cn}
          showDescription={showDescription}
          showFormCount={showFormCount}
          formCountPlacement={formCountPlacement}
          textVertical={textVertical}
          textHorizontal={textHorizontal}
          formCounts={formCounts}
          iconAttribute={iconAttribute}
          imageAttribute={imageAttribute}
          iconSize={iconSize}
          onCardClick={handleCardClick}
        />
      ) : isDetailView ? null : (
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
  // Mirror of the inner widget's currentSlug — published by CategoriesContent
  // via the onSelectionChange callback. Used by the imperative getSelection()
  // API so callers can read the selection without reaching into Redux.
  const selectionRef = useRef(null);

  useEffect(() => {
    setCurrentConfig(config);
  }, [config]);

  api.current.update = patch =>
    setCurrentConfig(prev => ({ ...prev, ...(patch || {}) }));
  api.current.getSelection = () => selectionRef.current;

  const handleSelectionChange = slug => {
    selectionRef.current = slug || null;
  };

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture}>
          <CategoriesContent
            config={currentConfig}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

/* ------------------------------------------------------------------ */
/* Config validation                                                  */
/* ------------------------------------------------------------------ */

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
  if (!checkEnum(config.presentation, PRESENTATIONS, 'presentation'))
    return false;
  if (!checkEnum(config.cardVariant, CARD_VARIANTS, 'cardVariant')) return false;
  if (!checkEnum(config.size, SIZES, 'size')) return false;
  if (!checkEnum(config.cardWidth, CARD_WIDTHS, 'cardWidth')) return false;
  if (!checkEnum(config.orderBy, ORDER_BY, 'orderBy')) return false;
  if (!checkEnum(config.orderDirection, ORDER_DIRECTIONS, 'orderDirection'))
    return false;
  if (!checkEnum(config.navigationMode, NAVIGATION_MODES, 'navigationMode'))
    return false;
  if (
    !checkEnum(
      config.formCountPlacement,
      FORM_COUNT_PLACEMENTS,
      'formCountPlacement',
    )
  )
    return false;
  if (!checkEnum(config.textVertical, TEXT_VERTICAL, 'textVertical'))
    return false;
  if (!checkEnum(config.textHorizontal, TEXT_HORIZONTAL, 'textHorizontal'))
    return false;
  for (const k of [
    'hideHidden',
    'showDescription',
    'showFormCount',
    'showBreadcrumb',
  ]) {
    if (config[k] != null && typeof config[k] !== 'boolean') {
      console.error(`Categories Widget Error: ${k} must be a boolean.`);
      return false;
    }
  }
  if (config.hideEmpty != null) {
    const ok =
      config.hideEmpty === false ||
      config.hideEmpty === true ||
      config.hideEmpty === 'direct' ||
      config.hideEmpty === 'subtree';
    if (!ok) {
      console.error(
        "Categories Widget Error: hideEmpty must be false, true, 'direct', or 'subtree'.",
      );
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
  if (!validateClassNames(config.classNames, 'Categories', SLOT_NAMES))
    return false;
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
