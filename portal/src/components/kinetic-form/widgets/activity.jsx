import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Provider } from 'react-redux';
import { get } from 'lodash-es';
import clsx from 'clsx';
import { formatDistance } from 'date-fns';
import moment from 'moment';
import { Popover, usePopover } from '@ark-ui/react/popover';
import { searchSubmissions } from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { executeIntegration } from '../../../helpers/api.js';
import { Icon } from '../../../atoms/Icon.jsx';
import {
  ClickActionWrapper,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';

const SIZES = ['sm', 'md', 'lg', 'xl'];
const DATASOURCE_TYPES = ['static', 'kinetic-submissions', 'integration'];
const PAGINATION_STYLES = ['forwardBackward', 'pageNumbers', 'infiniteScroll'];
const PAGINATION_TEXTS = [
  'pageOfTotal',
  'recordRange',
  'recordRangeWithTotal',
  'both',
  'none',
];
const REFRESH_POSITIONS = ['left', 'right'];
const FILTER_OPTIONS = ['full', 'datasource', 'status'];
const FILTER_SOURCE_MISMATCH = ['show', 'hide', 'userChoice'];
const FILTER_POSITIONS = ['left', 'right'];
// `status.filterMode` controls where filter buckets come from. 'template'
// (default) derives buckets from match-object `status.template` entries
// with a `when` clause. 'datadriven' additionally walks the loaded data
// and auto-adds any unique `filterField` value that isn't already
// covered by a single-key template `when`.
const STATUS_FILTER_MODES = ['template', 'datadriven'];

// Per-size knobs that scale every visual dimension together. The widget reads
// these once per render based on `config.size` and threads them into icon
// sizes, padding, gaps, font sizes, etc. Adding a new size means adding an
// entry here and to `SIZES`.
const SIZE_TOKENS = {
  sm: {
    iconPx: 18,
    iconBox: 'h-8 w-8',
    rowPad: 'py-2 px-4',
    rowGap: 'gap-3',
    text: 'text-sm',
    headerPad: 'py-1',
    statusDot: 'h-1.5 w-1.5',
  },
  md: {
    iconPx: 22,
    iconBox: 'h-10 w-10',
    rowPad: 'py-3 px-5',
    rowGap: 'gap-4',
    text: 'text-base',
    headerPad: 'py-2',
    statusDot: 'h-2 w-2',
  },
  lg: {
    iconPx: 26,
    iconBox: 'h-12 w-12',
    rowPad: 'py-4 px-6',
    rowGap: 'gap-5',
    text: 'text-lg',
    headerPad: 'py-3',
    statusDot: 'h-2.5 w-2.5',
  },
  xl: {
    iconPx: 30,
    iconBox: 'h-14 w-14',
    rowPad: 'py-5 px-7',
    rowGap: 'gap-6',
    text: 'text-xl',
    headerPad: 'py-4',
    statusDot: 'h-3 w-3',
  },
};

// Slot defaults. Same `SLOT_DEFAULTS` + `cn()` shape used by the Profile
// widget — designers can override per slot with either a string (additive)
// or `{ add?, remove? }` (surgical).
//
// Row layout uses the 2-char `flex-XX` utilities (e.g. `flex-sc`) from
// `assets/styles/layout.css`. Column layout uses the 3-char `flex-c-XX`
// utilities. There is no `flex-r-*` form — `flex-XX` is already the row
// variant; reaching for `flex-r-*` would render as the browser default
// (block) and stack everything vertically.
//
// A `row` is one activity entry. A `row` contains one or more `renderRow`
// elements stacked vertically — one per entry in `config.render` (default
// = one). Each `renderRow` is a flex row with three optional positions
// (left, center, right), each taking an equal share of horizontal space
// and aligning its content to start / center / end respectively. The
// three-flex-1 columns mean a 2-column layout (no center) still pushes
// the right position to the far right edge.
const SLOT_DEFAULTS = {
  root: 'flex-c-st gap-3 w-full',
  header: 'flex-sc gap-2',
  list: 'flex-c-st gap-3',
  row: 'flex-c-st border rounded-box bg-base-100',
  // Layered on top of `row` when the datasource has a clickAction. Resets
  // the interactive-element defaults a `<button>` or `<a>` would otherwise
  // bring with it (centered text, anchor underline + color) so the row
  // looks identical to the non-interactive case until you hover it.
  rowInteractive:
    'text-left w-full no-underline text-base-content cursor-pointer hover:bg-base-200 transition-colors',
  renderRow: 'flex-sc',
  positionLeft: 'flex-sc min-w-0 flex-1',
  positionCenter: 'flex-cc min-w-0 flex-1',
  positionRight: 'flex-ec min-w-0 flex-1',
  iconBox: 'flex-cc rounded-full bg-base-200 text-base-content flex-none',
  description: 'font-semibold truncate',
  statusText: 'text-base-content/70',
  // Color is applied per-row by the matched status template entry (see
  // `DOT_COLORS`); the slot itself only handles shape + spacing.
  statusDot: 'rounded-full ml-2 flex-none',
  pagination:
    'flex-cc gap-6 border rounded-box bg-base-100 py-2 px-6 min-h-12',
  paginationText: 'font-semibold',
  // Plain styled buttons — DaisyUI's `kbtn:active` applies a sub-pixel
  // `translate: 0 .5px` which, combined with `kbtn-circle`'s small hit
  // box, was drifting the cursor off the button between mousedown and
  // mouseup, suppressing the `click` event entirely inside Kinetic
  // form bundles. Keeping interactive surfaces transform-free here
  // avoids that issue.
  prevButton:
    'inline-flex items-center justify-center rounded-full p-2 cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default',
  nextButton:
    'inline-flex items-center justify-center rounded-full p-2 cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default',
  // pageNumbers style — individual number buttons + active variant + …
  pageNumber:
    'inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full cursor-pointer hover:bg-base-200 text-sm',
  pageNumberActive: 'bg-base-200 font-semibold',
  pageNumberEllipsis: 'inline-flex items-center justify-center min-w-6 h-8 text-base-content/50 select-none',
  // infiniteScroll style — sentinel container at the bottom of the list,
  // plus the indicator text inside it. The sentinel has a small min-height
  // so IntersectionObserver has something to observe even when the list
  // grows past the viewport.
  infiniteScrollSentinel: 'flex-cc py-3 min-h-10',
  infiniteScrollText: 'text-sm text-base-content/60',
  refreshButton:
    'inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default',
  empty: 'border rounded-box bg-base-100 py-6 px-6 text-center text-base-content/60',
  loading: 'border rounded-box bg-base-100 py-6 px-6 text-center text-base-content/60',
  error: 'border border-error/40 rounded-box bg-error/5 py-3 px-4 text-sm text-error',
  // Filter trigger + dialog. The trigger sits in the header. The dialog is
  // an Ark Popover positioned relative to the trigger; staged-draft UX so
  // changes only commit when the designer hits Show Results. All buttons
  // here avoid `kbtn-circle` for the press-state translate-suppression
  // reason documented next to prevButton / nextButton.
  filterTrigger:
    'inline-flex items-center gap-2 rounded-full bg-base-200 px-3 py-2 cursor-pointer hover:bg-base-300',
  filterTriggerLabel: 'truncate max-w-[16em]',
  filterDialog:
    'flex-c-st gap-4 bg-base-100 border border-base-300 rounded-box shadow-lg p-5 min-w-72 max-w-[90vw] z-30 outline-0',
  filterDialogHeader: 'flex-bc gap-3',
  filterDialogTitle: 'text-lg font-semibold',
  filterDialogClose:
    'inline-flex items-center justify-center rounded-full p-1 cursor-pointer hover:bg-base-200',
  filterGroup: 'flex-c-st gap-2',
  filterGroupTitle: 'text-sm font-semibold text-base-content/70',
  filterButtonRow: 'flex flex-wrap gap-2',
  filterButton:
    'inline-flex items-center gap-2 rounded-full border border-base-300 px-3 py-1.5 text-sm cursor-pointer hover:bg-base-200',
  // Layered on top of `filterButton` for the selected state. Designers
  // who want a different active look can override `filterButtonActive`.
  filterButtonActive: 'bg-base-200 border-base-content/30',
  filterDot: 'h-2 w-2 rounded-full flex-none',
  filterFooter: 'flex-bc gap-3 pt-1',
  filterClearButton:
    'inline-flex items-center justify-center rounded-full px-3 py-2 cursor-pointer text-sm text-base-content/70 hover:bg-base-200',
  filterApplyButton:
    'inline-flex items-center justify-center rounded-full px-4 py-2 cursor-pointer text-sm font-semibold bg-warning text-warning-content hover:bg-warning/90',
};
const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

// Curated map of dot color names → Tailwind bg classes. Each value is a
// literal string in this file so Tailwind's compile-time content scan
// picks it up; designer-typed `dot: 'success'` in a form bundle would
// otherwise silently no-op when the class isn't compiled. Limited to the
// DaisyUI semantic palette + a few base-* shades — anything else
// validates as an error so designers get a clear failure rather than a
// missing color.
const DOT_COLORS = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  accent: 'bg-accent',
  neutral: 'bg-neutral',
  'base-100': 'bg-base-100',
  'base-200': 'bg-base-200',
  'base-300': 'bg-base-300',
  'base-content': 'bg-base-content',
};
const DOT_COLOR_NAMES = Object.keys(DOT_COLORS);

