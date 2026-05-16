import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
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
import {
  refreshKappForms,
  selectCategorySelection,
} from '../../../helpers/state.js';
import { useKappContext } from '../../../helpers/widget-context.js';
import { Icon } from '../../../atoms/Icon.jsx';

/* ------------------------------------------------------------------ */
/* Enums + truthy table                                               */
/* ------------------------------------------------------------------ */

// CARD_VARIANTS, TEXT_VERTICAL, TEXT_HORIZONTAL, SIZES, SIZE_TEXT,
// SIZE_LAYOUT, VARIANTS, ICON_SIZE_PRESETS, resolveIconSize, makeCn, and
// validateClassNames all live in ./card-helpers.js so this widget shares the
// same vocabulary as Categories and any future card-style widget.

const ORDER_BY = ['name', 'createdat', 'updatedat'];
const ORDER_DIRECTIONS = ['asc', 'desc'];
const NAVIGATION_MODES = ['widget']; // 'url' and 'page' deferred to v2

// Top-level presentation mode. 'cards' uses the full card vocabulary
// (cardVariant, size, slot system, etc.). 'list' renders a flat text list
// — same click semantics, no visual chrome. Mirrors the Categories
// presentation switch; the list mode for forms is intentionally flat (no
// hierarchy) since forms don't have a parent chain.
const PRESENTATIONS = ['cards', 'list'];

// Form record statuses recognized by the platform. 'all' is a widget-only
// sentinel for "no status filtering."
const STATUS_VALUES = ['Active', 'New', 'Inactive'];
const STATUS_ALL = 'all';

// initialView dictates what the widget renders WHEN NO CATEGORY IS BOUND
// (no config.categorySlug pin AND no Categories-widget selection). Once a
// category is bound, initialView is irrelevant — the widget shows that
// category's forms. String modes are simple render directives; object modes
// configure a fallback "slice" of forms to surface as the default view.
//
//   'all'                              — every form in the kapp (default)
//   'empty'                            — render the empty state w/ emptyText
//   'blank'                            — render nothing at all (no copy)
//   { categorySlug: <slug> }           — pin to a category (often a hidden
//                                        Kinetic category populated by an
//                                        external curation process — e.g.
//                                        "Popular", "Featured", "Editor's
//                                        Picks". The Categories widget hides
//                                        Hidden=true categories from view by
//                                        default, so this composes naturally
//                                        without any new plumbing.)
//   { filterAttribute: <name> }        — opt-in truthy-attribute slice; this
//                                        only applies in the unbound state,
//                                        unlike the widget-level filterAttribute
//                                        which applies everywhere.
//   { uncategorized: true }            — forms with no categorizations. Cheap
//                                        to compute from the cache. Useful for
//                                        surfacing orphaned forms.
//   { favorites: true }                — RESERVED; not implemented in v1.
//                                        Pending favorites-storage decision.
const INITIAL_VIEW_STRING_MODES = ['all', 'empty', 'blank'];
const INITIAL_VIEW_OBJECT_KEYS = ['categorySlug', 'filterAttribute', 'uncategorized'];

// Truthy text values for boolean-shaped attributes — mirrors Categories so
// designers see consistent behavior across widgets.
const TRUTHY = new Set(['true', 'yes', '1', 'on']);

const lc = v => (v == null ? '' : String(v).trim().toLowerCase());

/* ------------------------------------------------------------------ */
/* Slot defaults                                                      */
/*                                                                    */
/* Same shape as Categories — every styleable region is a named slot  */
/* with a default class string. Designers layer additional classes    */
/* (or remove tokens) via `config.classNames[slot]`.                   */
/* ------------------------------------------------------------------ */

