import clsx from 'clsx';

/* ------------------------------------------------------------------ */
/* Shared card presentation helpers                                   */
/*                                                                    */
/* This module hosts the foundational building blocks for any widget  */
/* that renders "thing-as-card" presentations (Categories, Forms,     */
/* and likely retrofitted Kapps eventually). Anything in here is      */
/* deliberately widget-agnostic — the goal is that every widget       */
/* using these primitives shares the same `cardVariant` vocabulary,   */
/* the same `size` scale, the same text-positioning options, and the  */
/* same `classNames` slot system. Designers learning one widget       */
/* should recognize the knobs on every other widget.                  */
/*                                                                    */
/* Widget-specific concerns (slot defaults, attribute conventions,    */
/* filtering / sorting / nesting / favorites / form-counts /          */
/* navigation modes / etc.) stay in the widget source files. If you   */
/* find yourself wanting to add something here that's only useful to  */
/* one widget, leave it in that widget — extract later when a second  */
/* consumer materializes.                                             */
/* ------------------------------------------------------------------ */

/* Card variants                                                       */
/*                                                                     */
/* Each variant describes a layout *shape* — flex direction, where     */
/* the media area sits, where the body sits, whether an overlay scrim  */
/* gets rendered. Size-specific dimensions (column width, fixed        */
/* heights, icon sizes) live in SIZE_LAYOUT below, not here.           */

export const CARD_VARIANTS = ['background', 'side', 'stacked', 'icon-only'];

export const VARIANTS = {
  background: {
    cardExtras: 'flex-col',
    mediaExtras: 'absolute inset-0',
    bodyExtras:
      'relative z-10 mt-auto bg-gradient-to-t from-base-100/95 via-base-100/85 to-transparent pt-12',
    overlay: true,
  },
  side: {
    cardExtras: 'flex-row items-stretch',
    mediaExtras: 'flex-cc shrink-0',
    bodyExtras: 'flex-1',
    overlay: false,
  },
  stacked: {
    cardExtras: 'flex-col',
    mediaExtras: 'flex-cc w-full',
    bodyExtras: 'flex-1',
    overlay: false,
  },
  'icon-only': {
    cardExtras: 'flex-col items-center',
    mediaExtras: 'flex-cc pt-6',
    bodyExtras: 'flex-1',
    overlay: false,
  },
};

/* Size scale                                                          */
/*                                                                     */
/* `sm | md | lg | xl` drives five things at once: grid column width,  */
/* body padding, title/description font sizes, the variant's fixed     */
/* dimension (background min-h, side media w + min-h, stacked media    */
/* h), and the default icon size when no image is present. `md` is     */
/* the historical default and matches the values widgets used before   */
/* the size scale existed.                                             */

export const SIZES = ['sm', 'md', 'lg', 'xl'];

// Per-size text + padding scale — identical across variants.
export const SIZE_TEXT = {
  sm: { padding: 'p-3', titleSize: 'text-sm', descSize: 'text-xs' },
  md: { padding: 'p-4', titleSize: 'text-base', descSize: 'text-sm' },
  lg: { padding: 'p-5', titleSize: 'text-lg', descSize: 'text-base' },
  xl: { padding: 'p-6', titleSize: 'text-xl', descSize: 'text-base' },
};

// Per-(variant, size) layout — grid min column width, optional extras for
// the card or media slots, and the variant's default icon size (used by
// resolveIconSize() as the fallback when `config.iconSize` is not set).
//
// `min` feeds `repeat(auto-fill | auto-fit, minmax(min, 1fr))`. The number
// of columns that fit on a row is always calculated at `min` (1fr is
// non-definite so grid counts at the lower bound). What `cardWidth`
// controls is *what happens to empty slots*: `fixed` (auto-fill) keeps
// them as ghost tracks so occupied cards stay at the same width as a full
// row; `stretch` (auto-fit) collapses them and stretches survivors to
// fill the row.
export const SIZE_LAYOUT = {
  background: {
    sm: { min: 200, cardExtra: 'min-h-36', iconSize: 48 },
    md: { min: 260, cardExtra: 'min-h-44', iconSize: 64 },
    lg: { min: 320, cardExtra: 'min-h-52', iconSize: 80 },
    xl: { min: 400, cardExtra: 'min-h-64', iconSize: 96 },
  },
  side: {
    sm: { min: 240, mediaExtra: 'w-1/3 min-h-24', iconSize: 32 },
    md: { min: 320, mediaExtra: 'w-1/3 min-h-32', iconSize: 48 },
    lg: { min: 400, mediaExtra: 'w-1/3 min-h-40', iconSize: 64 },
    xl: { min: 480, mediaExtra: 'w-1/3 min-h-48', iconSize: 80 },
  },
  stacked: {
    sm: { min: 180, mediaExtra: 'h-24', iconSize: 32 },
    md: { min: 240, mediaExtra: 'h-32', iconSize: 48 },
    lg: { min: 300, mediaExtra: 'h-40', iconSize: 64 },
    xl: { min: 380, mediaExtra: 'h-52', iconSize: 80 },
  },
  'icon-only': {
    sm: { min: 140, iconSize: 40 },
    md: { min: 180, iconSize: 56 },
    lg: { min: 240, iconSize: 72 },
    xl: { min: 300, iconSize: 88 },
  },
};