/* ------------------------------------------------------------------ */
/* Template interpolation                                              */
/*                                                                    */
/* `{{...}}` tokens inside description / status / icon templates AND  */
/* render-config content items are resolved against a context object: */
/*   - {{row.path}}        → lodash get on the data row                */
/*   - {{path}}            → same (bare path defaults to row)          */
/*   - {{datasource.k}}    → `resolved[k]` — values computed once per  */
/*     row from the datasource config (name, label, icon, description, */
/*     status, iconSpacer).                                            */
/*   - {{format:FMT:path}} → format applied to the resolved value at  */
/*     path. Last colon splits FMT from path so format strings can    */
/*     contain colons (`YYYY-MM-DD HH:mm:ss`). FMT === 'RelativeTime' */
/*     renders "X ago" via date-fns formatDistance (matches the       */
/*     bundle-wide `timeAgo` helper); any other FMT is treated as a    */
/*     moment format string.                                           */
/* ------------------------------------------------------------------ */

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;
const FORMAT_PREFIX = 'format:';

const formatRelative = value => {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Matches the bundle-wide `timeAgo` helper so all relative-time strings
  // read the same way ("about 1 year ago", "less than a minute ago", etc.).
  return formatDistance(date, new Date(), { addSuffix: true });
};

const applyFormat = (fmt, value) => {
  if (fmt === 'RelativeTime') return formatRelative(value);
  // Treat anything else as a moment format string. Moment returns
  // 'Invalid date' for unparseable inputs — surface the empty string
  // instead so a missing field renders blank rather than noisy.
  if (value == null || value === '') return '';
  const m = moment(value);
  if (!m.isValid()) return '';
  return m.format(fmt);
};

const resolveToken = (token, ctx) => {
  const t = token.trim();
  if (t === '') return '';
  if (t.startsWith(FORMAT_PREFIX)) {
    // Last colon splits the format argument from the value path. The
    // format argument is everything between `format:` and the last `:`;
    // the path is everything after. Allows colon-containing format
    // strings like `YYYY-MM-DD HH:mm:ss`.
    const rest = t.slice(FORMAT_PREFIX.length);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return '';
    const fmt = rest.slice(0, lastColon);
    const path = rest.slice(lastColon + 1).trim();
    const raw = resolvePath(path, ctx);
    return applyFormat(fmt, raw);
  }
  return resolvePath(t, ctx);
};

const resolvePath = (path, ctx) => {
  if (!path) return '';
  // `datasource.X` reads from the resolved-datasource bag (icon string,
  // description text, status text, etc. computed once per row). This
  // path is only useful in P2's `render` config; in P1 it returns ''.
  if (path === 'datasource' || path.startsWith('datasource.')) {
    const key = path === 'datasource' ? '' : path.slice('datasource.'.length);
    const v = key === '' ? ctx.resolved : get(ctx.resolved, key);
    return v == null ? '' : String(v);
  }
  // `row.X` reads from the data row. Bare `X` (no namespace prefix)
  // also reads the row — matches the existing integration.js
  // `interpolateString` semantics so designers can drop a path in
  // without thinking about the namespace.
  const rowPath = path.startsWith('row.') ? path.slice(4) : path;
  const v = rowPath === 'row' ? ctx.row : get(ctx.row, rowPath);
  return v == null ? '' : String(v);
};

const interpolate = (template, ctx) => {
  if (typeof template !== 'string' || !template.includes('{{')) return template || '';
  return template.replace(TEMPLATE_RE, (_m, token) => resolveToken(token, ctx));
};

// Walks a value, interpolating every string against `ctx`. Used to
// produce a per-row `clickAction` / `target` from the designer's
// templated config — `path: '/requests/{{row.id}}'` becomes
// `path: '/requests/abc123'` for each row. Functions (e.g.,
// `target.onClose`) and other non-string scalars pass through.
const interpolateDeep = (value, ctx) => {
  if (typeof value === 'string') return interpolate(value, ctx);
  if (Array.isArray(value)) return value.map(v => interpolateDeep(v, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateDeep(v, ctx);
    }
    return out;
  }
  return value;
};

/* ------------------------------------------------------------------ */
/* Per-row resolution                                                  */
/*                                                                    */
/* For a given row + datasource, produce the strings the renderer     */
/* hands to JSX: icon name, description, status text. Status supports */
/* either a single template string OR a `match-object` array — the    */
/* DSL the user selected for conditional rendering.                    */
/* ------------------------------------------------------------------ */

const resolveIcon = (ds, row) => {
  if (ds.icon == null || ds.icon === '') return '';
  return interpolate(ds.icon, { row, resolved: {} });
};

const resolveDescription = (ds, row) => {
  if (ds.description == null || ds.description === '') return '';
  return interpolate(ds.description, { row, resolved: {} });
};

// Tests whether every key in the `when` object equality-matches the row.
// Keys are lodash paths into the row. `null`/`undefined` row values
// compare as themselves; designer-side values must match exactly.
const matchesWhen = (when, row) => {
  if (when == null) return true;
  if (typeof when !== 'object' || Array.isArray(when)) return false;
  for (const [path, expected] of Object.entries(when)) {
    if (get(row, path) !== expected) return false;
  }
  return true;
};

// Stable filter-bucket identifier for a template entry at position `i`.
// Designers can set `value` explicitly for stability across config edits;
// without that, we generate one from the index. Index-based fallbacks are
// fine for static configs that don't get rearranged, but designers using
// `filter.active` to pre-select buckets should set `value` to lock the
// identifier across edits.
const bucketKeyFor = (entry, i) =>
  typeof entry?.value === 'string' && entry.value !== ''
    ? entry.value
    : `auto-${i}`;

// Strips `{{...}}` template tokens out of a string so it can be used as a
// fallback label in the filter UI (where there's no row context).
const stripTemplates = s =>
  typeof s === 'string' ? s.replace(TEMPLATE_RE, '').trim() : '';

// Falls back to the raw `filterField` value as the bucket key when the
// datasource is in datadriven mode and no template entry produced one.
// Stringified so it lines up cleanly with the keys auto-derived buckets
// register under (see `bucketsFor`).
const datadrivenBucketKey = (ds, row) => {
  if (ds.status?.filterMode !== 'datadriven') return null;
  const field = ds.status?.filterField;
  if (!field) return null;
  const v = get(row, field);
  return v == null ? null : String(v);
};

// Per-row status resolution. Returns:
//   - text         — rendered status string for the row.
//   - dot          — color name (key of DOT_COLORS) for this row's matched
//                    entry. Falls back to `status.dot`. `false` on an
//                    entry suppresses explicitly.
//   - bucketKey    — stable filter-bucket key for the matched entry; in
//                    datadriven mode, falls back to the row's raw
//                    `filterField` value when no template entry matched.
//                    `null` when there's nothing to bucket on. Used by
//                    filter logic.
const resolveStatus = (ds, row) => {
  const tpl = ds.status?.template;
  const dsDot = typeof ds.status?.dot === 'string' ? ds.status.dot : null;
  if (tpl == null || tpl === '') {
    return { text: '', dot: null, bucketKey: datadrivenBucketKey(ds, row) };
  }
  if (typeof tpl === 'string') {
    return {
      text: interpolate(tpl, { row, resolved: {} }),
      dot: dsDot,
      bucketKey: datadrivenBucketKey(ds, row),
    };
  }
  if (Array.isArray(tpl)) {
    for (let i = 0; i < tpl.length; i++) {
      const entry = tpl[i];
      if (!entry || typeof entry !== 'object') continue;
      if (!matchesWhen(entry.when, row)) continue;
      let entryDot;
      if (entry.dot === false) entryDot = null;
      else if (typeof entry.dot === 'string') entryDot = entry.dot;
      else entryDot = dsDot;
      // Entries without a `when` clause are fallbacks — they don't get
      // their own bucket (template-mode treats those rows as unmatched
      // and lets `sourceMismatch` decide; datadriven mode falls through
      // to the raw filterField value).
      const isBucket = entry.when != null;
      const bucketKey = isBucket
        ? bucketKeyFor(entry, i)
        : datadrivenBucketKey(ds, row);
      return {
        text: interpolate(entry.render || '', { row, resolved: {} }),
        dot: entryDot,
        bucketKey,
      };
    }
    return { text: '', dot: null, bucketKey: datadrivenBucketKey(ds, row) };
  }
  return { text: '', dot: null, bucketKey: null };
};

// Per-datasource filter buckets, derived from the match-object status
// template. Each bucket: `{ key, label, dot }`. Designers can give a
// template entry an explicit `label` for the filter UI; otherwise we
// fall back to the `render` text stripped of template tokens, then to
// the bucket key. Datasources without a match-object template produce
// an empty list (or a datadriven-only list, see below).
//
// When `status.filterMode === 'datadriven'`, the function also walks
// `sourceRows` and appends any unique `filterField` value that isn't
// already covered by a single-key template `when` clause matching that
// field. This lets a datasource enumerate "Open / Draft / Closed" via
// template AND auto-surface unexpected values like "Pending" without
// the designer touching the config.
const bucketsFor = (ds, sourceRows) => {
  const tpl = ds.status?.template;
  const out = [];
  const seenKeys = new Set();

  if (Array.isArray(tpl)) {
    for (let i = 0; i < tpl.length; i++) {
      const entry = tpl[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.when == null) continue; // skip fallback entries
      const key = bucketKeyFor(entry, i);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const explicit =
        typeof entry.label === 'string' && entry.label !== '' ? entry.label : null;
      const fromRender = stripTemplates(entry.render);
      const label = explicit || fromRender || key;
      const dot = typeof entry.dot === 'string' ? entry.dot : null;
      out.push({ key, label, dot });
    }
  }

  if (ds.status?.filterMode === 'datadriven' && Array.isArray(sourceRows)) {
    const field = ds.status.filterField;
    // Values covered by a single-key template `when` shouldn't be
    // double-listed. Multi-key `when` clauses don't simplify to a single
    // covered value, so they don't suppress data-driven additions —
    // template-keyed bucket and a raw-value bucket can coexist if the
    // designer wrote a multi-key `when` (rare and intentional).
    const coveredValues = new Set();
    if (Array.isArray(tpl)) {
      for (const entry of tpl) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.when == null) continue;
        const keys = Object.keys(entry.when);
        if (keys.length === 1 && keys[0] === field) {
          coveredValues.add(String(entry.when[field]));
        }
      }
    }
    const seenValues = new Set();
    for (const row of sourceRows) {
      const v = get(row, field);
      if (v == null) continue;
      const sv = String(v);
      if (seenValues.has(sv)) continue;
      seenValues.add(sv);
      if (coveredValues.has(sv)) continue;
      if (seenKeys.has(sv)) continue;
      seenKeys.add(sv);
      out.push({ key: sv, label: sv, dot: null });
    }
  }

  return out;
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const log = (msg, level = 'error') => {
  if (level === 'error') console.error(`Activity Widget Error: ${msg}`);
  else console.warn(`Activity Widget Warning: ${msg}`);
};