const SLOT_DEFAULTS = {
  // Outer wrapper of the whole widget.
  root: '',
  // Auto-fit CSS grid that lays out cards. The per-variant minimum column
  // width is applied inline so the same slot string works for every variant.
  grid: 'kd-form-grid w-full',
  // Each form card. Visual chrome (border, hover, transition) lives here;
  // per-variant structural styles (height, flex direction) are layered on at
  // render time.
  card: 'kd-form-card group relative flex w-full overflow-hidden text-left rounded-box bg-base-100 border border-base-300 hover:border-primary hover:shadow-md transition cursor-pointer no-underline text-base-content',
  // Image / icon container. Layout (size, position) is variant-specific.
  cardMedia: 'kd-form-media bg-base-200 overflow-hidden',
  // Legibility scrim for the `background` variant. Absent on other variants.
  cardOverlay: '',
  // Icon wrapper — used when an icon is rendered instead of (or alongside)
  // an image.
  cardIcon: 'kd-form-icon text-base-content/50',
  // <img> element when imageAttribute resolves a URL.
  cardImage: 'w-full h-full object-cover',
  // Title + description container. Padding scales with `size` and is layered
  // on at render — the slot default stays padding-free so designers can
  // override without fighting a hard-coded `p-4`.
  cardBody: 'kd-form-body flex-c-ss gap-2 w-full',
  // Form name. Font size scales with `size`.
  cardTitle: 'kd-form-title font-semibold',
  // Optional description line. Font size scales with `size`.
  cardDescription: 'kd-form-description text-base-content/70 line-clamp-2',
  // Shown when the filtered list is empty.
  emptyState: 'kd-form-empty text-base-content/60 italic py-8 text-center',
  // Shown during the initial on-mount fetch when no cached forms are
  // available yet for the resolved kapp.
  loadingState: 'kd-form-loading text-base-content/60 italic py-8 text-center',

  // ---- presentation: 'list' ----
  // Outer <ul> for the list rendering. Resets default browser list styling.
  listRoot: 'kd-form-list flex-c-st gap-0 m-0 p-0 list-none w-full',
  // Each list row's clickable element (a `<button>` for formClickAction or
  // modal/event click actions, an `<a>` for internal/external/'current'
  // anchors). Padding is moderate; the row is rendered as a flex container
  // so the icon + label align inline. `items-center` keeps the icon visually
  // centered against the label block whether it's one line (title only) or
  // two (title + description).
  listItem: 'kd-form-list-item flex-sc gap-2 w-full px-3 py-2 rounded-md cursor-pointer hover:bg-base-200 transition text-left text-base-content no-underline',
  // Icon wrapper inside a list row. Renders unconditionally when
  // `iconAttribute` is configured (even for forms with no icon value) so
  // names align across rows. The width matches the rendered icon size.
  listIcon: 'kd-form-list-icon flex-cc w-4 shrink-0 text-base-content/60',
  // Vertical stack containing the title and (optional) description. `min-w-0`
  // lets the inner `truncate` work — without it, the flex item would expand
  // to fit its content and the title would never get clipped.
  listLabel: 'kd-form-list-label flex-c-st gap-0.5 flex-1 min-w-0',
  // Form name in list mode. Truncates to one line; default inherits the
  // listItem font size.
  listTitle: 'kd-form-list-title truncate',
  // Form description in list mode. Smaller and muted so it reads as
  // secondary information beneath the title. Single-line truncate keeps
  // rows at a uniform height.
  listDescription: 'kd-form-list-description text-sm text-base-content/70 truncate',
};

const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

/* ------------------------------------------------------------------ */
/* Attribute readers                                                  */
/*                                                                    */
/* The widget reads the following form attributes (all optional):     */
/*   <iconAttribute>      — Tabler icon name (default "Icon")         */
/*   <imageAttribute>     — image URL (default null — opt-in)         */
/*   <filterAttribute>    — boolean-shaped; opt-in via config         */
/*                                                                    */
/* Form description comes from the form record's native `description` */
/* field — there's no attribute fallback. Forms have a richer native  */
/* metadata surface than categories so we don't need an attribute     */
/* indirection for it.                                                 */
/* ------------------------------------------------------------------ */

const matchesFilter = (form, attrName) =>
  attrName ? TRUTHY.has(lc(readAttribute(form, attrName))) : true;

// Tabler icon names are kebab-case lowercase; coerce so a designer entering
// 'Settings' resolves to the right icon.
const getIconName = (form, attrName) => {
  if (!attrName) return null;
  const v = readAttribute(form, attrName);
  return v ? lc(v) : null;
};

const getImageUrl = (form, attrName) => {
  if (!attrName) return null;
  const v = readAttribute(form, attrName);
  return v ? String(v).trim() : null;
};

const getFormDescription = form => form?.description || '';

// True when a form has no categorizations at all. Reads from the cached
// `categorizations` array (included on every form by the Forms-widget fetch).
const isUncategorized = form =>
  !Array.isArray(form?.categorizations) || form.categorizations.length === 0;

/* ------------------------------------------------------------------ */
/* initialView normalization                                          */
/*                                                                    */
/* Turns the user-facing config shape into a uniform internal slice:  */
/*   { render: 'list',  ... filter axes }                              */
/*   { render: 'empty' }                                               */
/*   { render: 'blank' }                                               */
/* Invalid shapes fall back to { render: 'list' } (the 'all' default).*/
/* ------------------------------------------------------------------ */