// Card-width modes for the grid track sizing.
//   'fixed' — `auto-fill` keeps empty tracks; occupied cards stay at the
//     same width whether the row is full or sparse.
//   'stretch' — `auto-fit` collapses empty tracks; occupied cards stretch
//     to fill the row when there are fewer than fit.
export const CARD_WIDTHS = ['fixed', 'stretch'];

/* Text positioning                                                    */
/*                                                                     */
/* Vertical + horizontal alignment of the card body's contents (title, */
/* description, etc.). justify-* drives the main-axis distribution of  */
/* the body's flex column; items-* + text-* drive the cross-axis       */
/* alignment of children + their inner text.                           */

export const TEXT_VERTICAL = ['top', 'middle', 'bottom'];
export const TEXT_HORIZONTAL = ['left', 'center', 'right'];

export const TEXT_VERTICAL_CLASS = {
  top: 'justify-start',
  middle: 'justify-center',
  bottom: 'justify-end',
};

export const TEXT_HORIZONTAL_CLASS = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

/* Icon sizing                                                         */
/*                                                                     */
/* `iconSize` is a per-widget config field that overrides the per-     */
/* variant default. Accepts either a preset string (sm/md/lg/xl) that  */
/* maps to a fixed pixel value, or any positive number. When omitted,  */
/* the variant's SIZE_LAYOUT default applies.                          */

export const ICON_SIZE_PRESETS = { sm: 24, md: 36, lg: 48, xl: 64 };

/**
 * Resolves a user-supplied iconSize config value (string preset, number, or
 * null) against a per-variant default. Returns a pixel number suitable for
 * `<Icon size={...} />`.
 */
export const resolveIconSize = (configValue, variantDefault) => {
  if (configValue == null) return variantDefault;
  if (typeof configValue === 'number') return configValue;
  if (typeof configValue === 'string') {
    const key = configValue.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ICON_SIZE_PRESETS, key)) {
      return ICON_SIZE_PRESETS[key];
    }
  }
  return variantDefault;
};

/* Slot helper                                                         */
/*                                                                     */
/* Each widget defines its own SLOT_DEFAULTS (the slot names and their */
/* default class strings differ per widget — a Categories card has a   */
/* `cardFormCount` slot, a Forms card will have its own metadata       */
/* slots, etc.). The cn() helper takes a slot defaults map and the     */
/* widget's config, and returns a slot-resolver function that:         */
/*                                                                     */
/*   1. Starts from the slot's default                                 */
/*   2. Layers any conditional extras the caller passes in             */
/*   3. Applies the designer's `config.classNames[slot]` override:     */
/*        - string  → additive (concatenated)                          */
/*        - object  → `{ add?, remove? }` — first strip listed tokens, */
/*                    then append `add`                                */
/*                                                                     */
/* Removal is the most reliable customization tool in the bundle —     */
/* see the note in any widget doc that links to this module.           */

export const makeCn = (slotDefaults, config) => (slot, ...extra) => {
  const base = clsx(slotDefaults[slot], ...extra);
  const override = config?.classNames?.[slot];
  if (override == null) return base;
  if (typeof override === 'string') return clsx(base, override);
  const removeList = Array.isArray(override.remove) ? override.remove : null;
  const filtered =
    removeList && removeList.length > 0
      ? base.split(/\s+/).filter(t => t && !removeList.includes(t)).join(' ')
      : base;
  return clsx(filtered, override.add);
};

/* classNames validation                                               */
/*                                                                     */
/* Validates that config.classNames is shaped correctly: top-level     */
/* object keyed by recognized slot names, each value either a string   */
/* or `{ add?: string, remove?: string[] }`. Unknown slot names warn   */
/* (and are ignored). Bad shapes error and the caller should reject    */
/* the widget config. `widgetName` and `slotNames` are caller-         */
/* supplied so the error messages name the right widget and the right */
/* allowed slots.                                                      */

export const validateClassNames = (classNames, widgetName, slotNames) => {
  if (classNames == null) return true;
  if (typeof classNames !== 'object' || Array.isArray(classNames)) {
    console.error(
      `${widgetName} Widget Error: config.classNames must be an object keyed by slot name.`,
    );
    return false;
  }
  for (const [slot, value] of Object.entries(classNames)) {
    if (!slotNames.includes(slot)) {
      console.warn(
        `${widgetName} Widget Warning: config.classNames.${slot} is not a recognized slot (expected one of ${slotNames.join(', ')}). The entry is ignored.`,
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