const validateStatus = (status, dsName) => {
  if (status == null) return true;
  if (typeof status !== 'object' || Array.isArray(status)) {
    log(`datasources[${dsName}].status must be an object.`);
    return false;
  }
  const { template, filterField } = status;
  if (template != null) {
    if (typeof template === 'string') {
      // OK
    } else if (Array.isArray(template)) {
      for (const [i, entry] of template.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          log(`datasources[${dsName}].status.template[${i}] must be an object.`);
          return false;
        }
        if (typeof entry.render !== 'string') {
          log(
            `datasources[${dsName}].status.template[${i}].render must be a string.`,
          );
          return false;
        }
        if (
          entry.when != null &&
          (typeof entry.when !== 'object' || Array.isArray(entry.when))
        ) {
          log(
            `datasources[${dsName}].status.template[${i}].when must be a plain object when provided.`,
          );
          return false;
        }
        if (
          entry.dot != null &&
          entry.dot !== false &&
          !(typeof entry.dot === 'string' && DOT_COLORS[entry.dot])
        ) {
          log(
            `datasources[${dsName}].status.template[${i}].dot must be one of ` +
              `${DOT_COLOR_NAMES.join(', ')}, or \`false\` to suppress the dot ` +
              `for this entry. Got ${JSON.stringify(entry.dot)}.`,
          );
          return false;
        }
        if (
          entry.value != null &&
          (typeof entry.value !== 'string' || entry.value === '')
        ) {
          log(
            `datasources[${dsName}].status.template[${i}].value must be a non-empty string when provided.`,
          );
          return false;
        }
        if (entry.label != null && typeof entry.label !== 'string') {
          log(
            `datasources[${dsName}].status.template[${i}].label must be a string when provided.`,
          );
          return false;
        }
      }
    } else {
      log(
        `datasources[${dsName}].status.template must be a string or an array of { when?, render } entries.`,
      );
      return false;
    }
  }
  if (filterField != null && typeof filterField !== 'string') {
    log(`datasources[${dsName}].status.filterField must be a string when provided.`);
    return false;
  }
  if (status.filterMode != null && !STATUS_FILTER_MODES.includes(status.filterMode)) {
    log(
      `datasources[${dsName}].status.filterMode must be one of ${STATUS_FILTER_MODES.join(', ')}.`,
    );
    return false;
  }
  if (status.filterMode === 'datadriven' && (typeof filterField !== 'string' || filterField === '')) {
    log(
      `datasources[${dsName}].status.filterField is required when filterMode is 'datadriven' — it tells the widget which row field to enumerate buckets from.`,
    );
    return false;
  }
  if (status.dot != null && !DOT_COLORS[status.dot]) {
    log(
      `datasources[${dsName}].status.dot must be one of ` +
        `${DOT_COLOR_NAMES.join(', ')}. Got ${JSON.stringify(status.dot)}.`,
    );
    return false;
  }
  return true;
};

const validateDatasource = (ds, names) => {
  if (!ds || typeof ds !== 'object' || Array.isArray(ds)) {
    log('each datasource must be an object.');
    return false;
  }
  if (typeof ds.name !== 'string' || ds.name === '') {
    log('datasource.name is required and must be a non-empty string.');
    return false;
  }
  if (names.has(ds.name)) {
    log(`duplicate datasource name "${ds.name}"; names must be unique.`);
    return false;
  }
  names.add(ds.name);
  if (!DATASOURCE_TYPES.includes(ds.type)) {
    log(
      `datasources[${ds.name}].type must be one of ${DATASOURCE_TYPES.join(', ')}.`,
    );
    return false;
  }
  if (typeof ds.sortField !== 'string' || ds.sortField === '') {
    log(`datasources[${ds.name}].sortField is required (lodash path into the row).`);
    return false;
  }
  if (ds.label != null && typeof ds.label !== 'string') {
    log(`datasources[${ds.name}].label must be a string when provided.`);
    return false;
  }
  if (ds.idField != null && typeof ds.idField !== 'string') {
    log(`datasources[${ds.name}].idField must be a string when provided.`);
    return false;
  }
  if (ds.referenceField != null && typeof ds.referenceField !== 'string') {
    log(`datasources[${ds.name}].referenceField must be a string when provided.`);
    return false;
  }
  if (ds.description != null && typeof ds.description !== 'string') {
    log(`datasources[${ds.name}].description must be a string template.`);
    return false;
  }
  if (ds.icon != null && typeof ds.icon !== 'string') {
    log(`datasources[${ds.name}].icon must be a string (icon name or template).`);
    return false;
  }
  if (!validateStatus(ds.status, ds.name)) return false;
  // Type-specific validation
  if (ds.type === 'static') {
    if (ds.data != null && !Array.isArray(ds.data)) {
      log(`datasources[${ds.name}].data must be an array (type: 'static').`);
      return false;
    }
  } else if (ds.type === 'kinetic-submissions') {
    if (typeof ds.kapp !== 'string' || ds.kapp === '') {
      log(`datasources[${ds.name}].kapp is required (type: 'kinetic-submissions').`);
      return false;
    }
    if (ds.form != null && typeof ds.form !== 'string') {
      log(`datasources[${ds.name}].form must be a string when provided.`);
      return false;
    }
    if (
      ds.search != null &&
      (typeof ds.search !== 'object' || Array.isArray(ds.search))
    ) {
      log(`datasources[${ds.name}].search must be a plain object.`);
      return false;
    }
  } else if (ds.type === 'integration') {
    const i = ds.integration;
    if (!i || typeof i !== 'object' || Array.isArray(i)) {
      log(`datasources[${ds.name}].integration is required (type: 'integration').`);
      return false;
    }
    if (typeof i.kappSlug !== 'string' || i.kappSlug === '') {
      log(`datasources[${ds.name}].integration.kappSlug is required.`);
      return false;
    }
    if (typeof i.integrationName !== 'string' || i.integrationName === '') {
      log(`datasources[${ds.name}].integration.integrationName is required.`);
      return false;
    }
    if (typeof i.listProperty !== 'string' || i.listProperty === '') {
      log(`datasources[${ds.name}].integration.listProperty is required.`);
      return false;
    }
    if (i.formSlug != null && typeof i.formSlug !== 'string') {
      log(`datasources[${ds.name}].integration.formSlug must be a string when provided.`);
      return false;
    }
    if (
      i.parameters != null &&
      (typeof i.parameters !== 'object' || Array.isArray(i.parameters))
    ) {
      log(`datasources[${ds.name}].integration.parameters must be a plain object.`);
      return false;
    }
    if (i.errorProperty != null && typeof i.errorProperty !== 'string') {
      log(`datasources[${ds.name}].integration.errorProperty must be a string when provided.`);
      return false;
    }
  }
  // Per-row click behavior — reuses the shared chrome-utils system, same
  // surface as BundleLink / BundleAvatar / Profile actions. The shared
  // validators log under whatever widgetName we pass; prefix with the
  // datasource name so the error pinpoints which entry is wrong.
  const widgetTag = `Activity datasources[${ds.name}]`;
  if (!validateClickAction(ds.clickAction, widgetTag)) return false;
  if (!validateTarget(ds.target, widgetTag)) return false;
  if (ds.clickActionLabel != null && typeof ds.clickActionLabel !== 'string') {
    log(`datasources[${ds.name}].clickActionLabel must be a string template when provided.`);
    return false;
  }
  return true;
};

const validateClassNames = classNames => {
  if (classNames == null) return true;
  if (typeof classNames !== 'object' || Array.isArray(classNames)) {
    log('config.classNames must be a plain object keyed by slot name.');
    return false;
  }
  for (const slot of Object.keys(classNames)) {
    if (!SLOT_NAMES.includes(slot)) {
      log(
        `unknown classNames slot "${slot}". Known slots: ${SLOT_NAMES.join(', ')}.`,
        'warn',
      );
    }
  }
  return true;
};

const RENDER_POSITIONS = ['left', 'center', 'right'];
const RENDER_CLASSNAME_KEYS = [
  'className',
  'leftClassName',
  'centerClassName',
  'rightClassName',
];

const validateRender = render => {
  if (render == null) return true;
  if (!Array.isArray(render)) {
    log('config.render must be an array of render-row objects.');
    return false;
  }
  for (const [i, entry] of render.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      log(`config.render[${i}] must be a plain object.`);
      return false;
    }
    let hasPosition = false;
    for (const pos of RENDER_POSITIONS) {
      if (entry[pos] == null) continue;
      hasPosition = true;
      if (!Array.isArray(entry[pos])) {
        log(`config.render[${i}].${pos} must be an array of template strings.`);
        return false;
      }
      for (const [j, item] of entry[pos].entries()) {
        if (typeof item !== 'string') {
          log(`config.render[${i}].${pos}[${j}] must be a string template.`);
          return false;
        }
      }
    }
    if (!hasPosition) {
      log(
        `config.render[${i}] has no positions — at least one of ` +
          `${RENDER_POSITIONS.join(', ')} is required.`,
      );
      return false;
    }
    for (const k of RENDER_CLASSNAME_KEYS) {
      if (entry[k] != null && typeof entry[k] !== 'string') {
        log(`config.render[${i}].${k} must be a string when provided.`);
        return false;
      }
    }
  }
  return true;
};