const normalizeInitialView = raw => {
  if (raw == null) return { render: 'list' };
  if (typeof raw === 'string') {
    const v = lc(raw);
    if (v === 'empty') return { render: 'empty' };
    if (v === 'blank') return { render: 'blank' };
    return { render: 'list' }; // 'all' and any fallback
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    if (typeof raw.categorySlug === 'string' && raw.categorySlug.length > 0) {
      return { render: 'list', categorySlug: raw.categorySlug };
    }
    if (
      typeof raw.filterAttribute === 'string' &&
      raw.filterAttribute.length > 0
    ) {
      return { render: 'list', viewFilterAttribute: raw.filterAttribute };
    }
    if (raw.uncategorized === true) {
      return { render: 'list', uncategorized: true };
    }
  }
  return { render: 'list' };
};

/* ------------------------------------------------------------------ */
/* Status normalization                                               */
/*                                                                    */
/* Accepts:                                                            */
/*   - 'all'           → no status filter                              */
/*   - 'Active'        → single status (string)                        */
/*   - ['Active','New']→ multi (array)                                 */
/*   - null/undefined  → default ['Active','New']                      */
/* Comparison is case-insensitive against form.status.                 */
/* ------------------------------------------------------------------ */

const DEFAULT_STATUSES = ['Active', 'New'];

const normalizeStatusFilter = raw => {
  if (raw == null) return DEFAULT_STATUSES;
  if (typeof raw === 'string') {
    if (lc(raw) === STATUS_ALL) return null; // null = no filter
    return [raw];
  }
  if (Array.isArray(raw)) {
    if (raw.some(s => typeof s === 'string' && lc(s) === STATUS_ALL)) {
      return null;
    }
    return raw.filter(s => typeof s === 'string' && s.length > 0);
  }
  return DEFAULT_STATUSES;
};

const matchesStatus = (form, statuses) => {
  if (!statuses) return true; // no filter
  const formStatus = lc(form?.status);
  return statuses.some(s => lc(s) === formStatus);
};

/* ------------------------------------------------------------------ */
/* Sort + filter                                                      */
/* ------------------------------------------------------------------ */

const sortForms = (list, orderBy, orderDirection) => {
  const dir = orderDirection === 'desc' ? -1 : 1;
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  if (orderBy === 'createdat') {
    return [...list].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      if (ta !== tb) return (ta - tb) * dir;
      return byName(a, b);
    });
  }
  if (orderBy === 'updatedat') {
    return [...list].sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (ta !== tb) return (ta - tb) * dir;
      return byName(a, b);
    });
  }
  // name (default)
  return [...list].sort((a, b) => byName(a, b) * dir);
};

// True when the form is attached to the named category via its categorizations
// join array. categorizations is included in the Forms-widget fetch so each
// form's category memberships are present without an extra round trip.
const isInCategory = (form, categorySlug) => {
  if (!categorySlug) return true;
  const cats = Array.isArray(form?.categorizations) ? form.categorizations : [];
  return cats.some(c => c?.category?.slug === categorySlug);
};

// Applies all active filter axes to the cached forms array. `filterAttribute`
// is the widget-level "always require this attribute" filter; `viewFilterAttribute`
// is layered on by `initialView: { filterAttribute }` and only applies when no
// category is bound. `uncategorized` short-circuits to forms with no
// categorizations.
const filterForms = (
  list,
  {
    statuses,
    filterAttribute,
    viewFilterAttribute,
    categorySlug,
    uncategorized,
  },
) =>
  list.filter(
    f =>
      matchesStatus(f, statuses) &&
      matchesFilter(f, filterAttribute) &&
      matchesFilter(f, viewFilterAttribute) &&
      (uncategorized ? isUncategorized(f) : isInCategory(f, categorySlug)),
  );

/* ------------------------------------------------------------------ */
/* Click action defaults                                              */
/*                                                                    */
/* Builds the default per-form clickAction — an internal anchor to    */
/* the form's submission page. Designer overrides via                  */
/* config.clickAction take precedence over the default; config.target  */
/* layers in (modal / container / new-tab) atop either the default or  */
/* the override (when applicable).                                     */
/* ------------------------------------------------------------------ */

const defaultClickActionFor = (form, kappSlug) =>
  kappSlug && form?.slug
    ? { type: 'internal', path: `/kapps/${kappSlug}/forms/${form.slug}` }
    : { type: 'none' };

/* ------------------------------------------------------------------ */
/* Components                                                         */
/* ------------------------------------------------------------------ */