const validateConfig = (config = {}) => {
  if (config.size != null && !SIZES.includes(config.size)) {
    log(`config.size must be one of ${SIZES.join(', ')}.`);
    return false;
  }
  if (!Array.isArray(config.datasources) || config.datasources.length === 0) {
    log('config.datasources must be a non-empty array.');
    return false;
  }
  const names = new Set();
  for (const ds of config.datasources) {
    if (!validateDatasource(ds, names)) return false;
  }
  if (config.pagination != null) {
    const p = config.pagination;
    if (typeof p !== 'object' || Array.isArray(p)) {
      log('config.pagination must be a plain object.');
      return false;
    }
    if (p.style != null && !PAGINATION_STYLES.includes(p.style)) {
      log(`config.pagination.style must be one of ${PAGINATION_STYLES.join(', ')}.`);
      return false;
    }
    if (p.text != null && !PAGINATION_TEXTS.includes(p.text)) {
      log(`config.pagination.text must be one of ${PAGINATION_TEXTS.join(', ')}.`);
      return false;
    }
    if (
      p.recordsPerPage != null &&
      (typeof p.recordsPerPage !== 'number' || p.recordsPerPage <= 0)
    ) {
      log('config.pagination.recordsPerPage must be a positive number.');
      return false;
    }
    if (
      p.maxReturned != null &&
      p.maxReturned !== 'all' &&
      (typeof p.maxReturned !== 'number' || p.maxReturned < 0)
    ) {
      log(`config.pagination.maxReturned must be a non-negative number or "all".`);
      return false;
    }
    if (
      p.pageNumbersWindow != null &&
      (typeof p.pageNumbersWindow !== 'number' || p.pageNumbersWindow < 0)
    ) {
      log('config.pagination.pageNumbersWindow must be a non-negative number.');
      return false;
    }
    if (p.scrollLoadingText != null && typeof p.scrollLoadingText !== 'string') {
      log('config.pagination.scrollLoadingText must be a string when provided.');
      return false;
    }
    if (p.scrollEndText != null && typeof p.scrollEndText !== 'string') {
      log('config.pagination.scrollEndText must be a string when provided.');
      return false;
    }
  }
  if (config.refresh != null) {
    const r = config.refresh;
    if (typeof r !== 'object' || Array.isArray(r)) {
      log('config.refresh must be a plain object.');
      return false;
    }
    if (r.enabled != null && typeof r.enabled !== 'boolean') {
      log('config.refresh.enabled must be a boolean.');
      return false;
    }
    if (r.label != null && typeof r.label !== 'string') {
      log('config.refresh.label must be a string when provided.');
      return false;
    }
    if (r.icon != null && r.icon !== null && typeof r.icon !== 'string') {
      log('config.refresh.icon must be a string (or null to hide).');
      return false;
    }
    if (r.position != null && !REFRESH_POSITIONS.includes(r.position)) {
      log(`config.refresh.position must be one of ${REFRESH_POSITIONS.join(', ')}.`);
      return false;
    }
  }
  if (!validateClassNames(config.classNames)) return false;
  if (!validateRender(config.render)) return false;
  if (!validateFilter(config.filter, config.datasources)) return false;
  return true;
};

const validateFilter = (filter, datasources) => {
  if (filter == null) return true;
  if (typeof filter !== 'object' || Array.isArray(filter)) {
    log('config.filter must be a plain object.');
    return false;
  }
  if (filter.userSettable != null && typeof filter.userSettable !== 'boolean') {
    log('config.filter.userSettable must be a boolean.');
    return false;
  }
  if (filter.options != null && !FILTER_OPTIONS.includes(filter.options)) {
    log(`config.filter.options must be one of ${FILTER_OPTIONS.join(', ')}.`);
    return false;
  }
  if (
    filter.sourceMismatch != null &&
    !FILTER_SOURCE_MISMATCH.includes(filter.sourceMismatch)
  ) {
    log(
      `config.filter.sourceMismatch must be one of ${FILTER_SOURCE_MISMATCH.join(', ')}` +
        ' (userChoice is reserved for a later sub-phase).',
    );
    return false;
  }
  if (filter.position != null && !FILTER_POSITIONS.includes(filter.position)) {
    log(`config.filter.position must be one of ${FILTER_POSITIONS.join(', ')}.`);
    return false;
  }
  if (filter.allLabel != null && typeof filter.allLabel !== 'string') {
    log('config.filter.allLabel must be a string when provided.');
    return false;
  }
  if (filter.active != null) {
    if (typeof filter.active !== 'object' || Array.isArray(filter.active)) {
      log('config.filter.active must be a plain object.');
      return false;
    }
    if (filter.active.datasources != null) {
      if (
        !Array.isArray(filter.active.datasources) ||
        !filter.active.datasources.every(s => typeof s === 'string')
      ) {
        log('config.filter.active.datasources must be an array of strings.');
        return false;
      }
      const dsNames = new Set(datasources.map(d => d.name));
      for (const name of filter.active.datasources) {
        if (!dsNames.has(name)) {
          log(
            `config.filter.active.datasources includes "${name}", which doesn't match any datasource name.`,
            'warn',
          );
        }
      }
    }
    if (filter.active.statuses != null) {
      if (
        typeof filter.active.statuses !== 'object' ||
        Array.isArray(filter.active.statuses)
      ) {
        log('config.filter.active.statuses must be a plain object keyed by datasource name.');
        return false;
      }
      for (const [dsName, keys] of Object.entries(filter.active.statuses)) {
        if (!Array.isArray(keys) || !keys.every(s => typeof s === 'string')) {
          log(
            `config.filter.active.statuses["${dsName}"] must be an array of bucket-key strings.`,
          );
          return false;
        }
      }
    }
    if (filter.active.showUnmatched != null) {
      if (
        typeof filter.active.showUnmatched !== 'object' ||
        Array.isArray(filter.active.showUnmatched)
      ) {
        log(
          'config.filter.active.showUnmatched must be a plain object keyed by datasource name.',
        );
        return false;
      }
      for (const [dsName, val] of Object.entries(filter.active.showUnmatched)) {
        if (typeof val !== 'boolean') {
          log(
            `config.filter.active.showUnmatched["${dsName}"] must be a boolean.`,
          );
          return false;
        }
      }
    }
  }
  return true;
};

// Default render config — what the widget falls back to when the designer
// doesn't supply `config.render`. Drives off the same render machinery as
// custom configs, so there's a single code path. Matches the P1 visual:
// icon + description on the left, status text + colored dot on the right.
const DEFAULT_RENDER = [
  {
    left: ['{{datasource.icon}}', '{{datasource.description}}'],
    right: ['{{datasource.status}}'],
  },
];

// Tokens that drive special rendering (rather than plain text). The trim
// here is intentional — designers write tokens with surrounding
// whitespace sometimes (`"  {{datasource.icon}}  "`) and we want those
// to still hit the icon branch rather than fall through to text.
const ICON_TOKEN = '{{datasource.icon}}';
const ICON_SPACER_TOKEN = '{{datasource.iconSpacer}}';
const STATUS_TOKEN = '{{datasource.status}}';

/* ------------------------------------------------------------------ */
/* Loaders                                                             */
/*                                                                    */
/* One async loader per datasource type. Returns the raw row array on  */
/* success or throws an `{ message, ... }` shape on failure. The      */
/* `useDatasources` hook funnels these through `Promise.allSettled` so */
/* a single failing source doesn't prevent the others from rendering. */
/* ------------------------------------------------------------------ */

const loadStatic = ds => Promise.resolve(Array.isArray(ds.data) ? ds.data : []);

// `searchSubmissions` reads `search.include.length` / `.join()` unconditionally,
// so we always hand it a real array. We also accept the common
// comma-separated-string form because designers reach for it from KQL examples
// and the bare-string form is the easiest typo to make.
const normalizeSearch = (search = {}) => {
  const include = search.include;
  let normalized;
  if (Array.isArray(include)) {
    normalized = include;
  } else if (typeof include === 'string') {
    normalized = include
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  } else {
    normalized = [];
  }
  return { ...search, include: normalized };
};

const loadKineticSubmissions = async ds => {
  const response = await searchSubmissions({
    kapp: ds.kapp,
    form: ds.form,
    search: normalizeSearch(ds.search),
  });
  if (response && response.error) throw response.error;
  return response?.submissions || [];
};

const loadIntegration = async ds => {
  const i = ds.integration;
  const response = await executeIntegration({
    kappSlug: i.kappSlug,
    formSlug: i.formSlug,
    integrationName: i.integrationName,
    parameters: i.parameters || {},
  });
  if (response && response.error) throw response.error;
  if (i.errorProperty) {
    const customError = get(response, i.errorProperty);
    if (customError) {
      throw typeof customError === 'object' && customError !== null
        ? customError
        : { message: String(customError) };
    }
  }
  const rows = get(response, i.listProperty);
  if (!Array.isArray(rows)) {
    throw {
      message: `Integration response listProperty '${i.listProperty}' is not an array.`,
    };
  }
  return rows;
};

const loadDatasource = ds => {
  switch (ds.type) {
    case 'static':
      return loadStatic(ds);
    case 'kinetic-submissions':
      return loadKineticSubmissions(ds);
    case 'integration':
      return loadIntegration(ds);
    default:
      return Promise.resolve([]);
  }
};

// Fires all configured datasources in parallel. Holds `loading: true` until
// every loader has resolved (success or error) — the user explicitly asked
// for "no data should be rendered until all data is returned." Errors are
// collected per-source so partial success still renders the sources that
// worked.
const useDatasources = datasources => {
  const [state, setState] = useState({
    loading: true,
    errors: {},
    sourceRows: {},
  });
  const fetchIdRef = useRef(0);

  const refresh = useCallback(() => {
    const myId = ++fetchIdRef.current;
    setState(s => ({ ...s, loading: true }));
    Promise.allSettled(datasources.map(loadDatasource)).then(results => {
      // Race guard: stale fetch results are dropped on arrival so a rapid
      // double-refresh can't paint older data over newer data.
      if (myId !== fetchIdRef.current) return;
      const sourceRows = {};
      const errors = {};
      results.forEach((r, i) => {
        const name = datasources[i].name;
        if (r.status === 'fulfilled') sourceRows[name] = r.value;
        else errors[name] = r.reason || { message: 'Unknown error' };
      });
      setState({ loading: false, errors, sourceRows });
    });
  }, [datasources]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
};

/* ------------------------------------------------------------------ */
/* Row resolution + sorting                                            */
/* ------------------------------------------------------------------ */

// Builds the merged, sorted list of "resolved rows" the renderer iterates.
// Each entry pairs the raw row with the resolved strings (icon name,
// description, status) and the datasource it came from. Sort is
// descending by `sortField` (most recent first), the convention from the
// existing TicketCard list.
const buildRows = (datasources, sourceRows, maxReturned) => {
  const all = [];
  for (const ds of datasources) {
    const rows = sourceRows[ds.name];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const {
        text: statusText,
        dot: statusDotName,
        bucketKey: statusBucketKey,
      } = resolveStatus(ds, row);
      all.push({
        ds,
        row,
        sortValue: get(row, ds.sortField),
        id: get(row, ds.idField || 'id'),
        icon: resolveIcon(ds, row),
        description: resolveDescription(ds, row),
        status: statusText,
        statusDotName,
        statusBucketKey,
      });
    }
  }
  all.sort((a, b) => {
    const av = a.sortValue;
    const bv = b.sortValue;
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? 1 : -1;
  });
  if (typeof maxReturned === 'number' && maxReturned > 0) {
    return all.slice(0, maxReturned);
  }
  return all;
};

// Materializes the initial active-filter state from the designer's
// `filter.active` config. Sets are convenient at runtime (cheap add /
// has / size) but they don't survive `===` comparison across renders
// for `useMemo` / `useEffect`, so we re-seed via a string key when the
// config changes. `showUnmatched` is per-source: `true` is the default
// (matches the behavior of `sourceMismatch: 'show'`), and only the
// `'userChoice'` mode lets the user flip it.
const buildFilterState = (active = {}, datasources) => ({
  datasources: new Set(
    Array.isArray(active.datasources) ? active.datasources : [],
  ),
  statuses: Object.fromEntries(
    datasources.map(ds => [
      ds.name,
      new Set(
        Array.isArray(active.statuses?.[ds.name])
          ? active.statuses[ds.name]
          : [],
      ),
    ]),
  ),
  showUnmatched: Object.fromEntries(
    datasources.map(ds => [
      ds.name,
      active.showUnmatched?.[ds.name] !== false,
    ]),
  ),
});

const filterStateKey = state =>
  JSON.stringify({
    d: [...state.datasources].sort(),
    s: Object.fromEntries(
      Object.entries(state.statuses).map(([k, v]) => [k, [...v].sort()]),
    ),
    u: state.showUnmatched,
  });

// The filter is "empty" (so the trigger button reads `allLabel` and
// `applyFilter` short-circuits per-axis) when no source / status is
// selected AND every `showUnmatched` flag is at its default `true`.
const isFilterEmpty = state =>
  state.datasources.size === 0 &&
  Object.values(state.statuses).every(s => s.size === 0) &&
  Object.values(state.showUnmatched).every(v => v === true);

// Applies the active filter to the merged row list. Empty sets mean "no
// filter" for that axis (all values pass). Rows whose status template
// fell through to a `when`-less fallback (`statusBucketKey === null`)
// honor `sourceMismatch`:
//   - 'show'       (default)  → pass regardless of the status filter.
//   - 'hide'                   → drop whenever any status filter is active.
//   - 'userChoice'             → consult the per-source `showUnmatched`
//                                flag in `activeFilter`; the dialog
//                                renders a toggle that flips it.
const applyFilter = (rows, activeFilter, sourceMismatch) => {
  const { datasources: dsSet, statuses: statusSets, showUnmatched } = activeFilter;
  return rows.filter(r => {
    if (dsSet.size > 0 && !dsSet.has(r.ds.name)) return false;
    const sourceStatusSet = statusSets[r.ds.name];
    if (sourceStatusSet && sourceStatusSet.size > 0) {
      if (r.statusBucketKey == null) {
        if (sourceMismatch === 'hide') return false;
        if (sourceMismatch === 'userChoice' && showUnmatched[r.ds.name] === false) {
          return false;
        }
      } else if (!sourceStatusSet.has(r.statusBucketKey)) {
        return false;
      }
    }
    return true;
  });
};

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