const FormMedia = ({ iconName, imageUrl, variant, size, cn, iconSize, overlayClass }) => {
  const v = VARIANTS[variant];
  const layout = SIZE_LAYOUT[variant][size];
  // Render the media slot unconditionally — even when a form has neither an
  // icon nor an image — so the empty placeholder preserves grid alignment
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

// Form-click wrapper. Delegates to ClickActionWrapper for the standard
// clickAction/target combinations, with one override: for `type: 'event'`,
// dispatch with the clicked form as top-level `detail.form` (mirroring the
// Kapps widget's per-record event payload, so listeners receive the same
// shape regardless of which widget fired the event).
const FormClickWrapper = ({
  form,
  clickAction,
  target,
  instanceId,
  className,
  style,
  children,
}) => {
  if (clickAction?.type === 'event') {
    const handle = () => {
      window.dispatchEvent(
        new CustomEvent(clickAction.name, {
          detail: { widget: 'Forms', id: instanceId, form },
        }),
      );
    };
    return (
      <button
        type="button"
        onClick={handle}
        aria-label={form?.name}
        className={className}
        style={style}
      >
        {children}
      </button>
    );
  }
  return (
    <ClickActionWrapper
      clickAction={clickAction}
      target={target}
      label={form?.name}
      widgetName="Forms"
      instanceId={instanceId}
      className={className}
      style={style}
    >
      {children}
    </ClickActionWrapper>
  );
};

const FormCard = ({
  form,
  variant,
  size,
  cn,
  showDescription,
  textVertical,
  textHorizontal,
  iconAttribute,
  imageAttribute,
  iconSize,
  clickAction,
  target,
  instanceId,
  onClickOverride,
}) => {
  const v = VARIANTS[variant];
  const sizeText = SIZE_TEXT[size];
  const sizeLayout = SIZE_LAYOUT[variant][size];
  const iconName = getIconName(form, iconAttribute);
  const imageUrl = getImageUrl(form, imageAttribute);
  const description = getFormDescription(form);

  const overlayClass = cn(
    'cardOverlay',
    'absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/40 to-transparent pointer-events-none',
  );

  const cardClasses = cn('card', v.cardExtras, sizeLayout.cardExtra);
  const body = (
    <>
      <FormMedia
        iconName={iconName}
        imageUrl={imageUrl}
        variant={variant}
        size={size}
        cn={cn}
        iconSize={iconSize}
        overlayClass={overlayClass}
      />
      <div
        className={cn(
          'cardBody',
          v.bodyExtras,
          sizeText.padding,
          TEXT_VERTICAL_CLASS[textVertical],
          TEXT_HORIZONTAL_CLASS[textHorizontal],
        )}
      >
        <span className={cn('cardTitle', sizeText.titleSize)}>{form.name}</span>
        {showDescription && description && (
          <span className={cn('cardDescription', sizeText.descSize)}>
            {description}
          </span>
        )}
      </div>
    </>
  );

  // formClickAction escape hatch — designer-supplied function runs instead of
  // any wrapper-based navigation. We still render a <button> so keyboard
  // focus / Enter activation work; the wrapper styles match the standard
  // card so designers see no visual difference.
  if (onClickOverride) {
    return (
      <button
        type="button"
        onClick={onClickOverride}
        aria-label={form.name}
        className={cardClasses}
      >
        {body}
      </button>
    );
  }
  return (
    <FormClickWrapper
      form={form}
      clickAction={clickAction}
      target={target}
      instanceId={instanceId}
      className={cardClasses}
    >
      {body}
    </FormClickWrapper>
  );
};

const FormGrid = ({
  items,
  variant,
  size,
  cardWidth,
  cn,
  showDescription,
  textVertical,
  textHorizontal,
  iconAttribute,
  imageAttribute,
  iconSize,
  kappSlug,
  clickAction,
  target,
  instanceId,
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
      {items.map(form => {
        // Resolve per-form clickAction: the designer-supplied object wins;
        // otherwise route to /kapps/<slug>/forms/<formSlug>. Per-form
        // substitution happens here (vs. once at the widget level) so each
        // anchor's href points at the right form.
        const resolvedClickAction =
          clickAction != null
            ? clickAction
            : defaultClickActionFor(form, kappSlug);
        // formClickAction (function) overrides the wrapper path entirely —
        // see FormsContent for the wiring. We pass an onClickOverride down
        // when the function is provided so the card renders as a button.
        const handleOverride = onCardClick
          ? () => onCardClick(form)
          : null;
        return (
          <FormCard
            key={form.slug}
            form={form}
            variant={variant}
            size={size}
            cn={cn}
            showDescription={showDescription}
            textVertical={textVertical}
            textHorizontal={textHorizontal}
            iconAttribute={iconAttribute}
            imageAttribute={imageAttribute}
            iconSize={iconSize}
            clickAction={resolvedClickAction}
            target={target}
            instanceId={instanceId}
            onClickOverride={handleOverride}
          />
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* List presentation                                                  */
/*                                                                    */
/* Flat text list — every visible form rendered as a row. Click       */
/* semantics match cards: same clickAction / target / formClickAction */
/* path via FormClickWrapper. There's no nesting (forms have no       */
/* parent chain) and no persistent selection (clicking navigates),    */
/* so the row slot set is minimal: listRoot, listItem, listIcon.      */
/* ------------------------------------------------------------------ */

const FormListItem = ({
  form,
  cn,
  iconAttribute,
  showDescription,
  clickAction,
  target,
  instanceId,
  onClickOverride,
}) => {
  const iconName = getIconName(form, iconAttribute);
  const description = getFormDescription(form);
  const itemClasses = cn('listItem');
  const content = (
    <>
      {iconAttribute && (
        <span className={cn('listIcon')} aria-hidden="true">
          {iconName ? <Icon name={iconName} size={16} /> : null}
        </span>
      )}
      <span className={cn('listLabel')}>
        <span className={cn('listTitle')}>{form.name}</span>
        {showDescription && description && (
          <span className={cn('listDescription')}>{description}</span>
        )}
      </span>
    </>
  );
  if (onClickOverride) {
    return (
      <li>
        <button
          type="button"
          onClick={onClickOverride}
          aria-label={form.name}
          className={itemClasses}
        >
          {content}
        </button>
      </li>
    );
  }
  return (
    <li>
      <FormClickWrapper
        form={form}
        clickAction={clickAction}
        target={target}
        instanceId={instanceId}
        className={itemClasses}
      >
        {content}
      </FormClickWrapper>
    </li>
  );
};

const FormList = ({
  items,
  cn,
  iconAttribute,
  showDescription,
  kappSlug,
  clickAction,
  target,
  instanceId,
  onCardClick,
}) => (
  <ul className={cn('listRoot')}>
    {items.map(form => {
      const resolvedClickAction =
        clickAction != null
          ? clickAction
          : defaultClickActionFor(form, kappSlug);
      const handleOverride = onCardClick ? () => onCardClick(form) : null;
      return (
        <FormListItem
          key={form.slug}
          form={form}
          cn={cn}
          iconAttribute={iconAttribute}
          showDescription={showDescription}
          clickAction={resolvedClickAction}
          target={target}
          instanceId={instanceId}
          onClickOverride={handleOverride}
        />
      );
    })}
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

const FormsContent = ({ config: rawConfig, instanceId }) => {
  const config = useMemo(() => normalizeConfig(rawConfig), [rawConfig]);
  const {
    kappSlug: explicitKappSlug = null,
    categorySlug: explicitCategorySlug = null,
    initialView: rawInitialView = 'all',
    status: rawStatus,
    filterAttribute = null,
    limit = null,
    orderBy: rawOrderBy = 'name',
    orderDirection: rawOrderDirection = 'asc',
    presentation: rawPresentation = 'cards',
    cardVariant: rawCardVariant = 'stacked',
    size: rawSize = 'md',
    cardWidth: rawCardWidth = 'fixed',
    iconAttribute = 'Icon',
    imageAttribute = null,
    iconSize = null,
    showDescription = true,
    textVertical: rawTextVertical = 'top',
    textHorizontal: rawTextHorizontal = 'left',
    clickAction = null,
    target = null,
    formClickAction,
    emptyText = 'No forms to display',
    loadingText = 'Loading forms…',
    className,
    debug = false,
  } = config;

  // Resolve enums with safe fallbacks.
  const presentation = PRESENTATIONS.includes(rawPresentation)
    ? rawPresentation
    : 'cards';
  const orderBy = ORDER_BY.includes(rawOrderBy) ? rawOrderBy : 'name';
  const orderDirection = ORDER_DIRECTIONS.includes(rawOrderDirection)
    ? rawOrderDirection
    : 'asc';
  const cardVariant = CARD_VARIANTS.includes(rawCardVariant)
    ? rawCardVariant
    : 'stacked';
  const size = SIZES.includes(rawSize) ? rawSize : 'md';
  const cardWidth = CARD_WIDTHS.includes(rawCardWidth) ? rawCardWidth : 'fixed';
  const textVertical = TEXT_VERTICAL.includes(rawTextVertical)
    ? rawTextVertical
    : 'top';
  const textHorizontal = TEXT_HORIZONTAL.includes(rawTextHorizontal)
    ? rawTextHorizontal
    : 'left';

  // Resolve target kapp the same way Categories does — explicit slug pin,
  // else container/global auto-resolution via useKappContext.
  const { kapp: targetKapp, slug: targetKappSlug } = useKappContext({
    kappSlug: explicitKappSlug || 'auto',
  });

  // Resolve effective category filter:
  //   - explicit config.categorySlug wins
  //   - else read the Categories-widget selection from the shared widgets
  //     slice (keyed by kappSlug)
  //   - else null → show all forms in the kapp
  const autoCategorySlug = useSelector(
    selectCategorySelection(targetKappSlug),
  );
  const effectiveCategorySlug = explicitCategorySlug || autoCategorySlug;

  // Resolve the active slice. When a category is bound (explicit pin or via
  // Categories-widget auto-bind), the slice is that category's forms. When
  // unbound, fall back to whatever the designer configured via `initialView`
  // — which may be a list-rendering slice, the empty state, or nothing at
  // all.
  const normalizedInitialView = useMemo(
    () => normalizeInitialView(rawInitialView),
    [rawInitialView],
  );
  const slice = useMemo(() => {
    if (effectiveCategorySlug) {
      return { render: 'list', categorySlug: effectiveCategorySlug };
    }
    return normalizedInitialView;
  }, [effectiveCategorySlug, normalizedInitialView]);

  // On mount (and on target kapp change), fire a single fetchForms if the
  // forms cache slot for this kapp is undefined. The refresh helper coalesces
  // concurrent calls per slug, so two Forms widgets pointed at the same kapp
  // share one HTTP request. We deliberately gate on `undefined` (cache miss)
  // rather than empty array (legitimate "no forms exist") — an empty result
  // is a valid cached state. Skipped when the slice renders nothing list-like
  // ('empty' / 'blank') — no point pulling forms that will never appear.
  const formsArray = targetKapp?.forms; // undefined when not yet fetched
  const cacheMiss = targetKappSlug && formsArray === undefined;
  const renderList = slice.render === 'list';
  useEffect(() => {
    if (!cacheMiss || !renderList) return;
    refreshKappForms(targetKappSlug);
  }, [cacheMiss, renderList, targetKappSlug]);

  // Stable empty-array fallback so downstream useMemo deps stay referentially
  // stable when the cache hasn't landed yet.
  const forms = useMemo(
    () => (Array.isArray(formsArray) ? formsArray : []),
    [formsArray],
  );

  const statuses = useMemo(() => normalizeStatusFilter(rawStatus), [rawStatus]);

  const cn = useMemo(() => makeCn(SLOT_DEFAULTS, config), [config]);

  // Optional diagnostic: when `debug: true` is set in config, log what the
  // widget is reading every time it computes a new result. Useful when the
  // widget renders empty.
  useEffect(() => {
    if (!debug) return;
    console.groupCollapsed('[Forms widget] data snapshot');
    console.log('targetKappSlug:', targetKappSlug ?? '(none)');
    console.log('targetKapp in cache:', !!targetKapp);
    console.log('forms in cache:', formsArray === undefined ? '(not fetched)' : forms.length);
    console.log('effectiveCategorySlug:', effectiveCategorySlug ?? '(none)');
    console.log('slice:', slice);
    console.log('statuses:', statuses ?? '(no filter)');
    if (forms.length > 0) {
      console.table(
        forms.map(f => ({
          slug: f.slug,
          name: f.name,
          status: f.status ?? '',
          icon: (iconAttribute && readAttribute(f, iconAttribute)) ?? '',
          image: (imageAttribute && readAttribute(f, imageAttribute)) ?? '',
          categories: (Array.isArray(f.categorizations)
            ? f.categorizations
                .map(c => c?.category?.slug)
                .filter(Boolean)
                .join(', ')
            : ''),
        })),
      );
    }
    console.groupEnd();
  }, [
    debug,
    targetKappSlug,
    targetKapp,
    forms,
    formsArray,
    effectiveCategorySlug,
    slice,
    statuses,
    iconAttribute,
    imageAttribute,
  ]);

  // Filter axes: the slice contributes its category / uncategorized /
  // viewFilterAttribute knob; widget-level filterAttribute always applies on
  // top. Computed regardless of slice.render so React deps stay stable, but
  // the render block below ignores `visible` for 'empty' / 'blank' slices.
  const visible = useMemo(
    () =>
      sortForms(
        filterForms(forms, {
          statuses,
          filterAttribute,
          viewFilterAttribute: slice.viewFilterAttribute,
          categorySlug: slice.categorySlug,
          uncategorized: slice.uncategorized,
        }),
        orderBy,
        orderDirection,
      ),
    [
      forms,
      statuses,
      filterAttribute,
      slice,
      orderBy,
      orderDirection,
    ],
  );

  const limited = useMemo(
    () => (limit && limit > 0 ? visible.slice(0, limit) : visible),
    [visible, limit],
  );

  // formClickAction is the imperative escape hatch — called with
  // { form, navigate }. When provided, the card renders as a button that
  // invokes the function. `navigate()` runs the default per-form route so
  // designers can wrap (e.g., confirm-then-navigate) without rebuilding it.
  const handleCardClick = form => {
    if (typeof formClickAction !== 'function') return;
    const navigateDefault = () => {
      const fallback = defaultClickActionFor(form, targetKappSlug);
      if (fallback.type === 'internal') {
        window.location.hash = fallback.path;
      }
    };
    formClickAction({ form, navigate: navigateDefault });
  };

  // 'empty' and 'blank' slices never trigger the fetch, so the loading state
  // is only meaningful for 'list' renders. Showing "Loading forms…" while
  // waiting on the user to pick a category would be misleading.
  const isLoading = cacheMiss && renderList;

  return (
    <div className={cn('root', className)}>
      {slice.render === 'blank' ? null : slice.render === 'empty' ? (
        <div className={cn('emptyState')}>{emptyText}</div>
      ) : isLoading ? (
        <div className={cn('loadingState')}>{loadingText}</div>
      ) : limited.length > 0 ? (
        presentation === 'list' ? (
          <FormList
            items={limited}
            cn={cn}
            iconAttribute={iconAttribute}
            showDescription={showDescription}
            kappSlug={targetKappSlug}
            clickAction={clickAction}
            target={target}
            instanceId={instanceId}
            onCardClick={
              typeof formClickAction === 'function' ? handleCardClick : null
            }
          />
        ) : (
          <FormGrid
            items={limited}
            variant={cardVariant}
            size={size}
            cardWidth={cardWidth}
            cn={cn}
            showDescription={showDescription}
            textVertical={textVertical}
            textHorizontal={textHorizontal}
            iconAttribute={iconAttribute}
            imageAttribute={imageAttribute}
            iconSize={iconSize}
            kappSlug={targetKappSlug}
            clickAction={clickAction}
            target={target}
            instanceId={instanceId}
            onCardClick={
              typeof formClickAction === 'function' ? handleCardClick : null
            }
          />
        )
      ) : (
        <div className={cn('emptyState')}>{emptyText}</div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* forwardRef wrapper + WidgetAPI                                     */
/* ------------------------------------------------------------------ */

const FormsComponent = forwardRef(({ config, id }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [currentConfig, setCurrentConfig] = useState(config);

  useEffect(() => {
    setCurrentConfig(config);
  }, [config]);

  api.current.update = patch =>
    setCurrentConfig(prev => ({ ...prev, ...(patch || {}) }));

  // Imperative refresh — re-runs the fetch and overwrites the kapp's forms
  // entry. Forwards the @kineticdata/react response so callers can detect
  // errors. Uses the resolved kapp slug at call time via useKappContext
  // inside FormsContent, so we need the slug visible here too — pull it via
  // the same context. We can't useKappContext here because we're outside the
  // Provider; expose refresh through bundle.refreshKappForms directly and
  // also via an instance API that defers to it once we know the kapp slug.
  api.current.refresh = async slug => {
    // Caller can pass an explicit slug; otherwise fall back to the config's
    // explicit pin. Auto-resolved slugs aren't reachable here (no context),
    // so designers wiring up a "refresh" button should pass the slug.
    const target =
      slug || (currentConfig && currentConfig.kappSlug) || null;
    if (!target) {
      return {
        error:
          'Forms Widget Error: refresh(slug) requires a kapp slug — either pass it or set config.kappSlug.',
      };
    }
    return refreshKappForms(target);
  };

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture}>
          <FormsContent config={currentConfig} instanceId={id} />
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
      `Forms Widget Error: ${fieldName} must be one of ${allowed.join(', ')}.`,
    );
    return false;
  }
  return true;
};

const validateStatus = status => {
  if (status == null) return true;
  const ok = v =>
    typeof v === 'string' &&
    (lc(v) === STATUS_ALL || STATUS_VALUES.some(s => lc(s) === lc(v)));
  if (typeof status === 'string') {
    if (!ok(status)) {
      console.error(
        `Forms Widget Error: status must be one of ${[...STATUS_VALUES, STATUS_ALL].join(', ')} (or an array of those values).`,
      );
      return false;
    }
    return true;
  }
  if (Array.isArray(status)) {
    if (!status.every(ok)) {
      console.error(
        `Forms Widget Error: status array entries must each be one of ${[...STATUS_VALUES, STATUS_ALL].join(', ')}.`,
      );
      return false;
    }
    return true;
  }
  console.error(
    'Forms Widget Error: status must be a string or array of strings.',
  );
  return false;
};

const validateInitialView = initialView => {
  if (initialView == null) return true;
  if (typeof initialView === 'string') {
    if (!INITIAL_VIEW_STRING_MODES.includes(lc(initialView))) {
      console.error(
        `Forms Widget Error: initialView (string) must be one of ${INITIAL_VIEW_STRING_MODES.join(', ')}.`,
      );
      return false;
    }
    return true;
  }
  if (typeof initialView !== 'object' || Array.isArray(initialView)) {
    console.error(
      `Forms Widget Error: initialView must be one of ${INITIAL_VIEW_STRING_MODES.join(', ')}, or an object with one of: ${INITIAL_VIEW_OBJECT_KEYS.join(', ')}.`,
    );
    return false;
  }
  const recognized = Object.keys(initialView).filter(k =>
    INITIAL_VIEW_OBJECT_KEYS.includes(k),
  );
  if (recognized.length !== 1) {
    console.error(
      `Forms Widget Error: initialView object must contain exactly one of: ${INITIAL_VIEW_OBJECT_KEYS.join(', ')}.`,
    );
    return false;
  }
  const key = recognized[0];
  const value = initialView[key];
  if (key === 'uncategorized') {
    if (value !== true) {
      console.error(
        'Forms Widget Error: initialView.uncategorized must be true when present (omit the key to disable).',
      );
      return false;
    }
    return true;
  }
  if (typeof value !== 'string' || value.length === 0) {
    console.error(
      `Forms Widget Error: initialView.${key} must be a non-empty string.`,
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
  if (!checkEnum(config.textVertical, TEXT_VERTICAL, 'textVertical'))
    return false;
  if (!checkEnum(config.textHorizontal, TEXT_HORIZONTAL, 'textHorizontal'))
    return false;
  if (config.showDescription != null && typeof config.showDescription !== 'boolean') {
    console.error('Forms Widget Error: showDescription must be a boolean.');
    return false;
  }
  if (!validateInitialView(config.initialView)) return false;
  for (const k of [
    'kappSlug',
    'categorySlug',
    'filterAttribute',
    'iconAttribute',
    'imageAttribute',
    'emptyText',
    'loadingText',
    'className',
  ]) {
    if (config[k] != null && typeof config[k] !== 'string') {
      console.error(`Forms Widget Error: ${k} must be a string.`);
      return false;
    }
  }
  if (
    config.limit != null &&
    !(typeof config.limit === 'number' && Number.isFinite(config.limit) && config.limit >= 0)
  ) {
    console.error('Forms Widget Error: limit must be a non-negative number.');
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
        "Forms Widget Error: iconSize must be a positive number or one of 'sm', 'md', 'lg', 'xl'.",
      );
      return false;
    }
  }
  if (!validateStatus(config.status)) return false;
  if (
    config.formClickAction != null &&
    typeof config.formClickAction !== 'function'
  ) {
    console.error('Forms Widget Error: formClickAction must be a function.');
    return false;
  }
  if (!validateClickAction(config.clickAction, 'Forms')) return false;
  if (!validateTarget(config.target, 'Forms')) return false;
  if (config.debug != null && typeof config.debug !== 'boolean') {
    console.error('Forms Widget Error: debug must be a boolean.');
    return false;
  }
  if (!validateClassNames(config.classNames, 'Forms', SLOT_NAMES)) return false;
  return true;
};

/* ------------------------------------------------------------------ */
/* Public widget function                                             */
/* ------------------------------------------------------------------ */

/**
 * Initializes a Forms widget instance.
 *
 * Renders the forms of the current kapp as cards in a CSS-grid layout, with
 * the same `cardVariant` / `size` / `classNames` / icon / image vocabulary as
 * the Categories widget. Scope resolution (in order):
 *
 *   1. config.categorySlug    — pin to a specific category's forms
 *   2. Categories widget      — auto-bind to the sibling Categories widget's
 *                                current selection (scoped to the resolved
 *                                kapp slug)
 *   3. (otherwise)            — show every form in the resolved kapp
 *
 * On mount, if the kapp's forms haven't been fetched yet, the widget fires
 * one `fetchForms` (attributesMap + categorizations) and writes the result
 * to `state.app.kappCache[<slug>].forms`. Concurrent mounts coalesce on a
 * single in-flight promise per slug. Use `bundle.refreshKappForms(slug)` to
 * force a re-fetch after a known mutation.
 *
 * Per-form attributes read by default:
 *
 *   Icon              (Tabler icon name; attr name configurable)
 *   <imageAttribute>  (opt-in via config; default null)
 *   <filterAttribute> (opt-in truthy filter, e.g. 'Featured')
 *
 * Example:
 *
 *   bundle.widgets.Forms({
 *     container: K('content[FormsList]').element(),
 *     config: { cardVariant: 'stacked', categorySlug: 'hr' },
 *     id: 'hr-forms',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container DOM element or an
 *   array-like whose first entry is one (e.g. `K('content[...]').element()`).
 * @param {Object} [config] Configuration object. All fields optional.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const Forms = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Forms');
  if (resolved && validateConfig(config)) {
    return registerWidget(Forms, {
      container: resolved,
      Component: FormsComponent,
      props: { config, id },
      id,
    });
  }
  return Promise.reject(
    'The Forms widget parameters are invalid. See the console for more details.',
  );
};