const ActivityContent = ({ id, config = {} }) => {
  const size = SIZES.includes(config.size) ? config.size : 'md';
  const tokens = SIZE_TOKENS[size];

  // Slot-class helper (mirrors Profile's `cn`). Resolves a slot name
  // against `SLOT_DEFAULTS` + caller `config.classNames[slot]`, accepting
  // either a string (additive) or `{ add?, remove? }` (surgical).
  const cn = useCallback(
    (slot, ...extra) => {
      const base = clsx(SLOT_DEFAULTS[slot], ...extra);
      const override = config.classNames?.[slot];
      if (override == null) return base;
      if (typeof override === 'string') return clsx(base, override);
      const removeList = Array.isArray(override.remove) ? override.remove : null;
      const filtered =
        removeList && removeList.length > 0
          ? base
              .split(/\s+/)
              .filter(t => t && !removeList.includes(t))
              .join(' ')
          : base;
      return clsx(filtered, override.add);
    },
    [config.classNames],
  );

  const datasources = config.datasources;
  const { loading, errors, sourceRows, refresh } = useDatasources(datasources);

  const anyIcon = useMemo(
    () => datasources.some(ds => ds.icon != null && ds.icon !== ''),
    [datasources],
  );

  // `anyDot` mirrors `anyIcon` — true if any datasource configures a status
  // dot anywhere (datasource-level default or per-template-entry). Drives
  // the spacer behavior: when some sources have dots and others don't, the
  // dot-less rows still reserve dot-width so columns line up.
  const anyDot = useMemo(
    () =>
      datasources.some(
        ds =>
          ds.status?.dot != null ||
          (Array.isArray(ds.status?.template) &&
            ds.status.template.some(
              e => e && typeof e === 'object' && typeof e.dot === 'string',
            )),
      ),
    [datasources],
  );

  const renderConfig = Array.isArray(config.render) && config.render.length > 0
    ? config.render
    : DEFAULT_RENDER;

  // Filter config resolution + per-datasource bucket lists. Bucket lists
  // are derived from the match-object status templates and only depend on
  // the static config, so they're memoized off `datasources`.
  const filterConfig = useMemo(() => {
    const f = config.filter || {};
    return {
      userSettable: f.userSettable !== false,
      options: FILTER_OPTIONS.includes(f.options) ? f.options : 'full',
      sourceMismatch: FILTER_SOURCE_MISMATCH.includes(f.sourceMismatch)
        ? f.sourceMismatch
        : 'show',
      position: FILTER_POSITIONS.includes(f.position) ? f.position : 'right',
      allLabel: typeof f.allLabel === 'string' ? f.allLabel : 'All activity',
      active: f.active || {},
    };
  }, [config.filter]);
  // Includes `sourceRows` in the deps because datadriven mode walks
  // loaded data to discover buckets that aren't enumerated in the
  // template. Template-mode datasources ignore `sourceRows`, so the only
  // observable change for them is when the data shape mutates anyway.
  const bucketsByDs = useMemo(() => {
    const out = {};
    for (const ds of datasources) out[ds.name] = bucketsFor(ds, sourceRows[ds.name]);
    return out;
  }, [datasources, sourceRows]);
  // Filter applies when EITHER:
  //   - it's user-settable (designer wants the trigger button rendered), OR
  //   - filter.active is configured (hardwired filter, no UI).
  const filterApplies =
    filterConfig.userSettable ||
    (filterConfig.active &&
      ((Array.isArray(filterConfig.active.datasources) &&
        filterConfig.active.datasources.length > 0) ||
        (filterConfig.active.statuses &&
          Object.values(filterConfig.active.statuses).some(
            v => Array.isArray(v) && v.length > 0,
          ))));

  const initialFilter = useMemo(
    () => buildFilterState(filterConfig.active, datasources),
    [filterConfig.active, datasources],
  );
  const [activeFilter, setActiveFilter] = useState(initialFilter);

  // Whenever the config-level initial filter changes (rare — props are
  // stable for a widget's lifetime, but covers the case where the host
  // updates the config or a future API exposes a setter), re-seed state.
  const seededKey = useRef(filterStateKey(initialFilter));
  const currentKey = filterStateKey(initialFilter);
  if (seededKey.current !== currentKey) {
    seededKey.current = currentKey;
    setActiveFilter(initialFilter);
  }

  const paginationConfig = useMemo(() => {
    const p = config.pagination || {};
    return {
      style: PAGINATION_STYLES.includes(p.style) ? p.style : 'forwardBackward',
      text: PAGINATION_TEXTS.includes(p.text) ? p.text : 'pageOfTotal',
      recordsPerPage:
        typeof p.recordsPerPage === 'number' && p.recordsPerPage > 0
          ? p.recordsPerPage
          : 25,
      maxReturned:
        p.maxReturned === 'all'
          ? 0
          : typeof p.maxReturned === 'number'
            ? p.maxReturned
            : 0,
      pageNumbersWindow:
        typeof p.pageNumbersWindow === 'number' && p.pageNumbersWindow >= 0
          ? p.pageNumbersWindow
          : 1,
      scrollLoadingText:
        typeof p.scrollLoadingText === 'string'
          ? p.scrollLoadingText
          : 'Scroll for more',
      scrollEndText:
        typeof p.scrollEndText === 'string' ? p.scrollEndText : 'No more records',
    };
  }, [config.pagination]);

  const rows = useMemo(() => {
    if (loading) return [];
    const built = buildRows(datasources, sourceRows, paginationConfig.maxReturned);
    return applyFilter(built, activeFilter, filterConfig.sourceMismatch);
  }, [
    loading,
    datasources,
    sourceRows,
    paginationConfig.maxReturned,
    activeFilter,
    filterConfig.sourceMismatch,
  ]);

  const [pageNumber, setPageNumber] = useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(rows.length / paginationConfig.recordsPerPage),
  );
  // Clamp when the underlying data shrinks (e.g. after a refresh or a
  // filter change) so we never sit on a page that no longer exists.
  const safePage = Math.min(pageNumber, totalPages);
  if (safePage !== pageNumber) setPageNumber(safePage);

  // Applying a new filter resets pagination back to page 1 — otherwise
  // we'd land on a now-shorter page two with nothing on it. For
  // infinite scroll this means collapsing back to the first batch.
  const applyActiveFilter = useCallback(next => {
    setActiveFilter(next);
    setPageNumber(1);
  }, []);

  // Pagination styles slice the underlying rows differently:
  //   - forwardBackward / pageNumbers → windowed view of the current page.
  //   - infiniteScroll                → cumulative view from page 1 up to
  //     `pageNumber`. The bottom sentinel calls `loadMore` to advance.
  const pageStart = (safePage - 1) * paginationConfig.recordsPerPage;
  const pageRows =
    paginationConfig.style === 'infiniteScroll'
      ? rows.slice(0, safePage * paginationConfig.recordsPerPage)
      : rows.slice(pageStart, pageStart + paginationConfig.recordsPerPage);

  const loadMore = useCallback(() => {
    setPageNumber(p => Math.min(totalPages, p + 1));
  }, [totalPages]);
  const hasMore = safePage < totalPages;

  const refreshConfig = useMemo(
    () => ({
      enabled: config.refresh?.enabled !== false,
      label: typeof config.refresh?.label === 'string' ? config.refresh.label : '',
      icon:
        config.refresh?.icon === null
          ? null
          : typeof config.refresh?.icon === 'string'
            ? config.refresh.icon
            : 'refresh',
      position: REFRESH_POSITIONS.includes(config.refresh?.position)
        ? config.refresh.position
        : 'right',
    }),
    [config.refresh],
  );

  const errorEntries = Object.entries(errors);

  const showFilterTrigger = filterConfig.userSettable && filterApplies;
  const showHeader = refreshConfig.enabled || showFilterTrigger;

  const refreshButton = refreshConfig.enabled ? (
    <button
      type="button"
      className={cn('refreshButton')}
      onClick={refresh}
      disabled={loading}
      aria-label={refreshConfig.label || 'Refresh'}
    >
      {refreshConfig.icon && (
        <Icon
          name={refreshConfig.icon}
          size={tokens.iconPx - 4}
          className={loading ? 'animate-spin' : undefined}
        />
      )}
      {refreshConfig.label && <span>{refreshConfig.label}</span>}
    </button>
  ) : null;

  const filterTrigger = showFilterTrigger ? (
    <FilterControl
      cn={cn}
      tokens={tokens}
      datasources={datasources}
      bucketsByDs={bucketsByDs}
      filterConfig={filterConfig}
      activeFilter={activeFilter}
      onApply={applyActiveFilter}
    />
  ) : null;

  // Place each control on whichever side its `position` requested. Header
  // is two slots: left-aligned group on the left, right-aligned group on
  // the right, with a flex spacer between them.
  const leftControls = (
    <>
      {refreshConfig.position === 'left' && refreshButton}
      {filterConfig.position === 'left' && filterTrigger}
    </>
  );
  const rightControls = (
    <>
      {refreshConfig.position === 'right' && refreshButton}
      {filterConfig.position === 'right' && filterTrigger}
    </>
  );

  return (
    <div className={cn('root', tokens.text)} data-activity-id={id}>
      {showHeader && (
        <div className={cn('header', tokens.headerPad, 'justify-between')}>
          <div className="flex-sc gap-2">{leftControls}</div>
          <div className="flex-sc gap-2">{rightControls}</div>
        </div>
      )}

      {errorEntries.length > 0 && (
        <div className={cn('list')}>
          {errorEntries.map(([name, err]) => (
            <div key={`err-${name}`} className={cn('error')}>
              <strong>{name}</strong>: {err.message || 'Unknown error'}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className={cn('loading')}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className={cn('empty')}>No activity to show.</div>
      ) : (
        <div className={cn('list')}>
          {pageRows.map((r, i) => (
            <ActivityRow
              key={`${r.ds.name}-${r.id || i}`}
              resolved={r}
              cn={cn}
              tokens={tokens}
              anyIcon={anyIcon}
              anyDot={anyDot}
              renderConfig={renderConfig}
              widgetId={id}
            />
          ))}
          {paginationConfig.style === 'infiniteScroll' && totalPages > 1 && (
            <InfiniteScrollSentinel
              cn={cn}
              hasMore={hasMore}
              onLoadMore={loadMore}
              loadingText={paginationConfig.scrollLoadingText}
              endText={paginationConfig.scrollEndText}
            />
          )}
        </div>
      )}

      {!loading &&
        rows.length > 0 &&
        totalPages > 1 &&
        paginationConfig.style === 'forwardBackward' && (
          <PaginationForwardBackward
            cn={cn}
            tokens={tokens}
            page={safePage}
            totalPages={totalPages}
            textMode={paginationConfig.text}
            rowCount={rows.length}
            recordsPerPage={paginationConfig.recordsPerPage}
            onPrev={() => setPageNumber(p => Math.max(1, p - 1))}
            onNext={() => setPageNumber(p => Math.min(totalPages, p + 1))}
          />
        )}
      {!loading &&
        rows.length > 0 &&
        totalPages > 1 &&
        paginationConfig.style === 'pageNumbers' && (
          <PaginationPageNumbers
            cn={cn}
            tokens={tokens}
            page={safePage}
            totalPages={totalPages}
            textMode={paginationConfig.text}
            rowCount={rows.length}
            recordsPerPage={paginationConfig.recordsPerPage}
            pageNumbersWindow={paginationConfig.pageNumbersWindow}
            onPrev={() => setPageNumber(p => Math.max(1, p - 1))}
            onNext={() => setPageNumber(p => Math.min(totalPages, p + 1))}
            onPick={n => setPageNumber(n)}
          />
        )}
    </div>
  );
};

// Renders a single content item inside a render-row position. Three
// tokens get special treatment so the visual conventions (icon-in-box,
// status-with-dot, alignment spacer) survive across custom renders:
//   - {{datasource.icon}}        → <Icon> inside an iconBox. Falls back
//     to an invisible spacer when this row has no icon but any other
//     datasource does, so the icon column stays aligned.
//   - {{datasource.iconSpacer}}  → invisible icon-sized box; explicit
//     spacer for designers stacking content on a second line.
//   - {{datasource.status}}      → status text + optional colored dot.
//     The dot renders when this row's matched template entry (or the
//     datasource-level `status.dot`) named a color. When some other
//     datasource has a dot but this row doesn't, an invisible dot
//     reserves the column so the layout stays aligned.
// Anything else interpolates normally and renders as a <span> of text.
const RenderItem = ({ item, ctx, cn, tokens, anyIcon, anyDot }) => {
  const t = item.trim();
  if (t === ICON_TOKEN) {
    const iconName = ctx.resolved.icon;
    if (iconName) {
      return (
        <div className={cn('iconBox', tokens.iconBox)}>
          <Icon name={iconName} size={Math.round(tokens.iconPx * 0.9)} />
        </div>
      );
    }
    if (anyIcon) {
      return (
        <div
          className={cn('iconBox', tokens.iconBox, 'invisible')}
          aria-hidden="true"
        />
      );
    }
    return null;
  }
  if (t === ICON_SPACER_TOKEN) {
    return (
      <div
        className={cn('iconBox', tokens.iconBox, 'invisible')}
        aria-hidden="true"
      />
    );
  }
  if (t === STATUS_TOKEN) {
    const status = ctx.resolved.status;
    if (!status) return null;
    const dotName = ctx.resolved.statusDotName;
    const dotColorClass = dotName ? DOT_COLORS[dotName] : null;
    return (
      <>
        <span className={cn('statusText')}>{status}</span>
        {anyDot && (
          <span
            className={cn(
              'statusDot',
              tokens.statusDot,
              dotColorClass || 'invisible',
            )}
            aria-hidden="true"
          />
        )}
      </>
    );
  }
  // The description slot gets a `truncate` styling treatment when the
  // item is the bare description token — long descriptions ellipsize
  // rather than wrap. Other text spans render plain.
  if (t === '{{datasource.description}}') {
    return <span className={cn('description')}>{ctx.resolved.description}</span>;
  }
  return <span>{interpolate(item, ctx)}</span>;
};

// One line inside an activity row. `entry` is the config.render[i] object;
// only positions the designer specified render — an absent left/center/right
// produces no element for that column.
const RenderRowEl = ({ entry, ctx, cn, tokens, anyIcon, anyDot }) => (
  <div className={cn('renderRow', tokens.rowPad, tokens.rowGap, entry.className)}>
    {entry.left && (
      <div className={cn('positionLeft', tokens.rowGap, entry.leftClassName)}>
        {entry.left.map((item, i) => (
          <RenderItem
            key={`l-${i}`}
            item={item}
            ctx={ctx}
            cn={cn}
            tokens={tokens}
            anyIcon={anyIcon}
            anyDot={anyDot}
          />
        ))}
      </div>
    )}
    {entry.center && (
      <div className={cn('positionCenter', tokens.rowGap, entry.centerClassName)}>
        {entry.center.map((item, i) => (
          <RenderItem
            key={`c-${i}`}
            item={item}
            ctx={ctx}
            cn={cn}
            tokens={tokens}
            anyIcon={anyIcon}
            anyDot={anyDot}
          />
        ))}
      </div>
    )}
    {entry.right && (
      <div className={cn('positionRight', tokens.rowGap, entry.rightClassName)}>
        {entry.right.map((item, i) => (
          <RenderItem
            key={`r-${i}`}
            item={item}
            ctx={ctx}
            cn={cn}
            tokens={tokens}
            anyIcon={anyIcon}
            anyDot={anyDot}
          />
        ))}
      </div>
    )}
  </div>
);

// One activity row. Renders N render-rows (one per `config.render` entry,
// or the single DEFAULT_RENDER entry when no render config is provided).
// `anyIcon` / `anyDot` control whether to reserve the icon / status-dot
// column even when this particular row's templates resolved to empty —
// so mixed configurations still align vertically.
const ActivityRow = ({
  resolved,
  cn,
  tokens,
  anyIcon,
  anyDot,
  renderConfig,
  widgetId,
}) => {
  const { ds, row, icon, description, status, statusDotName } = resolved;
  // Context for interpolating render templates AND clickAction values
  // (so `path: '/requests/{{row.id}}'` works). Row data + the per-row
  // resolved bag (icon name, description text, status text + dot color
  // name, datasource name/label). `iconSpacer` is exposed as '' so an
  // explicit `{{datasource.iconSpacer}}` token still resolves cleanly to
  // nothing if the designer uses it as plain text rather than as a
  // standalone render item.
  const ctx = {
    row,
    resolved: {
      name: ds.name,
      label: ds.label || ds.name,
      icon,
      description,
      status,
      statusDotName,
      iconSpacer: '',
    },
  };

  const isInteractive = !!ds.clickAction && ds.clickAction.type !== 'none';
  const rowClass = isInteractive
    ? clsx(cn('row'), cn('rowInteractive'))
    : cn('row');

  const innerContent = (
    <>
      {renderConfig.map((entry, i) => (
        <RenderRowEl
          key={`r-${i}`}
          entry={entry}
          ctx={ctx}
          cn={cn}
          tokens={tokens}
          anyIcon={anyIcon}
          anyDot={anyDot}
        />
      ))}
      <span hidden data-source={ds.name} data-id={resolved.id} />
    </>
  );

  if (isInteractive) {
    const interpolatedClickAction = interpolateDeep(ds.clickAction, ctx);
    // For `type: 'event'`, always carry the row's identifying fields in
    // the dispatched `event.detail.data` so handlers can route off them
    // without the designer having to template the basics in by hand.
    // Designer-supplied `data` keys (already interpolated by the deep
    // walk above) win over the auto-defaults — a designer who explicitly
    // writes `data: { id: '{{values.Foo}}' }` gets *their* id key.
    if (interpolatedClickAction.type === 'event') {
      interpolatedClickAction.data = {
        datasource: ds.name,
        id: resolved.id,
        ...(interpolatedClickAction.data || {}),
      };
    }
    const interpolatedTarget = ds.target
      ? interpolateDeep(ds.target, ctx)
      : undefined;
    const ariaLabel = ds.clickActionLabel
      ? interpolate(ds.clickActionLabel, ctx)
      : undefined;
    return (
      <ClickActionWrapper
        clickAction={interpolatedClickAction}
        target={interpolatedTarget}
        label={ariaLabel}
        widgetName="Activity"
        instanceId={widgetId}
        className={rowClass}
      >
        {innerContent}
      </ClickActionWrapper>
    );
  }

  return <div className={rowClass}>{innerContent}</div>;
};

// Trigger button + popover dialog. Staged-draft UX: the dialog has its
// own local copy of the filter state, and changes only commit on
// "Show Results". Cancel / outside-click discards the draft. When
// `userSettable` is false, this component renders nothing — the
// hardwired filter still applies via `activeFilter`, just without UI.
const FilterControl = ({
  cn,
  tokens,
  datasources,
  bucketsByDs,
  filterConfig,
  activeFilter,
  onApply,
}) => {
  const popover = usePopover();
  const [draft, setDraft] = useState(activeFilter);

  // When the popover opens, seed the local draft from the current applied
  // filter so the user always sees the live state on entry. Discarding
  // (close without Show Results) leaves activeFilter untouched.
  const wasOpenRef = useRef(false);
  if (popover.open && !wasOpenRef.current) {
    wasOpenRef.current = true;
    setDraft(cloneFilterState(activeFilter));
  } else if (!popover.open && wasOpenRef.current) {
    wasOpenRef.current = false;
  }

  const triggerLabel = useMemo(
    () => buildFilterTriggerLabel(activeFilter, datasources, bucketsByDs, filterConfig.allLabel),
    [activeFilter, datasources, bucketsByDs, filterConfig.allLabel],
  );

  const toggleDatasource = name => {
    setDraft(prev => {
      const next = cloneFilterState(prev);
      if (next.datasources.has(name)) next.datasources.delete(name);
      else next.datasources.add(name);
      return next;
    });
  };

  const toggleStatus = (dsName, bucketKey) => {
    setDraft(prev => {
      const next = cloneFilterState(prev);
      const set = next.statuses[dsName] || new Set();
      if (set.has(bucketKey)) set.delete(bucketKey);
      else set.add(bucketKey);
      next.statuses[dsName] = set;
      return next;
    });
  };

  const toggleShowUnmatched = dsName => {
    setDraft(prev => {
      const next = cloneFilterState(prev);
      next.showUnmatched[dsName] = next.showUnmatched[dsName] === false;
      return next;
    });
  };

  const handleClear = () => setDraft(buildFilterState({}, datasources));
  const handleApply = () => {
    onApply(cloneFilterState(draft));
    popover.setOpen(false);
  };

  const showDatasources =
    (filterConfig.options === 'full' || filterConfig.options === 'datasource') &&
    datasources.length > 1;
  const showStatuses =
    filterConfig.options === 'full' || filterConfig.options === 'status';
  // Datasources that actually have buckets to show. With one source, we
  // skip the per-source heading (matches the screenshot UX).
  const statusSources = showStatuses
    ? datasources.filter(ds => bucketsByDs[ds.name].length > 0)
    : [];

  return (
    <Popover.RootProvider value={popover} autoFocus={false}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn('filterTrigger')}
          aria-label={`Filter — currently ${triggerLabel}`}
        >
          <span className={cn('filterTriggerLabel')}>{triggerLabel}</span>
          <Icon name="chevron-down" size={tokens.iconPx - 4} />
        </button>
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content className={cn('filterDialog')}>
          <div className={cn('filterDialogHeader')}>
            <span className={cn('filterDialogTitle')}>Filter</span>
            <button
              type="button"
              className={cn('filterDialogClose')}
              onClick={() => popover.setOpen(false)}
              aria-label="Close filter dialog"
            >
              <Icon name="x" size={tokens.iconPx - 4} />
            </button>
          </div>

          {showDatasources && (
            <div className={cn('filterGroup')}>
              <span className={cn('filterGroupTitle')}>Sources</span>
              <div className={cn('filterButtonRow')}>
                {datasources.map(ds => {
                  const isActive = draft.datasources.has(ds.name);
                  return (
                    <button
                      key={ds.name}
                      type="button"
                      className={cn(
                        'filterButton',
                        isActive && cn('filterButtonActive'),
                      )}
                      aria-pressed={isActive}
                      onClick={() => toggleDatasource(ds.name)}
                    >
                      <span>{ds.label || ds.name}</span>
                      {isActive && <Icon name="check" size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {statusSources.map(ds => {
            const showsUnmatchedToggle =
              filterConfig.sourceMismatch === 'userChoice';
            const unmatchedOn = draft.showUnmatched[ds.name] !== false;
            return (
              <div key={ds.name} className={cn('filterGroup')}>
                <span className={cn('filterGroupTitle')}>
                  {datasources.length > 1 ? `${ds.label || ds.name} status` : 'Status'}
                </span>
                <div className={cn('filterButtonRow')}>
                  {bucketsByDs[ds.name].map(b => {
                    const isActive = (draft.statuses[ds.name] || new Set()).has(b.key);
                    const dotClass = b.dot ? DOT_COLORS[b.dot] : null;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={cn(
                          'filterButton',
                          isActive && cn('filterButtonActive'),
                        )}
                        aria-pressed={isActive}
                        onClick={() => toggleStatus(ds.name, b.key)}
                      >
                        <span>{b.label}</span>
                        {dotClass && (
                          <span
                            className={cn('filterDot', dotClass)}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                  {showsUnmatchedToggle && (
                    <button
                      type="button"
                      className={cn(
                        'filterButton',
                        unmatchedOn && cn('filterButtonActive'),
                      )}
                      aria-pressed={unmatchedOn}
                      onClick={() => toggleShowUnmatched(ds.name)}
                      title="Include rows whose status doesn't match any defined bucket"
                    >
                      <span>Show unmatched</span>
                      {unmatchedOn && <Icon name="check" size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className={cn('filterFooter')}>
            <button
              type="button"
              className={cn('filterClearButton')}
              onClick={handleClear}
            >
              Clear filters
            </button>
            <button
              type="button"
              className={cn('filterApplyButton')}
              onClick={handleApply}
            >
              Show Results
            </button>
          </div>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.RootProvider>
  );
};

const cloneFilterState = state => ({
  datasources: new Set(state.datasources),
  statuses: Object.fromEntries(
    Object.entries(state.statuses).map(([k, v]) => [k, new Set(v)]),
  ),
  showUnmatched: { ...state.showUnmatched },
});

// Builds the trigger button's label from the currently active filter.
// Empty filter → designer's `allLabel`. Otherwise: comma-joined list of
// selected bucket labels and source labels, truncated to a sensible
// width with an "+N" overflow indicator.
const MAX_LABELS = 3;
const buildFilterTriggerLabel = (filter, datasources, bucketsByDs, allLabel) => {
  if (isFilterEmpty(filter)) return allLabel;
  const parts = [];
  if (filter.datasources.size > 0) {
    for (const ds of datasources) {
      if (filter.datasources.has(ds.name)) parts.push(ds.label || ds.name);
    }
  }
  for (const ds of datasources) {
    const set = filter.statuses[ds.name];
    if (!set || set.size === 0) continue;
    const buckets = bucketsByDs[ds.name] || [];
    for (const b of buckets) if (set.has(b.key)) parts.push(b.label);
  }
  if (parts.length === 0) return allLabel;
  if (parts.length <= MAX_LABELS) return parts.join(', ');
  return `${parts.slice(0, MAX_LABELS).join(', ')}, +${parts.length - MAX_LABELS}`;
};

// Builds a windowed array of page tokens for the `pageNumbers` style.
// Includes the first page, the last page, ±`around` pages around the
// current page, and `'…'` markers between non-adjacent ranges. With ≤ 7
// pages there's no windowing — just every page in sequence.
const buildPageNumberWindow = (current, total, around = 1) => {
  if (total <= 7) {
    const out = [];
    for (let i = 1; i <= total; i++) out.push(i);
    return out;
  }
  const out = [1];
  const lo = Math.max(2, current - around);
  const hi = Math.min(total - 1, current + around);
  if (lo > 2) out.push('ellipsis-left');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push('ellipsis-right');
  out.push(total);
  return out;
};

// Builds the in-bar pagination text per `pagination.text` mode. Returns
// '' for 'none'. Record indexes are clamped to the total row count so the
// last (possibly partial) page reads e.g. "Records 51 to 57" rather than
// "Records 51 to 75".
const buildPaginationText = (mode, page, totalPages, rowCount, recordsPerPage) => {
  const start = rowCount === 0 ? 0 : (page - 1) * recordsPerPage + 1;
  const end = Math.min(rowCount, page * recordsPerPage);
  switch (mode) {
    case 'pageOfTotal':
      return `Page ${page} of ${totalPages}`;
    case 'recordRange':
      return `Records ${start} to ${end}`;
    case 'recordRangeWithTotal':
      return `Records ${start} to ${end} of ${rowCount}`;
    case 'both':
      return `Page ${page} of ${totalPages} · Records ${start} to ${end}`;
    case 'none':
    default:
      return '';
  }
};

// IntersectionObserver-based "load more" hook. The returned ref attaches
// to a sentinel element at the bottom of the rendered list; when that
// sentinel enters the viewport (with a small `rootMargin` to fire early),
// `onLoadMore` runs. The observer disconnects on unmount and reconnects
// whenever `canLoadMore` flips back to true after the user filtered or
// refreshed back to a smaller list.
const useInfiniteScrollTrigger = (canLoadMore, onLoadMore) => {
  const ref = useRef(null);
  useEffect(() => {
    const target = ref.current;
    if (!target || !canLoadMore) return undefined;
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) if (e.isIntersecting) onLoadMore();
      },
      { rootMargin: '100px' },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [canLoadMore, onLoadMore]);
  return ref;
};

// forwardBackward style — prev arrow, in-bar text, next arrow.
const PaginationForwardBackward = ({
  cn,
  tokens,
  page,
  totalPages,
  textMode,
  rowCount,
  recordsPerPage,
  onPrev,
  onNext,
}) => {
  const text = buildPaginationText(textMode, page, totalPages, rowCount, recordsPerPage);
  return (
    <div className={cn('pagination')}>
      <button
        type="button"
        className={cn('prevButton')}
        onClick={onPrev}
        disabled={page <= 1}
        aria-label="Previous Page"
      >
        <Icon name="chevrons-left" size={tokens.iconPx} />
      </button>
      {text && <span className={cn('paginationText')}>{text}</span>}
      <button
        type="button"
        className={cn('nextButton')}
        onClick={onNext}
        disabled={page >= totalPages}
        aria-label="Next Page"
      >
        <Icon name="chevrons-right" size={tokens.iconPx} />
      </button>
    </div>
  );
};

// pageNumbers style — windowed page-number buttons with `…` separators.
// In-bar text (when configured) renders flush-right next to the numbers.
const PaginationPageNumbers = ({
  cn,
  tokens,
  page,
  totalPages,
  textMode,
  rowCount,
  recordsPerPage,
  pageNumbersWindow,
  onPrev,
  onNext,
  onPick,
}) => {
  const tokenList = buildPageNumberWindow(page, totalPages, pageNumbersWindow);
  const text = buildPaginationText(textMode, page, totalPages, rowCount, recordsPerPage);
  // prev / numbers / next are the primary navigation in this style and
  // ride together as one cluster. Text (when present) is auxiliary and
  // sits flush right alongside the cluster; otherwise the cluster
  // centers in the bar.
  const nav = (
    <div className="flex-cc gap-1">
      <button
        type="button"
        className={cn('prevButton')}
        onClick={onPrev}
        disabled={page <= 1}
        aria-label="Previous Page"
      >
        <Icon name="chevrons-left" size={tokens.iconPx} />
      </button>
      {tokenList.map((tok, i) =>
        typeof tok === 'number' ? (
          <button
            key={`p-${tok}`}
            type="button"
            className={cn('pageNumber', tok === page && cn('pageNumberActive'))}
            aria-current={tok === page ? 'page' : undefined}
            aria-label={`Page ${tok}`}
            onClick={() => onPick(tok)}
          >
            {tok}
          </button>
        ) : (
          <span key={`e-${i}`} className={cn('pageNumberEllipsis')} aria-hidden="true">
            …
          </span>
        ),
      )}
      <button
        type="button"
        className={cn('nextButton')}
        onClick={onNext}
        disabled={page >= totalPages}
        aria-label="Next Page"
      >
        <Icon name="chevrons-right" size={tokens.iconPx} />
      </button>
    </div>
  );
  return text ? (
    <div className={cn('pagination', 'justify-between')}>
      {nav}
      <span className={cn('paginationText')}>{text}</span>
    </div>
  ) : (
    <div className={cn('pagination')}>{nav}</div>
  );
};

// infiniteScroll style — no buttons, just a sentinel at the bottom of the
// list that triggers the next batch when scrolled into view. Renders
// "scroll for more" or "no more records" indicator text based on state.
const InfiniteScrollSentinel = ({
  cn,
  hasMore,
  onLoadMore,
  loadingText,
  endText,
}) => {
  const ref = useInfiniteScrollTrigger(hasMore, onLoadMore);
  return (
    <div className={cn('infiniteScrollSentinel')} ref={ref}>
      <span className={cn('infiniteScrollText')}>
        {hasMore ? loadingText : endText}
      </span>
    </div>
  );
};

const ActivityComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <ActivityContent id={id} config={config} />
      </WidgetAPI>
    </Provider>
  );
});

/**
 * Initializes an Activity widget instance — a row-oriented renderer for
 * form-submission-style activity feeds. Combines one or more datasources
 * (static JSON, Kinetic submission search, or a Kinetic integration),
 * sorts the merged result by a per-source `sortField`, and renders rows
 * with an icon, description, and status indicator.
 *
 * Phase 1 + 2 surface — covered here:
 *   - 3 datasource types: 'static', 'kinetic-submissions', 'integration'
 *   - Default row render (icon left, description left, status right)
 *   - Custom `render` config — array of multi-position render-rows
 *     stacked inside each activity row, with per-row / per-position
 *     `className` overrides via sibling keys (`leftClassName`, etc.).
 *   - Template tokens: `{{row.path}}` / `{{path}}` (row data),
 *     `{{datasource.k}}` (resolved icon / description / status / name /
 *     label / iconSpacer), `{{format:FMT:path}}` (last-colon split;
 *     `RelativeTime` via date-fns, otherwise moment format).
 *   - Status template: plain string OR match-object array
 *   - Forward/back pagination with configurable page size
 *   - Refresh button (label/icon/position configurable)
 *   - Sizing: 'sm' | 'md' | 'lg' | 'xl'
 *   - classNames slot system (per Profile widget's pattern)
 *
 * Coming in later phases (not in this version):
 *   - Filter dialog with status / datasource / sourceMismatch options.
 *   - Page-numbers and infinite-scroll pagination styles.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.Activity({
 *     container: K('content[Activity]').element(),
 *     config: {
 *       datasources: [
 *         {
 *           name: 'requests',
 *           label: 'My Requests',
 *           type: 'kinetic-submissions',
 *           kapp: 'services',
 *           search: {
 *             q: 'submittedBy = "username"',
 *             include: 'details,values,form',
 *             limit: 100,
 *           },
 *           sortField: 'createdAt',
 *           idField: 'id',
 *           icon: 'shopping-cart',
 *           description: 'Request for {{values.Requested For}}: {{form.name}}',
 *           status: {
 *             template: [
 *               { when: { coreState: 'Submitted' }, render: 'Open ({{values.Status}})' },
 *               { when: { coreState: 'Draft' },     render: 'Draft' },
 *               { when: { coreState: 'Closed' },    render: 'Closed' },
 *               { render: '{{coreState}}' },
 *             ],
 *             filterField: 'coreState',
 *           },
 *         },
 *       ],
 *     },
 *     id: 'activity',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} config See above.
 * @param {string} [id] Optional id used by registerWidget for instance tracking.
 */
export const Activity = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Activity');
  if (resolved && validateConfig(config)) {
    return registerWidget(Activity, {
      container: resolved,
      Component: ActivityComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The Activity widget parameters are invalid. See the console for more details.',
  );
};
