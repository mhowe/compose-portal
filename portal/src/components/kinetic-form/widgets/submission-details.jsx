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
import { HoverCard } from '@ark-ui/react/hover-card';
import { Popover, usePopover } from '@ark-ui/react/popover';
import { fetchSubmission } from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { Icon } from '../../../atoms/Icon.jsx';
import {
  ClickActionWrapper,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';

const SIZES = ['sm', 'md', 'lg', 'xl'];
const REFRESH_POSITIONS = ['left', 'right'];
// `progressBar` is the standard horizontal dot-and-connector strip. The
// `thermometer` variant is validated so designers can opt in early, but
// for v1 it renders identically to `progressBar`; the bar-fill visual
// is a follow-up.
const MILESTONE_TYPES = ['progressBar', 'thermometer'];
// `horizontal` is the only orientation we've ever shipped — kept here
// (rather than as a single literal) so future vertical / stacked
// variants slot in without changing the public surface.
const MILESTONE_POSITIONS = ['horizontal'];
// The activity type that drives the milestone strip. Matched case-
// insensitively against `activity.type`.
const MILESTONE_ACTIVITY_TYPE = 'milestone';

// Milestone label placement, relative to the visual element (dot row in
// progressBar, bar in thermometer). Applies to both visualizations so
// designers can flip orientation independent of which type they pick.
const LABEL_POSITIONS = ['above', 'below'];
// Thermometer gradient defaults. Theme-driven so a `success` brand
// color swap automatically retints the bar.
const DEFAULT_GRADIENT_START = 'warning';
const DEFAULT_GRADIENT_END = 'success';
// Tailwind `from-*` / `to-*` gradient classes. Listed as literals so
// the compile-time content scan picks them up — generated class names
// like `from-${color}` silently fail to compile. The keys mirror
// DOT_COLORS so any DaisyUI palette color works as a gradient endpoint.
const GRADIENT_FROM = {
  success: 'from-success',
  warning: 'from-warning',
  error: 'from-error',
  info: 'from-info',
  primary: 'from-primary',
  secondary: 'from-secondary',
  accent: 'from-accent',
  neutral: 'from-neutral',
  'base-100': 'from-base-100',
  'base-200': 'from-base-200',
  'base-300': 'from-base-300',
  'base-content': 'from-base-content',
};
const GRADIENT_TO = {
  success: 'to-success',
  warning: 'to-warning',
  error: 'to-error',
  info: 'to-info',
  primary: 'to-primary',
  secondary: 'to-secondary',
  accent: 'to-accent',
  neutral: 'to-neutral',
  'base-100': 'to-base-100',
  'base-200': 'to-base-200',
  'base-300': 'to-base-300',
  'base-content': 'to-base-content',
};

// Action display modes — same vocabulary BundleLink + BundleMenu use,
// just promoted to an explicit enum so designers can read the intent
// off the config. Inferred from `action.icon` + `action.label` when
// omitted (see `resolveActionDisplay`).
const ACTION_DISPLAY_MODES = ['text', 'icon', 'icon-text', 'text-icon'];
// Action group types. `inline` lays the actions out side-by-side as
// standalone buttons. `dropdown` collapses the actions behind a single
// trigger button that opens an Ark Popover; useful for overflow
// menus.
const ACTION_GROUP_TYPES = ['inline', 'dropdown'];

// Optional corner placement for an action group. When set, the group
// floats absolutely over the widget root (which carries `relative`
// positioning). Multiple groups in the same corner stack horizontally,
// with the first group in the array closest to the corner — right-side
// corners use `flex-row-reverse` to make "first" mean "rightmost".
// Unset / unknown position values keep the group in the in-flow
// bottom-row layout.
const ACTION_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
// Tailwind classes per corner — listed as literals so the source scan
// picks them up. `flex-row-reverse` on the right corners is what makes
// array order read as "closest-to-corner first" regardless of side.
const ACTION_CORNER_CLASSES = {
  'top-left': 'absolute top-2 left-2',
  'top-right': 'absolute top-2 right-2 flex-row-reverse',
  'bottom-left': 'absolute bottom-2 left-2',
  'bottom-right': 'absolute bottom-2 right-2 flex-row-reverse',
};

// Curated map of dot color names → Tailwind bg classes — same palette
// the Activity widget uses for status dots, copied verbatim so the two
// widgets share a vocabulary and Tailwind's compile-time scan
// picks up the literal class strings. The keys are what designers
// write in `statusColors`; the values are what we hand `cn()`.
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
const DEFAULT_MILESTONE_COLOR = 'base-300';
// Single fallback color used when the designer didn't supply a
// `statusColors` mapping at all (legacy "all dots one color" mode).
// Picked to match the look the widget shipped with before status-
// driven coloring was introduced so a config that doesn't opt in
// keeps rendering exactly the same way.
const DEFAULT_FLAT_MILESTONE_COLOR = 'success';

// Per-size knobs mirror the Activity widget so the two compose cleanly when
// dropped on the same page. Anything that scales visually (icon size, row
// padding, row gap, font size) reads from this map.
const SIZE_TOKENS = {
  sm: { iconPx: 18, text: 'text-sm', rowPad: 'py-2 px-4', rowGap: 'gap-3', headerPad: 'py-1' },
  md: { iconPx: 22, text: 'text-base', rowPad: 'py-3 px-5', rowGap: 'gap-4', headerPad: 'py-2' },
  lg: { iconPx: 26, text: 'text-lg', rowPad: 'py-4 px-6', rowGap: 'gap-5', headerPad: 'py-3' },
  xl: { iconPx: 30, text: 'text-xl', rowPad: 'py-5 px-7', rowGap: 'gap-6', headerPad: 'py-4' },
};

// Default include set for the Kinetic submission fetch. Picked to give a
// reasonable surface for every section the widget renders without the
// designer having to know what each section needs internally — meta can
// read `form.name`, milestones / activities can iterate
// `submissionActivities`, and form attributes are available for icon /
// label resolution. `config.include` (string or array) appends to this
// list and de-duplicates.
// The Core API include for the submission's activity list is `activities`
// (not `submissionActivities`, which is what the prompt sketched). Confirmed
// against the existing RequestDetail page in this repo and against the
// Core API behind `@kineticdata/react`'s `fetchSubmission`.
const DEFAULT_INCLUDE = [
  'details',
  'values',
  'form',
  'form.attributesMap',
  'form.kapp',
  'activities',
  'activities.details',
];

// Slot defaults. Same `SLOT_DEFAULTS` + `cn()` shape used by Profile and
// Activity — designers override per slot with either a string (additive)
// or `{ add?, remove? }` (surgical). Each section (meta / activities /
// future milestones / future actions) owns its own family of slots so
// designers can style them independently — there is no shared "row" slot.
const SLOT_DEFAULTS = {
  // `relative` is required so action groups that opt into a corner
  // placement (`position: 'top-right'`, etc.) anchor to the widget's
  // overall bounding box. Designers shouldn't remove this unless they
  // know they're losing the corner-positioning affordance for actions.
  root: 'relative flex-c-st gap-3 w-full',
  header: 'flex-sc gap-2',
  // ---- meta section ----
  meta: 'flex-c-st gap-1 border rounded-box bg-base-100',
  metaRow: 'flex-sc',
  metaPositionLeft: 'flex-sc min-w-0 flex-1',
  metaPositionCenter: 'flex-cc min-w-0 flex-1',
  metaPositionRight: 'flex-ec min-w-0 flex-1',
  // ---- activities section ----
  activitiesSection: 'flex-c-st gap-3',
  activitiesTitle: 'font-semibold',
  activitiesList: 'flex-c-st gap-3',
  activity: 'flex-c-st gap-1 border rounded-box bg-base-100',
  activityRow: 'flex-sc',
  activityPositionLeft: 'flex-sc min-w-0 flex-1',
  activityPositionCenter: 'flex-cc min-w-0 flex-1',
  activityPositionRight: 'flex-ec min-w-0 flex-1',
  activitiesEmpty:
    'border rounded-box bg-base-100 py-6 px-6 text-center text-base-content/60',
  // ---- milestones section ----
  // The strip is a single flex row. Each step takes `flex-1` so multiple
  // milestones distribute evenly across the available width. The
  // dot+connector row inside each step uses `items-center` so the
  // connector segments visually pass through the dot's centerline
  // regardless of dot size.
  milestonesSection: 'flex-c-st gap-2',
  milestonesTitle: 'font-semibold',
  milestones: 'flex-sc items-stretch w-full',
  milestoneStep: 'flex-c-cc flex-1 min-w-0 gap-1',
  milestoneLabel: 'text-xs text-center text-base-content/70 truncate w-full',
  milestoneDotRow: 'flex-sc items-center w-full',
  // No bg-* in the slot default — the render code layers the per-step
  // color class on top from `statusColors` (or falls back to a single
  // flat color when no mapping was supplied). Designers overriding via
  // `classNames.milestoneDot` should keep this in mind: adding a
  // bg-* utility in the override will fight the per-step color.
  milestoneDot: 'h-3 w-3 rounded-full flex-none',
  milestoneConnector: 'h-0.5 flex-1',
  milestonesEmpty:
    'border rounded-box bg-base-100 py-4 px-6 text-center text-base-content/60',
  // Labels row — used by thermometer (a standalone row of segment
  // labels above or below the bar) and by progressBar when
  // `labelPosition: 'below'` (a separate row instead of inline-with-
  // the-step labels). Each child takes `flex-1` so labels align with
  // their segment / dot.
  milestonesLabelsRow: 'flex w-full',
  // Thermometer: a single horizontal pill containing a theme-driven
  // gradient layer behind a gray overlay that covers the unreached
  // portion. Segment dividers are vertical hairlines pinned at each
  // segment boundary. `rounded-full` + `overflow-hidden` clip the
  // gradient and overlay to the pill shape; `bg-base-300` is the
  // "no progress" background visible behind the overlay's gray.
  thermometer:
    'relative h-3 rounded-full overflow-hidden w-full bg-base-300',
  // The gradient layer fills the entire pill. The render code adds
  // the actual gradient endpoints (`from-warning`, `to-success`, etc.)
  // from the config — the slot default just establishes positioning.
  thermometerFill: 'absolute inset-0',
  // Sits on top of the gradient on the right side, covering the
  // unreached segments with the `defaultColor` (or its fallback). The
  // render code applies the color class + width inline.
  thermometerUnreached: 'absolute inset-y-0 right-0',
  // Vertical hairlines drawn at each segment boundary. Color is a
  // low-opacity base-content tone so the dividers read on both the
  // gradient side and the gray side of the overlay.
  thermometerDivider: 'absolute inset-y-0 w-px bg-base-content/20',
  // Hover popover for richer per-milestone detail. The Z value matches
  // the filter dialog in the Activity widget so the popover sits above
  // surrounding chrome without fighting other portals.
  milestonePopover:
    'flex-c-st gap-1 bg-base-100 border border-base-300 rounded-box shadow-lg p-4 min-w-48 max-w-80 z-30 outline-0',
  milestonePopoverRow: 'flex-sc',
  milestonePopoverPositionLeft: 'flex-sc min-w-0 flex-1',
  milestonePopoverPositionCenter: 'flex-cc min-w-0 flex-1',
  milestonePopoverPositionRight: 'flex-ec min-w-0 flex-1',
  // ---- actions section ----
  // Container is a flex row of groups — `flex-wrap` so action rows
  // collapse cleanly on narrow widths instead of overflowing
  // horizontally. Action buttons inside avoid `kbtn-circle` for the
  // press-state translate-suppression reason documented in
  // [[feedback-kbtn-circle-active-translate]].
  actionsSection: 'flex-sc gap-2 flex-wrap',
  actionsGroup: 'flex-sc gap-1',
  // Wrapper for an absolutely-positioned corner of action groups.
  // `z-10` floats above the section content but stays below dropdown /
  // hover-card popovers (which use `z-30`).
  actionsCorner: 'flex items-center gap-1 z-10',
  actionButton:
    'inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default',
  actionButtonIcon:
    'inline-flex items-center justify-center rounded-full p-2 cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default',
  actionsDropdownContent:
    'flex-c-st gap-0.5 bg-base-100 border border-base-300 rounded-box shadow-lg p-1 min-w-48 z-30 outline-0',
  actionsDropdownItem:
    'flex-sc gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-base-200 text-left w-full text-base-content no-underline',
  // ---- shared key/value content item (used by any render array) ----
  // `flex-1` makes a row of KV cells distribute evenly; `min-w-0` lets
  // long values truncate inside their cell instead of forcing the row
  // to overflow horizontally. `flex-c-st` stacks label above value.
  kv: 'flex-c-st min-w-0 flex-1 gap-0.5',
  kvLabel: 'text-sm text-base-content/60',
  kvValue: '',
  // ---- shared widget chrome ----
  refreshButton:
    'inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 cursor-pointer hover:bg-base-200 disabled:opacity-40 disabled:cursor-default',
  empty:
    'border rounded-box bg-base-100 py-6 px-6 text-center text-base-content/60',
  loading:
    'border rounded-box bg-base-100 py-6 px-6 text-center text-base-content/60',
  error:
    'border border-error/40 rounded-box bg-error/5 py-3 px-4 text-sm text-error',
};
const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);
// Each section's render-row machinery uses a 4-slot family. `RenderRow`
// builds the actual classNames by interpolating the prefix into these
// suffixes so meta and activities use independent slots while sharing
// one renderer.
const POSITION_SLOT_SUFFIXES = {
  row: 'Row',
  left: 'PositionLeft',
  center: 'PositionCenter',
  right: 'PositionRight',
};

/* ------------------------------------------------------------------ */
/* Template interpolation                                              */
/*                                                                    */
/* `{{...}}` tokens inside `render` content items, label / description */
/* templates, and any other designer-supplied string resolve against a */
/* context object:                                                    */
/*   - {{path}}        → lodash get on `ctx.row` (the submission for  */
/*     meta; the activity for Phase 2 / 3 sections).                  */
/*   - {{format:FMT:path}} → format applied to the resolved value.    */
/*     Last colon splits FMT from path so format strings can contain  */
/*     colons (`YYYY-MM-DD HH:mm:ss`). FMT === 'RelativeTime' renders */
/*     "X ago" via date-fns; any other FMT is treated as a moment     */
/*     format string. Unparseable inputs render as the empty string.  */
/*   - {{data.key}} on an activity row also tries to parse the        */
/*     activity's `data` field as JSON when it's a string — Kinetic   */
/*     stores it as JSON text. See `resolveDataPath`. Phase 2 only —  */
/*     Phase 1's meta context is the raw submission, where `data` is  */
/*     a regular nested object (`details`, `values`, etc.).           */
/* ------------------------------------------------------------------ */

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;
const FORMAT_PREFIX = 'format:';

const formatRelative = value => {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDistance(date, new Date(), { addSuffix: true });
};

const applyFormat = (fmt, value) => {
  if (fmt === 'RelativeTime') return formatRelative(value);
  if (value == null || value === '') return '';
  const m = moment(value);
  if (!m.isValid()) return '';
  return m.format(fmt);
};

const resolveToken = (token, ctx) => {
  const t = token.trim();
  if (t === '') return '';
  if (t.startsWith(FORMAT_PREFIX)) {
    const rest = t.slice(FORMAT_PREFIX.length);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return '';
    const fmt = rest.slice(0, lastColon);
    const path = rest.slice(lastColon + 1).trim();
    return applyFormat(fmt, resolvePath(path, ctx));
  }
  return resolvePath(t, ctx);
};

// Single-level case-insensitive object lookup. Workflow scripts that
// populate activity `data` often use whatever casing the author chose
// (`Status`, `status`, `STATUS`); the widget needs to find the value
// regardless. Falls back to lowercased iteration only when the exact
// key isn't present, so the common case stays a hash lookup.
const getCaseInsensitive = (obj, key) => {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const lc = String(key).toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lc) return obj[k];
  }
  return undefined;
};

// Multi-segment case-insensitive descent — used both by template
// resolution (`{{data.Status}}`) and by milestone status lookup
// (`statusField: 'Status'`). Dotted paths walk segment by segment.
const getDataPath = (obj, dotPath) => {
  if (obj == null) return undefined;
  const parts = String(dotPath).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = getCaseInsensitive(cur, part);
  }
  return cur;
};

const resolvePath = (path, ctx) => {
  if (!path) return '';
  // `submission.X` — used in later phases when the inner row is an
  // activity but the designer wants to read from the parent submission.
  // Phase 1 always passes `ctx.submission === ctx.row` so the prefix
  // is harmless on meta templates.
  if (path === 'submission' || path.startsWith('submission.')) {
    const key = path === 'submission' ? '' : path.slice('submission.'.length);
    const v = key === '' ? ctx.submission : get(ctx.submission, key);
    return v == null ? '' : String(v);
  }
  const rowPath = path.startsWith('row.') ? path.slice(4) : path;
  // Case-insensitive descent for `data.X` paths on the row. Kinetic
  // activity `data` is JSON parsed once at row build time; workflow
  // authors aren't consistent about casing so templates like
  // `{{data.Status}}` should find a stored `status` field too.
  if (
    rowPath.startsWith('data.') &&
    ctx.row?.data != null &&
    typeof ctx.row.data === 'object'
  ) {
    const v = getDataPath(ctx.row.data, rowPath.slice(5));
    return v == null ? '' : String(v);
  }
  const v = rowPath === 'row' ? ctx.row : get(ctx.row, rowPath);
  return v == null ? '' : String(v);
};

const interpolate = (template, ctx) => {
  if (typeof template !== 'string' || !template.includes('{{')) return template || '';
  return template.replace(TEMPLATE_RE, (_m, token) => resolveToken(token, ctx));
};

// Walks an arbitrary value, interpolating every string against `ctx`.
// Used to derive per-action `clickAction` / `target` objects from
// templated config — e.g. `clickAction: { type: 'internal', path:
// '/requests/{{id}}' }` becomes the resolved-path version for this
// submission. Functions (e.g. a `target.onClose` handler) and
// non-string scalars pass through unchanged. Same shape Activity's
// `interpolateDeep` uses; copied here so the file stands on its own.
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
/* submissionId resolution                                             */
/*                                                                    */
/* Three sources, in priority order:                                  */
/*   1. Explicit API setter (`api.setSubmissionId`) — wins over all.  */
/*   2. URL parameter — when config says `{ from: 'urlParam', name }`,*/
/*      read from the hash query string first (the bundle's hash      */
/*      router puts params after `?` in `#/path?id=...`), and fall    */
/*      back to the regular URL query string for when the widget      */
/*      mounts on a page reached without going through the hash       */
/*      router.                                                       */
/*   3. Literal string (`config.submissionId: 'abc'`).                */
/*                                                                    */
/* `{ from: 'api' }` is the explicit "the form bundle will provide it */
/* later" form — no resolution happens; only the API setter advances  */
/* the widget.                                                        */
/* ------------------------------------------------------------------ */

const readSubmissionIdFromUrl = name => {
  if (!name) return null;
  // The widget is rendered inside a HashRouter, so the path/query the
  // form sees lives inside `location.hash`. Try that first.
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex >= 0) {
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const v = params.get(name);
    if (typeof v === 'string' && v !== '') return v;
  }
  // Fall back to the standard query string in case the form runs on a
  // path-routed page outside the hash router.
  const params = new URLSearchParams(window.location.search);
  const v = params.get(name);
  return typeof v === 'string' && v !== '' ? v : null;
};

const resolveConfigSubmissionId = source => {
  if (typeof source === 'string' && source !== '') return source;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    if (source.from === 'urlParam') return readSubmissionIdFromUrl(source.name);
    // `from: 'api'` resolves to null on mount; the bundle script is
    // expected to call `setSubmissionId(...)` once it knows the id.
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const log = (msg, level = 'error') => {
  if (level === 'error') console.error(`SubmissionDetails Widget Error: ${msg}`);
  else console.warn(`SubmissionDetails Widget Warning: ${msg}`);
};

const RENDER_POSITIONS = ['left', 'center', 'right'];
const RENDER_CLASSNAME_KEYS = [
  'className',
  'leftClassName',
  'centerClassName',
  'rightClassName',
];

// Validates a single content item inside a position array. Strings are
// the common case (interpolated and rendered as a span). Objects with a
// `kv` key are the labels-above-values cell — `kv` is the static label,
// `value` is a template interpolated against the row context. Optional
// `className` / `labelClassName` / `valueClassName` override the cell
// slots per-instance.
const validateContentItem = (item, label) => {
  if (typeof item === 'string') return true;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    log(`${label} must be a string template or a content-item object.`);
    return false;
  }
  if (typeof item.kv !== 'string' || item.kv === '') {
    log(`${label} object items must declare a non-empty 'kv' label string.`);
    return false;
  }
  if (item.value != null && typeof item.value !== 'string') {
    log(`${label}.value must be a string template when provided.`);
    return false;
  }
  for (const k of ['className', 'labelClassName', 'valueClassName']) {
    if (item[k] != null && typeof item[k] !== 'string') {
      log(`${label}.${k} must be a string when provided.`);
      return false;
    }
  }
  return true;
};

// Validates a render array — same grammar as the Activity widget's
// `config.render`. Each entry is one stacked line; each line has up to
// three optional position arrays of content items (string templates or
// `{ kv, value }` cells), plus optional sibling `className` overrides.
const validateRender = (render, label) => {
  if (render == null) return true;
  if (!Array.isArray(render)) {
    log(`${label} must be an array of render-row objects.`);
    return false;
  }
  for (const [i, entry] of render.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      log(`${label}[${i}] must be a plain object.`);
      return false;
    }
    let hasPosition = false;
    for (const pos of RENDER_POSITIONS) {
      if (entry[pos] == null) continue;
      hasPosition = true;
      if (!Array.isArray(entry[pos])) {
        log(`${label}[${i}].${pos} must be an array of content items.`);
        return false;
      }
      for (const [j, item] of entry[pos].entries()) {
        if (!validateContentItem(item, `${label}[${i}].${pos}[${j}]`)) return false;
      }
    }
    if (!hasPosition) {
      log(
        `${label}[${i}] has no positions — at least one of ${RENDER_POSITIONS.join(', ')} is required.`,
      );
      return false;
    }
    for (const k of RENDER_CLASSNAME_KEYS) {
      if (entry[k] != null && typeof entry[k] !== 'string') {
        log(`${label}[${i}].${k} must be a string when provided.`);
        return false;
      }
    }
  }
  return true;
};

const validateSubmissionId = submissionId => {
  if (submissionId == null) return true;
  if (typeof submissionId === 'string') return true;
  if (typeof submissionId !== 'object' || Array.isArray(submissionId)) {
    log('config.submissionId must be a string, an object, or omitted.');
    return false;
  }
  const { from, name } = submissionId;
  if (from !== 'urlParam' && from !== 'api') {
    log(
      `config.submissionId.from must be 'urlParam' or 'api' (got ${JSON.stringify(from)}).`,
    );
    return false;
  }
  if (from === 'urlParam' && (typeof name !== 'string' || name === '')) {
    log(`config.submissionId.name is required (non-empty string) when from='urlParam'.`);
    return false;
  }
  return true;
};

const validateAction = (action, tag) => {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    log(`${tag} must be a plain object.`);
    return false;
  }
  if (action.label != null && typeof action.label !== 'string') {
    log(`${tag}.label must be a string template when provided.`);
    return false;
  }
  if (action.icon != null && typeof action.icon !== 'string') {
    log(`${tag}.icon must be a string (Tabler icon name) when provided.`);
    return false;
  }
  if (action.display != null && !ACTION_DISPLAY_MODES.includes(action.display)) {
    log(`${tag}.display must be one of ${ACTION_DISPLAY_MODES.join(', ')}.`);
    return false;
  }
  // `when` is the visibility predicate. Three forms:
  //   - function  — called with the loaded submission; truthy = show.
  //   - boolean   — literal toggle.
  //   - omitted   — always show.
  // String templates aren't supported here: "is X truthy" semantics get
  // muddy ("is the literal string 'false' falsy?"). Designers wanting
  // complex conditions should write a function.
  if (
    action.when != null &&
    typeof action.when !== 'function' &&
    typeof action.when !== 'boolean'
  ) {
    log(`${tag}.when must be a function (submission) => boolean, a boolean, or omitted.`);
    return false;
  }
  if (!validateClickAction(action.clickAction, `SubmissionDetails ${tag}`)) return false;
  if (!validateTarget(action.target, `SubmissionDetails ${tag}`)) return false;
  if (action.clickActionLabel != null && typeof action.clickActionLabel !== 'string') {
    log(`${tag}.clickActionLabel must be a string template when provided.`);
    return false;
  }
  return true;
};

const validateActionsContainer = container => {
  if (!Array.isArray(container)) {
    log('config.actionsContainer must be an array of action groups.');
    return false;
  }
  for (const [i, group] of container.entries()) {
    const tag = `config.actionsContainer[${i}]`;
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      log(`${tag} must be a plain object.`);
      return false;
    }
    if (group.type != null && !ACTION_GROUP_TYPES.includes(group.type)) {
      log(`${tag}.type must be one of ${ACTION_GROUP_TYPES.join(', ')}.`);
      return false;
    }
    if (group.position != null && !ACTION_CORNERS.includes(group.position)) {
      log(
        `${tag}.position must be one of ${ACTION_CORNERS.join(', ')} (or omitted to keep the group in the in-flow bottom row).`,
      );
      return false;
    }
    // Dropdown groups carry a trigger of their own — label / icon /
    // display — separate from the actions inside them. Validate those
    // when the type asks for a dropdown.
    if (group.type === 'dropdown') {
      if (group.label != null && typeof group.label !== 'string') {
        log(`${tag}.label must be a string when provided (dropdown trigger label).`);
        return false;
      }
      if (group.icon != null && typeof group.icon !== 'string') {
        log(`${tag}.icon must be a string when provided (dropdown trigger icon).`);
        return false;
      }
      if (group.display != null && !ACTION_DISPLAY_MODES.includes(group.display)) {
        log(`${tag}.display must be one of ${ACTION_DISPLAY_MODES.join(', ')}.`);
        return false;
      }
    }
    if (!Array.isArray(group.actions) || group.actions.length === 0) {
      log(`${tag}.actions must be a non-empty array.`);
      return false;
    }
    for (const [j, action] of group.actions.entries()) {
      if (!validateAction(action, `${tag}.actions[${j}]`)) return false;
    }
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

const validateConfig = (config = {}) => {
  if (config.size != null && !SIZES.includes(config.size)) {
    log(`config.size must be one of ${SIZES.join(', ')}.`);
    return false;
  }
  if (!validateSubmissionId(config.submissionId)) return false;
  if (config.include != null) {
    const i = config.include;
    if (!Array.isArray(i) && typeof i !== 'string') {
      log('config.include must be an array of strings or a comma-separated string.');
      return false;
    }
    if (Array.isArray(i) && !i.every(s => typeof s === 'string')) {
      log('config.include must contain only strings.');
      return false;
    }
  }
  if (config.meta != null) {
    if (typeof config.meta !== 'object' || Array.isArray(config.meta)) {
      log('config.meta must be a plain object.');
      return false;
    }
    if (!validateRender(config.meta.render, 'config.meta.render')) return false;
  }
  if (config.activities != null) {
    const a = config.activities;
    if (typeof a !== 'object' || Array.isArray(a)) {
      log('config.activities must be a plain object.');
      return false;
    }
    if (a.title != null && typeof a.title !== 'string') {
      log('config.activities.title must be a string when provided.');
      return false;
    }
    if (a.emptyText != null && typeof a.emptyText !== 'string') {
      log('config.activities.emptyText must be a string when provided.');
      return false;
    }
    if (a.order != null && !ACTIVITY_ORDERS.includes(a.order)) {
      log(`config.activities.order must be one of ${ACTIVITY_ORDERS.join(', ')}.`);
      return false;
    }
    if (a.exclude != null) {
      if (!Array.isArray(a.exclude) || !a.exclude.every(s => typeof s === 'string')) {
        log('config.activities.exclude must be an array of strings (activity types).');
        return false;
      }
    }
    if (a.typeTemplates != null) {
      if (typeof a.typeTemplates !== 'object' || Array.isArray(a.typeTemplates)) {
        log(
          'config.activities.typeTemplates must be a plain object keyed by activity type (case-insensitive). Use the "default" key for a fallback.',
        );
        return false;
      }
      for (const [type, render] of Object.entries(a.typeTemplates)) {
        if (!validateRender(render, `config.activities.typeTemplates["${type}"]`)) {
          return false;
        }
      }
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
  if (config.milestones != null) {
    const m = config.milestones;
    if (typeof m !== 'object' || Array.isArray(m)) {
      log('config.milestones must be a plain object.');
      return false;
    }
    if (m.showMilestones != null && typeof m.showMilestones !== 'boolean') {
      log('config.milestones.showMilestones must be a boolean when provided.');
      return false;
    }
    if (m.type != null && !MILESTONE_TYPES.includes(m.type)) {
      log(`config.milestones.type must be one of ${MILESTONE_TYPES.join(', ')}.`);
      return false;
    }
    if (m.position != null && !MILESTONE_POSITIONS.includes(m.position)) {
      log(
        `config.milestones.position must be one of ${MILESTONE_POSITIONS.join(', ')}.`,
      );
      return false;
    }
    if (m.emptyText != null && typeof m.emptyText !== 'string') {
      log('config.milestones.emptyText must be a string when provided.');
      return false;
    }
    if (m.orderBy != null && typeof m.orderBy !== 'string') {
      log('config.milestones.orderBy must be a string when provided.');
      return false;
    }
    if (m.title != null && typeof m.title !== 'string') {
      log('config.milestones.title must be a string when provided.');
      return false;
    }
    if (m.statusField != null && (typeof m.statusField !== 'string' || m.statusField === '')) {
      log('config.milestones.statusField must be a non-empty string when provided.');
      return false;
    }
    if (m.labelPosition != null && !LABEL_POSITIONS.includes(m.labelPosition)) {
      log(
        `config.milestones.labelPosition must be one of ${LABEL_POSITIONS.join(', ')}.`,
      );
      return false;
    }
    if (m.labelClassName != null && typeof m.labelClassName !== 'string') {
      log('config.milestones.labelClassName must be a string when provided.');
      return false;
    }
    if (m.gradientStart != null && !DOT_COLORS[m.gradientStart]) {
      log(
        `config.milestones.gradientStart must be one of ${DOT_COLOR_NAMES.join(', ')}.`,
      );
      return false;
    }
    if (m.gradientEnd != null && !DOT_COLORS[m.gradientEnd]) {
      log(
        `config.milestones.gradientEnd must be one of ${DOT_COLOR_NAMES.join(', ')}.`,
      );
      return false;
    }
    if (m.reachedStatuses != null) {
      if (
        !Array.isArray(m.reachedStatuses) ||
        !m.reachedStatuses.every(s => typeof s === 'string')
      ) {
        log(
          'config.milestones.reachedStatuses must be an array of status-value strings (matched case-insensitively).',
        );
        return false;
      }
    }
    if (m.defaultColor != null && !DOT_COLORS[m.defaultColor]) {
      log(
        `config.milestones.defaultColor must be one of ${DOT_COLOR_NAMES.join(', ')}.`,
      );
      return false;
    }
    if (m.statusColors != null) {
      if (typeof m.statusColors !== 'object' || Array.isArray(m.statusColors)) {
        log(
          'config.milestones.statusColors must be a plain object keyed by status value (matched case-insensitively against the milestone data field).',
        );
        return false;
      }
      for (const [statusValue, color] of Object.entries(m.statusColors)) {
        if (!DOT_COLORS[color]) {
          log(
            `config.milestones.statusColors["${statusValue}"] must be one of ` +
              `${DOT_COLOR_NAMES.join(', ')}. Got ${JSON.stringify(color)}.`,
          );
          return false;
        }
      }
    }
    if (m.template != null) {
      if (typeof m.template !== 'object' || Array.isArray(m.template)) {
        log('config.milestones.template must be a plain object.');
        return false;
      }
      if (m.template.label != null && typeof m.template.label !== 'string') {
        log('config.milestones.template.label must be a string template when provided.');
        return false;
      }
      if (!validateRender(m.template.render, 'config.milestones.template.render')) {
        return false;
      }
    }
  }
  if (config.actionsContainer != null) {
    if (!validateActionsContainer(config.actionsContainer)) return false;
  }
  if (!validateClassNames(config.classNames)) return false;
  if (config.notFoundText != null && typeof config.notFoundText !== 'string') {
    log('config.notFoundText must be a string when provided.');
    return false;
  }
  if (config.missingIdText != null && typeof config.missingIdText !== 'string') {
    log('config.missingIdText must be a string when provided.');
    return false;
  }
  return true;
};

/* ------------------------------------------------------------------ */
/* Include resolution                                                  */
/*                                                                    */
/* The widget always asks the API for the union of DEFAULT_INCLUDE +  */
/* the designer's additions. Comma-separated and array forms both     */
/* normalize to an array; the API call passes a comma-joined string   */
/* because that's the @kineticdata/react `fetchSubmission` shape.     */
/* ------------------------------------------------------------------ */

const normalizeInclude = include => {
  if (Array.isArray(include)) return include.filter(s => typeof s === 'string' && s !== '');
  if (typeof include === 'string') return include.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

const buildInclude = configInclude => {
  const seen = new Set();
  const out = [];
  for (const part of [...DEFAULT_INCLUDE, ...normalizeInclude(configInclude)]) {
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(',');
};

/* ------------------------------------------------------------------ */
/* Fetch hook                                                          */
/*                                                                    */
/* Drives the submission load. Three observable states:               */
/*   - loading:  request in flight (or no submissionId yet, since the */
/*     widget treats "waiting for the bundle script to call           */
/*     setSubmissionId" as a loading-equivalent state by default).    */
/*   - error:    request failed.                                      */
/*   - data:     submission object.                                   */
/* Re-fires whenever the resolved id or the include list changes, or  */
/* when `refresh()` is called.                                        */
/* ------------------------------------------------------------------ */

const useSubmission = (submissionId, include) => {
  const [state, setState] = useState({
    loading: !!submissionId,
    error: null,
    submission: null,
  });
  const fetchIdRef = useRef(0);

  const refresh = useCallback(() => {
    if (!submissionId) {
      setState({ loading: false, error: null, submission: null });
      return;
    }
    const myId = ++fetchIdRef.current;
    setState(s => ({ ...s, loading: true }));
    fetchSubmission({ id: submissionId, include }).then(response => {
      // Race guard — stale responses are dropped so a quick id-change or
      // refresh-spam can't paint old data over new.
      if (myId !== fetchIdRef.current) return;
      if (response?.error) {
        setState({ loading: false, error: response.error, submission: null });
        return;
      }
      setState({
        loading: false,
        error: null,
        submission: response?.submission || null,
      });
    });
  }, [submissionId, include]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
};

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

// Default meta render — what the widget falls back to when the designer
// omits `config.meta.render`. Picked to match the screenshot Matthew
// shared: label (large), then "{relative time} by {submitter}". Stays
// minimal on purpose; designers who want more lines override.
const DEFAULT_META_RENDER = [
  {
    left: ['{{label}}'],
    leftClassName: 'font-semibold text-lg',
  },
  {
    left: ['{{format:RelativeTime:createdAt}} by {{submittedBy}}'],
    leftClassName: 'text-sm text-base-content/60',
  },
];

// Built-in activity render used when no typeTemplate matches and no
// `default` entry was supplied. Three stacked lines — time / label /
// description — which is enough to read a generic activity at a glance.
const DEFAULT_ACTIVITY_RENDER = [
  {
    left: ['{{format:RelativeTime:createdAt}}'],
    leftClassName: 'text-sm text-base-content/60',
  },
  {
    left: ['{{label}}'],
    leftClassName: 'font-semibold',
  },
  {
    left: ['{{description}}'],
    leftClassName: 'text-sm',
  },
];

// `RenderItem` and `RenderRow` are the shared render-row primitives.
// Each section (meta / activities) hands them a `slotPrefix` so the
// slot lookups (`<prefix>Row`, `<prefix>PositionLeft`, …) name section-
// specific slots — designers can style meta rows differently from
// activity rows without one section's overrides leaking into the
// other.
//
// `RenderItem` dispatches on the item's shape:
//   - string → interpolate against the row context; render as a plain
//     <span>. Empty strings render nothing so a missing path doesn't
//     leave an empty box (the position container's gap would otherwise
//     show through).
//   - `{ kv, value, … }` → a label-above-value cell. The label is
//     literal (designer-supplied static text); the value is a template
//     interpolated against the row context, so `{{format:FMT:path}}`
//     and `{{submission.X}}` work inside it the same way they work in
//     a plain string item. Multiple KV items in the same position
//     array distribute evenly across the position's width via the
//     `kv` slot's `flex-1`.
const RenderItem = ({ item, ctx, cn }) => {
  if (item && typeof item === 'object') {
    const value = interpolate(item.value || '', ctx);
    return (
      <div className={cn('kv', item.className)}>
        <span className={cn('kvLabel', item.labelClassName)}>{item.kv}</span>
        <span className={cn('kvValue', item.valueClassName)}>{value}</span>
      </div>
    );
  }
  const text = interpolate(item, ctx);
  if (text === '') return null;
  return <span>{text}</span>;
};

const RenderRow = ({ entry, ctx, cn, tokens, slotPrefix }) => {
  const rowSlot = slotPrefix + POSITION_SLOT_SUFFIXES.row;
  const leftSlot = slotPrefix + POSITION_SLOT_SUFFIXES.left;
  const centerSlot = slotPrefix + POSITION_SLOT_SUFFIXES.center;
  const rightSlot = slotPrefix + POSITION_SLOT_SUFFIXES.right;
  return (
    <div className={cn(rowSlot, tokens.rowPad, tokens.rowGap, entry.className)}>
      {entry.left && (
        <div className={cn(leftSlot, tokens.rowGap, entry.leftClassName)}>
          {entry.left.map((item, i) => (
            <RenderItem key={`l-${i}`} item={item} ctx={ctx} cn={cn} />
          ))}
        </div>
      )}
      {entry.center && (
        <div className={cn(centerSlot, tokens.rowGap, entry.centerClassName)}>
          {entry.center.map((item, i) => (
            <RenderItem key={`c-${i}`} item={item} ctx={ctx} cn={cn} />
          ))}
        </div>
      )}
      {entry.right && (
        <div className={cn(rightSlot, tokens.rowGap, entry.rightClassName)}>
          {entry.right.map((item, i) => (
            <RenderItem key={`r-${i}`} item={item} ctx={ctx} cn={cn} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Activities — type-template matching, data parsing, ordering         */
/* ------------------------------------------------------------------ */

const ACTIVITY_ORDERS = ['asc', 'desc'];

// Parses an activity's `data` field once. Kinetic stores activity data
// as a JSON-encoded string; designers writing `{{data.X}}` templates
// expect to read into that JSON. Returns a *shallow-cloned* activity
// with `data` replaced by the parsed object (or null when parsing
// fails). Non-string `data` (already-an-object, null, etc.) passes
// through. Parse failures log a one-time warning and leave the raw
// string in place, so a `{{data.X}}` lookup falls through to ''.
const parseActivityData = activity => {
  const raw = activity?.data;
  if (raw == null || typeof raw !== 'string' || raw === '') return activity;
  try {
    return { ...activity, data: JSON.parse(raw) };
  } catch {
    console.warn(
      `SubmissionDetails Widget Warning: activity data is not valid JSON for activity ` +
        `type="${activity.type}" (id=${activity.id ?? '?'}); rendering with raw string.`,
    );
    return activity;
  }
};

// Case-insensitive type → typeTemplate lookup. Falls back to a `default`
// entry (also case-insensitive) when no specific match exists, then to
// `null` (the caller swaps in `DEFAULT_ACTIVITY_RENDER`). Returns the
// raw render array — typeTemplate values are the same shape as
// `meta.render`.
const matchTypeTemplate = (typeTemplates, type) => {
  if (!typeTemplates || typeof typeTemplates !== 'object') return null;
  const lc = String(type ?? '').toLowerCase();
  let fallback = null;
  for (const [key, value] of Object.entries(typeTemplates)) {
    if (key.toLowerCase() === lc) return value;
    if (key.toLowerCase() === 'default') fallback = value;
  }
  return fallback;
};

// Builds the filtered + ordered + data-parsed list the activities
// section iterates. `excludeTypes` is a lowercased Set so designers can
// list the types in any casing.
const buildActivityRows = (submission, excludeTypes, order) => {
  const raw = Array.isArray(submission?.activities) ? submission.activities : [];
  const filtered = raw.filter(a => {
    if (!a || typeof a !== 'object') return false;
    if (a.type && excludeTypes.has(String(a.type).toLowerCase())) return false;
    return true;
  });
  const parsed = filtered.map(parseActivityData);
  const dir = order === 'desc' ? -1 : 1;
  parsed.sort((a, b) => {
    const av = a.createdAt;
    const bv = b.createdAt;
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? -1 * dir : 1 * dir;
  });
  return parsed;
};

/* ------------------------------------------------------------------ */
/* Milestones — Milestone-typed activities rendered as a horizontal     */
/* progress strip                                                       */
/* ------------------------------------------------------------------ */

// Numeric values sort numerically; otherwise lexicographic. Used by
// both the default `createdAt` ordering and templated orderings (where
// the resolved value comes back as a string but may look numeric like
// "10" / "2"). Null / undefined / empty sort to the end.
const compareMilestoneSort = (a, b) => {
  if (a === b) return 0;
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;
  const an = Number(a);
  const bn = Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return a < b ? -1 : 1;
};

// Pulls `Milestone`-type activities out of the submission's activities,
// parses each one's `data` JSON (so `{{data.X}}` works in `template`
// templates), and sorts by either `createdAt` (the default) or a
// designer-supplied template (e.g., `'{{data.Order}}'`). Returns a
// frozen, oldest-first list — the dot strip is rendered left-to-right
// in the natural reading order of progression.
const buildMilestoneRows = (submission, orderBy) => {
  const raw = Array.isArray(submission?.activities) ? submission.activities : [];
  const lc = MILESTONE_ACTIVITY_TYPE;
  const milestones = raw
    .filter(a => a && typeof a === 'object' && String(a.type || '').toLowerCase() === lc)
    .map(parseActivityData);
  // `orderBy` is either the literal field name `createdAt` (default —
  // skips interpolation entirely so we don't waste cycles on every
  // milestone) or a template string the designer wants resolved against
  // the activity. Anything else interpolates against `{ row: activity }`.
  const useCreatedAt = !orderBy || orderBy === 'createdAt';
  return milestones
    .map(activity => ({
      activity,
      sortValue: useCreatedAt
        ? activity.createdAt
        : interpolate(orderBy, { row: activity, submission }),
    }))
    .sort((a, b) => compareMilestoneSort(a.sortValue, b.sortValue))
    .map(x => x.activity);
};

// Wraps a milestone's trigger (a step in progressBar; a label cell in
// thermometer) in an Ark HoverCard popover when `template.render` is
// supplied; renders the trigger plainly otherwise. Extracted out so
// both visualizations share one popover implementation.
const MilestonePopoverWrap = ({
  template,
  activity,
  submission,
  cn,
  tokens,
  triggerClassName,
  children,
}) => {
  const hasPopover = Array.isArray(template?.render) && template.render.length > 0;
  if (!hasPopover) {
    return triggerClassName ? (
      <div className={triggerClassName}>{children}</div>
    ) : (
      children
    );
  }
  const ctx = { row: activity, submission };
  // HoverCard.Trigger renders as a button so it's keyboard-focusable —
  // strip default button visuals (`bg-transparent border-0 p-0`) so
  // the trigger looks the same as a plain container until hover.
  return (
    <HoverCard.Root openDelay={150} closeDelay={100}>
      <HoverCard.Trigger
        type="button"
        className={clsx(triggerClassName, 'bg-transparent border-0 p-0 cursor-help')}
      >
        {children}
      </HoverCard.Trigger>
      <HoverCard.Positioner>
        <HoverCard.Content className={cn('milestonePopover')}>
          {template.render.map((entry, i) => (
            <RenderRow
              key={`p-${i}`}
              entry={entry}
              ctx={ctx}
              cn={cn}
              tokens={tokens}
              slotPrefix="milestonePopover"
            />
          ))}
        </HoverCard.Content>
      </HoverCard.Positioner>
    </HoverCard.Root>
  );
};

// Determines whether a milestone counts as "reached" for the thermometer
// fill. Three modes, in priority order:
//
//   1. `reachedStatuses` configured → milestone is reached iff its
//      status value matches one of the configured strings (case-
//      insensitive). Explicit; designers reach for this when their
//      workflow vocabulary doesn't map cleanly to progressBar's
//      "gray-vs-colored" intuition.
//
//   2. `statusColors` configured (the common case) → reached iff the
//      resolved dot color isn't the `defaultColor`. This is what makes
//      the thermometer's gray overlay match progressBar's gray dots
//      exactly: anywhere progressBar shows the fallback color (status
//      missing OR mapped to defaultColor), thermometer shows gray
//      overlay. No new config knobs required — the existing
//      statusColors map already tells the widget which statuses count.
//
//   3. Neither configured → any non-empty status counts as reached.
//      Reasonable default for "pre-created milestones with empty
//      status until workflow touches them" patterns.
const isMilestoneReached = (
  activity,
  stepColorName,
  statusField,
  statusColors,
  defaultColor,
  reachedStatuses,
) => {
  const data = activity?.data;
  // Mode 1 — explicit list wins.
  if (Array.isArray(reachedStatuses) && reachedStatuses.length > 0) {
    if (data == null || typeof data !== 'object') return false;
    const raw = getCaseInsensitive(data, statusField);
    if (raw == null || raw === '') return false;
    const lc = String(raw).toLowerCase();
    return reachedStatuses.some(s => String(s).toLowerCase() === lc);
  }
  // Mode 2 — statusColors-driven. The resolved color is null only
  // when statusColors itself isn't supplied (see `resolveStepColor`),
  // so this branch always has a meaningful `stepColorName` to compare.
  if (statusColors && typeof statusColors === 'object') {
    const dc = defaultColor || DEFAULT_MILESTONE_COLOR;
    return stepColorName != null && stepColorName !== dc;
  }
  // Mode 3 — fallback. No statusColors, no reachedStatuses; treat any
  // non-empty status as reached.
  if (data == null || typeof data !== 'object') return false;
  const raw = getCaseInsensitive(data, statusField);
  return raw != null && raw !== '';
};

// Resolves a milestone's dot color name from its workflow-managed
// status. Returns a key of `DOT_COLORS` (e.g., 'success', 'warning')
// or `null` when the designer didn't supply `statusColors` at all.
// Case-insensitivity is applied at two layers: looking up the status
// field name in the activity's data, and matching the resolved value
// against the keys of `statusColors`. Both layers are deliberate —
// workflow scripts rarely agree on casing.
const resolveStepColor = (activity, statusField, statusColors, defaultColor) => {
  if (!statusColors) return null;
  const data = activity?.data;
  let status;
  if (data != null && typeof data === 'object') {
    status = getCaseInsensitive(data, statusField);
  }
  if (status != null && status !== '') {
    const lc = String(status).toLowerCase();
    for (const [key, color] of Object.entries(statusColors)) {
      if (String(key).toLowerCase() === lc) return color;
    }
  }
  // Unmapped (or missing) status falls through to `defaultColor`,
  // which itself defaults to a muted base shade — workflow gaps
  // (a milestone whose status isn't yet set) render as neutral rather
  // than disappearing.
  return defaultColor || DEFAULT_MILESTONE_COLOR;
};

// One step in the strip. The step renders: label above, then a row
// containing (optional) connector-before, dot, (optional)
// connector-after. The first step suppresses connector-before; the
// last step suppresses connector-after. When `template.render` is
// supplied, the step wraps in an Ark HoverCard so hovering reveals
// the popover content; without it, the step is a plain non-interactive
// element.
//
// Coloring contract: the dot takes this step's color. The connector
// halves take the color of the FROM milestone:
//   - leading half (left of the dot) is colored from the previous
//     step's color — it visually "carries" the prior step's status
//     toward this dot.
//   - trailing half (right of the dot) is colored from THIS step's
//     color — same reasoning for the next dot.
// Combined, the line between any two dots ends up a single color
// (the from-milestone's), so a 3-state "open → in-progress → closed"
// progression reads as three correctly-colored segments without us
// needing to do any cross-step mixing logic.
const MilestoneStep = ({
  activity,
  template,
  submission,
  cn,
  tokens,
  isFirst,
  isLast,
  dotColorName,
  prevColorName,
  labelPosition,
  labelClassName,
}) => {
  const ctx = { row: activity, submission };
  const labelTemplate =
    typeof template.label === 'string' && template.label !== ''
      ? template.label
      : '{{label}}';
  const labelText = interpolate(labelTemplate, ctx);

  // Resolve color names → Tailwind bg classes. The fallback color is
  // the flat-mode legacy color so a config without `statusColors`
  // keeps rendering identically to the pre-status-colors version.
  const dotBg = DOT_COLORS[dotColorName] || DOT_COLORS[DEFAULT_FLAT_MILESTONE_COLOR];
  const leadingBg =
    DOT_COLORS[prevColorName] || DOT_COLORS[DEFAULT_FLAT_MILESTONE_COLOR];
  const trailingBg = dotBg;

  // Connector segments. First step's leading half is `invisible`
  // (it would extend off the left edge of the strip); same for the
  // last step's trailing half. Designers overriding
  // `milestoneConnector` get aligned end-spacers for free since the
  // spacers reuse the slot.
  const connectorBase = cn('milestoneConnector');
  const leadingClass = isFirst
    ? clsx(connectorBase, 'invisible')
    : clsx(connectorBase, leadingBg);
  const trailingClass = isLast
    ? clsx(connectorBase, 'invisible')
    : clsx(connectorBase, trailingBg);

  const labelEl = (
    <div className={cn('milestoneLabel', labelClassName)}>{labelText}</div>
  );
  const dotRowEl = (
    <div className={cn('milestoneDotRow')}>
      <div className={leadingClass} aria-hidden="true" />
      <div className={cn('milestoneDot', dotBg)} />
      <div className={trailingClass} aria-hidden="true" />
    </div>
  );
  const stepInner =
    labelPosition === 'below' ? (
      <>
        {dotRowEl}
        {labelEl}
      </>
    ) : (
      <>
        {labelEl}
        {dotRowEl}
      </>
    );

  return (
    <MilestonePopoverWrap
      template={template}
      activity={activity}
      submission={submission}
      cn={cn}
      tokens={tokens}
      triggerClassName={cn('milestoneStep')}
    >
      {stepInner}
    </MilestonePopoverWrap>
  );
};

// The thermometer visual. Renders a single horizontal pill with a
// theme-driven gradient layer for the reached portion and a gray
// overlay for the unreached portion. Equal-width segments (no per-
// milestone weighting in v1). Vertical dividers at each segment
// boundary make the segmentation visible regardless of where the
// reached-vs-unreached cutoff falls.
const Thermometer = ({ rows, reached, gradientStart, gradientEnd, defaultColor, cn }) => {
  const total = rows.length;
  if (total === 0) return null;
  const reachedCount = reached.filter(Boolean).length;
  // The reached cutoff is measured from the left edge of the bar.
  // We always fill in whole-segment units (1/total each); a half-
  // reached fill would imply per-milestone progress which v1 doesn't
  // model. Workflow updating one milestone to "reached" jumps the
  // bar by exactly one segment-width.
  const reachedPct = (reachedCount / total) * 100;
  const unreachedPct = 100 - reachedPct;

  const gradientClass = clsx(
    'bg-gradient-to-r',
    GRADIENT_FROM[gradientStart] || GRADIENT_FROM[DEFAULT_GRADIENT_START],
    GRADIENT_TO[gradientEnd] || GRADIENT_TO[DEFAULT_GRADIENT_END],
  );
  const unreachedBg = DOT_COLORS[defaultColor] || DOT_COLORS[DEFAULT_MILESTONE_COLOR];

  return (
    <div className={cn('thermometer')}>
      <div className={cn('thermometerFill', gradientClass)} aria-hidden="true" />
      {unreachedPct > 0 && (
        <div
          className={cn('thermometerUnreached', unreachedBg)}
          style={{ width: `${unreachedPct}%` }}
          aria-hidden="true"
        />
      )}
      {Array.from({ length: total - 1 }).map((_, i) => (
        <div
          key={`d-${i}`}
          className={cn('thermometerDivider')}
          style={{ left: `${((i + 1) / total) * 100}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
};

// A single row of labels — one per milestone — flex-1 each so each
// label sits centered above / below its segment. Used by both the
// thermometer (which has no per-step label baked into its visual)
// and by progressBar with `labelPosition: 'below'` if we ever want
// to render labels as a separate row there. Currently progressBar's
// labels live inline with each step, but the same `milestoneLabel`
// slot is reused for both call sites so designer overrides land
// everywhere.
const MilestonesLabelsRow = ({ rows, template, submission, cn, tokens, labelClassName }) => {
  const labelTemplate =
    typeof template?.label === 'string' && template.label !== ''
      ? template.label
      : '{{label}}';
  return (
    <div className={cn('milestonesLabelsRow')}>
      {rows.map((activity, i) => (
        <div
          key={activity.id || `lbl-${i}`}
          style={{ flex: 1, minWidth: 0 }}
        >
          <MilestonePopoverWrap
            template={template}
            activity={activity}
            submission={submission}
            cn={cn}
            tokens={tokens}
            triggerClassName={cn('milestoneLabel', labelClassName, 'w-full')}
          >
            {interpolate(labelTemplate, { row: activity, submission })}
          </MilestonePopoverWrap>
        </div>
      ))}
    </div>
  );
};

const MilestonesSection = ({ config, submission, cn, tokens }) => {
  const m = config.milestones || {};
  const orderBy = typeof m.orderBy === 'string' ? m.orderBy : 'createdAt';
  const rows = useMemo(
    () => buildMilestoneRows(submission, orderBy),
    [submission, orderBy],
  );
  // Pre-compute each step's color name once. `null` here is the
  // "no statusColors mapping was supplied" sentinel — MilestoneStep
  // falls back to a single legacy color when both `dotColorName` and
  // `prevColorName` come through null.
  const statusField =
    typeof m.statusField === 'string' && m.statusField !== ''
      ? m.statusField
      : 'Status';
  const stepColors = useMemo(
    () =>
      rows.map(activity =>
        resolveStepColor(activity, statusField, m.statusColors, m.defaultColor),
      ),
    [rows, statusField, m.statusColors, m.defaultColor],
  );
  // For the thermometer: an array of booleans, one per row, indicating
  // whether each milestone is "reached" (filled) or not. `stepColors`
  // is consulted so the implicit-mode rule (Mode 2 in
  // `isMilestoneReached`) aligns with progressBar's gray-dot behavior
  // — anywhere progressBar shows the defaultColor for a dot, the
  // thermometer marks that milestone unreached.
  const reachedFlags = useMemo(
    () =>
      rows.map((activity, i) =>
        isMilestoneReached(
          activity,
          stepColors[i],
          statusField,
          m.statusColors,
          m.defaultColor,
          m.reachedStatuses,
        ),
      ),
    [rows, stepColors, statusField, m.statusColors, m.defaultColor, m.reachedStatuses],
  );

  // `showMilestones: false` means "don't render anything for this section
  // anywhere" — but the activities section still suppresses Milestone-
  // typed entries (handled in ActivitiesSection). Bail-out goes here,
  // *after* hooks, so React's hook-call order stays stable across
  // re-renders if the designer toggles this at runtime.
  if (m.showMilestones === false) return null;

  const title = typeof m.title === 'string' && m.title !== '' ? m.title : null;

  // `emptyText` doubles as the "render an empty state" toggle — present
  // = show an empty card; absent = hide the section entirely. Keeps the
  // surface to one knob instead of separate `whenNoMilestones` + text.
  if (rows.length === 0) {
    if (typeof m.emptyText !== 'string') return null;
    return (
      <div className={cn('milestonesSection')}>
        {title && <div className={cn('milestonesTitle')}>{title}</div>}
        <div className={cn('milestonesEmpty')}>
          {interpolate(m.emptyText, { row: submission, submission })}
        </div>
      </div>
    );
  }

  const template = m.template || {};
  const labelPosition = LABEL_POSITIONS.includes(m.labelPosition)
    ? m.labelPosition
    : 'above';
  const labelClassName =
    typeof m.labelClassName === 'string' ? m.labelClassName : '';

  // Thermometer renders a single bar (no per-step components) plus a
  // standalone labels row above or below it. Each label is centered
  // over its segment via `flex: 1` on the label cells.
  if (m.type === 'thermometer') {
    const labels = (
      <MilestonesLabelsRow
        rows={rows}
        template={template}
        submission={submission}
        cn={cn}
        tokens={tokens}
        labelClassName={labelClassName}
      />
    );
    const bar = (
      <Thermometer
        rows={rows}
        reached={reachedFlags}
        gradientStart={m.gradientStart || DEFAULT_GRADIENT_START}
        gradientEnd={m.gradientEnd || DEFAULT_GRADIENT_END}
        defaultColor={m.defaultColor || DEFAULT_MILESTONE_COLOR}
        cn={cn}
      />
    );
    return (
      <div className={cn('milestonesSection')}>
        {title && <div className={cn('milestonesTitle')}>{title}</div>}
        {labelPosition === 'above' ? labels : null}
        {bar}
        {labelPosition === 'below' ? labels : null}
      </div>
    );
  }

  // progressBar (default). Each step owns its own label; labelPosition
  // flips whether that label sits above or below the dot row inside
  // each step's flex-column container.
  return (
    <div className={cn('milestonesSection')}>
      {title && <div className={cn('milestonesTitle')}>{title}</div>}
      <div className={cn('milestones')}>
        {rows.map((activity, i) => (
          <MilestoneStep
            key={activity.id || `m-${i}`}
            activity={activity}
            template={template}
            submission={submission}
            cn={cn}
            tokens={tokens}
            isFirst={i === 0}
            isLast={i === rows.length - 1}
            dotColorName={stepColors[i]}
            prevColorName={i > 0 ? stepColors[i - 1] : null}
            labelPosition={labelPosition}
            labelClassName={labelClassName}
          />
        ))}
      </div>
    </div>
  );
};

// Renders the activities section. Opt-in via `config.activities` — the
// widget never paints this section unless the designer declared it,
// since "no activities at all" and "didn't want activities here" both
// look the same to the user and we should err on the side of not
// rendering an unrequested empty card.
const ActivitiesSection = ({ config, submission, cn, tokens }) => {
  const a = config.activities || {};
  // When `config.milestones` is configured at all, Milestone-typed
  // activities are owned by the strip and shouldn't render again in
  // the feed. (Independent of `showMilestones` — false also means
  // "not in the feed" per the design.) Without `config.milestones`,
  // Milestones flow into the feed as ordinary activities.
  const milestonesConfigured = config.milestones != null;
  const excludeTypes = useMemo(() => {
    const out = new Set(
      (Array.isArray(a.exclude) ? a.exclude : []).map(s => String(s).toLowerCase()),
    );
    if (milestonesConfigured) out.add(MILESTONE_ACTIVITY_TYPE);
    return out;
  }, [a.exclude, milestonesConfigured]);
  const order = ACTIVITY_ORDERS.includes(a.order) ? a.order : 'asc';
  const rows = useMemo(
    () => buildActivityRows(submission, excludeTypes, order),
    [submission, excludeTypes, order],
  );

  const title = typeof a.title === 'string' && a.title !== '' ? a.title : null;
  const emptyText = typeof a.emptyText === 'string' ? a.emptyText : 'No activities.';

  // `{{submission.X}}` in the emptyText template resolves against the
  // parent submission — that's the "data from the parent" affordance
  // the prompt called out, and it works the same inside per-activity
  // templates.
  const emptyCtx = { row: submission, submission };

  return (
    <div className={cn('activitiesSection')}>
      {title && <div className={cn('activitiesTitle')}>{title}</div>}
      {rows.length === 0 ? (
        <div className={cn('activitiesEmpty')}>{interpolate(emptyText, emptyCtx)}</div>
      ) : (
        <div className={cn('activitiesList')}>
          {rows.map((activity, i) => {
            const matched = matchTypeTemplate(a.typeTemplates, activity.type);
            const render =
              Array.isArray(matched) && matched.length > 0
                ? matched
                : DEFAULT_ACTIVITY_RENDER;
            const ctx = { row: activity, submission };
            const key = activity.id || `${activity.type || 'a'}-${i}`;
            return (
              <div key={key} className={cn('activity')}>
                {render.map((entry, j) => (
                  <RenderRow
                    key={`r-${j}`}
                    entry={entry}
                    ctx={ctx}
                    cn={cn}
                    tokens={tokens}
                    slotPrefix="activity"
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Actions — actionsContainer of inline-button groups and dropdown      */
/* groups, each action gated by an optional `when` predicate            */
/* ------------------------------------------------------------------ */

// Visibility predicate. Designed for the function form (a closure that
// inspects the submission and returns true/false) so designers can
// express anything they need without inventing a tiny DSL. Booleans
// are accepted as a literal toggle; omitting the predicate means the
// action always renders. Throws are swallowed and treated as "hide" —
// a broken predicate shouldn't take down the whole widget.
const evaluateWhen = (when, submission) => {
  if (when == null) return true;
  if (typeof when === 'boolean') return when;
  if (typeof when === 'function') {
    try {
      return !!when(submission);
    } catch (e) {
      console.warn(
        `SubmissionDetails Widget Warning: action 'when' predicate threw — hiding the action. ${e?.message || e}`,
      );
      return false;
    }
  }
  return true;
};

// Resolves the action's display mode. Explicit `display` wins; otherwise
// infer from what's present — both → icon-text; icon only → icon; text
// only (or empty) → text. The fallback to 'text' for the "neither
// present" case keeps the button shape stable even when an action has
// nothing to render (designer mistake — ClickActionWrapper still renders
// the wrapping element so the user gets a click target).
const resolveActionDisplay = (action, labelText) => {
  if (ACTION_DISPLAY_MODES.includes(action.display)) return action.display;
  if (action.icon && labelText) return 'icon-text';
  if (action.icon) return 'icon';
  return 'text';
};

// Returns the children for an action button (or dropdown item, or
// dropdown trigger). Same content shape across all three call sites,
// so consolidating here lets `display: 'icon-text'` vs `text-icon`
// vs `icon` vs `text` behave identically everywhere.
const renderActionContent = ({ icon, labelText, display, tokens }) => {
  const iconNode = icon ? <Icon name={icon} size={tokens.iconPx - 6} /> : null;
  const textNode = labelText ? <span>{labelText}</span> : null;
  if (display === 'icon') return iconNode;
  if (display === 'text') return textNode;
  if (display === 'text-icon') {
    return (
      <>
        {textNode}
        {iconNode}
      </>
    );
  }
  return (
    <>
      {iconNode}
      {textNode}
    </>
  );
};

// One inline action button. ClickActionWrapper picks the right element
// (anchor for current/new nav, button for everything else), so all we
// supply here is the className + interpolated clickAction/target.
const ActionButton = ({ action, submission, cn, tokens, widgetId }) => {
  const ctx = { row: submission, submission };
  const labelText = action.label ? interpolate(action.label, ctx) : '';
  const display = resolveActionDisplay(action, labelText);
  const isIconOnly = display === 'icon';
  const className = isIconOnly ? cn('actionButtonIcon') : cn('actionButton');
  const interpolatedClickAction = action.clickAction
    ? interpolateDeep(action.clickAction, ctx)
    : null;
  const interpolatedTarget = action.target ? interpolateDeep(action.target, ctx) : undefined;
  const ariaLabel = action.clickActionLabel
    ? interpolate(action.clickActionLabel, ctx)
    : labelText || undefined;

  return (
    <ClickActionWrapper
      clickAction={interpolatedClickAction}
      target={interpolatedTarget}
      label={ariaLabel}
      widgetName="SubmissionDetails"
      instanceId={widgetId}
      className={className}
    >
      {renderActionContent({
        icon: action.icon,
        labelText,
        display,
        tokens,
      })}
    </ClickActionWrapper>
  );
};

// A single dropdown menu item. Same shape as ActionButton but the
// styling slot is different (full-width list row instead of pill
// button), and clicking the item closes the parent popover. Click
// closes via a bubble-phase handler on the inner span — fires before
// the wrapper's element-level onClick navigates/dispatches, so the
// popover collapses cleanly regardless of clickAction type.
const ActionDropdownItem = ({
  action,
  submission,
  cn,
  tokens,
  widgetId,
  onItemClick,
}) => {
  const ctx = { row: submission, submission };
  const labelText = action.label ? interpolate(action.label, ctx) : '';
  // Dropdown items default to icon-text — the menu is text-heavy so
  // icon-only items inside a dropdown read poorly. Designer can still
  // override per-item via `display`.
  const display = ACTION_DISPLAY_MODES.includes(action.display)
    ? action.display
    : action.icon && labelText
      ? 'icon-text'
      : action.icon
        ? 'icon-text'
        : 'text';
  const interpolatedClickAction = action.clickAction
    ? interpolateDeep(action.clickAction, ctx)
    : null;
  const interpolatedTarget = action.target ? interpolateDeep(action.target, ctx) : undefined;
  const ariaLabel = action.clickActionLabel
    ? interpolate(action.clickActionLabel, ctx)
    : labelText || undefined;

  return (
    <ClickActionWrapper
      clickAction={interpolatedClickAction}
      target={interpolatedTarget}
      label={ariaLabel}
      widgetName="SubmissionDetails"
      instanceId={widgetId}
      className={cn('actionsDropdownItem')}
    >
      <span onClick={onItemClick} style={{ display: 'contents' }}>
        {renderActionContent({
          icon: action.icon,
          labelText,
          display,
          tokens,
        })}
      </span>
    </ClickActionWrapper>
  );
};

// A dropdown group. Renders a trigger button that opens an Ark Popover
// containing the visible actions. Trigger styling reuses `actionButton`
// / `actionButtonIcon` slots so the dropdown looks at home next to
// inline action buttons.
const ActionsDropdown = ({ group, submission, cn, tokens, widgetId }) => {
  const popover = usePopover();
  const ctx = { row: submission, submission };
  const labelText = group.label ? interpolate(group.label, ctx) : '';
  const display = resolveActionDisplay(group, labelText);
  const isIconOnly = display === 'icon';
  const triggerClass = isIconOnly ? cn('actionButtonIcon') : cn('actionButton');
  const close = () => popover.setOpen(false);

  return (
    <Popover.RootProvider value={popover} autoFocus={false}>
      <Popover.Trigger
        type="button"
        className={triggerClass}
        aria-label={group.label || 'More actions'}
      >
        {renderActionContent({
          icon: group.icon,
          labelText,
          display,
          tokens,
        })}
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content className={cn('actionsDropdownContent')}>
          {group.visibleActions.map((action, i) => (
            <ActionDropdownItem
              key={`a-${i}`}
              action={action}
              submission={submission}
              cn={cn}
              tokens={tokens}
              widgetId={widgetId}
              onItemClick={close}
            />
          ))}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.RootProvider>
  );
};

const ActionsInline = ({ group, submission, cn, tokens, widgetId }) => (
  <div className={cn('actionsGroup')}>
    {group.visibleActions.map((action, i) => (
      <ActionButton
        key={`a-${i}`}
        action={action}
        submission={submission}
        cn={cn}
        tokens={tokens}
        widgetId={widgetId}
      />
    ))}
  </div>
);

// Single group renderer — picks `ActionsDropdown` vs `ActionsInline`
// based on `group.type`. Pulled out so both the in-flow row and each
// positioned corner can render groups with the same dispatch.
const renderActionGroup = (group, i, submission, cn, tokens, widgetId) =>
  group.type === 'dropdown' ? (
    <ActionsDropdown
      key={`g-${i}`}
      group={group}
      submission={submission}
      cn={cn}
      tokens={tokens}
      widgetId={widgetId}
    />
  ) : (
    <ActionsInline
      key={`g-${i}`}
      group={group}
      submission={submission}
      cn={cn}
      tokens={tokens}
      widgetId={widgetId}
    />
  );

const ActionsSection = ({ config, submission, cn, tokens, widgetId }) => {
  // `when` predicates are evaluated up-front so we can drop entire
  // groups whose visible action list is empty. Re-runs whenever the
  // submission changes (a clickAction-driven update upstream will
  // refresh the submission and recompute visibility).
  const groups = useMemo(() => {
    const raw = Array.isArray(config.actionsContainer) ? config.actionsContainer : [];
    return raw
      .map(group => ({
        ...group,
        visibleActions: (Array.isArray(group.actions) ? group.actions : []).filter(
          a => evaluateWhen(a.when, submission),
        ),
      }))
      .filter(group => group.visibleActions.length > 0);
  }, [config.actionsContainer, submission]);

  if (groups.length === 0) return null;

  // Partition into in-flow (no `position`) and per-corner buckets.
  // Array order is preserved per bucket so the right-side corners' use
  // of `flex-row-reverse` reads as "first group = closest to corner."
  const inflow = [];
  const corners = {};
  for (const group of groups) {
    if (ACTION_CORNERS.includes(group.position)) {
      (corners[group.position] ||= []).push(group);
    } else {
      inflow.push(group);
    }
  }

  return (
    <>
      {inflow.length > 0 && (
        <div className={cn('actionsSection')}>
          {inflow.map((group, i) =>
            renderActionGroup(group, i, submission, cn, tokens, widgetId),
          )}
        </div>
      )}
      {ACTION_CORNERS.map(corner =>
        corners[corner] ? (
          <div
            key={corner}
            className={cn('actionsCorner', ACTION_CORNER_CLASSES[corner])}
          >
            {corners[corner].map((group, i) =>
              renderActionGroup(group, i, submission, cn, tokens, widgetId),
            )}
          </div>
        ) : null,
      )}
    </>
  );
};

const SubmissionDetailsContent = forwardRef(({ id, config = {} }, ref) => {
  const api = useRef({});

  const size = SIZES.includes(config.size) ? config.size : 'md';
  const tokens = SIZE_TOKENS[size];

  // Slot-class helper. Same shape as Profile / Activity — string overrides
  // are additive, object overrides surgically `remove` then `add`.
  const cn = useCallback(
    (slot, ...extra) => {
      const base = clsx(SLOT_DEFAULTS[slot], ...extra);
      const override = config.classNames?.[slot];
      if (override == null) return base;
      if (typeof override === 'string') return clsx(base, override);
      const removeList = Array.isArray(override.remove) ? override.remove : null;
      const filtered =
        removeList && removeList.length > 0
          ? base.split(/\s+/).filter(t => t && !removeList.includes(t)).join(' ')
          : base;
      return clsx(filtered, override.add);
    },
    [config.classNames],
  );

  // Resolve the initial submissionId from config (literal or urlParam).
  // The API setter overrides this on demand. We store the manually-set id
  // in state so a `setSubmissionId(...)` re-fires the fetch effect via the
  // memoized include + id.
  const initialId = useMemo(
    () => resolveConfigSubmissionId(config.submissionId),
    [config.submissionId],
  );
  const [manualId, setManualId] = useState(null);
  const submissionId = manualId ?? initialId;

  // `include` is stable per-config; memoize so the fetch effect doesn't
  // re-fire on every render.
  const include = useMemo(() => buildInclude(config.include), [config.include]);

  const { loading, error, submission, refresh } = useSubmission(submissionId, include);

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

  // Expose API. `setSubmissionId` is the bundle-script-friendly entry
  // point for the `submissionId: { from: 'api' }` flow; `submission()`
  // hands back the currently-loaded submission so a form's bundle can
  // react to changes; `refresh()` re-fetches.
  useEffect(() => {
    Object.assign(api.current, {
      refresh,
      setSubmissionId: nextId => {
        setManualId(typeof nextId === 'string' && nextId !== '' ? nextId : null);
      },
      submission: () => submission,
      submissionId: () => submissionId,
      loading: () => loading,
      error: () => error,
    });
  }, [refresh, submission, submissionId, loading, error]);

  const metaRender = Array.isArray(config.meta?.render) && config.meta.render.length > 0
    ? config.meta.render
    : DEFAULT_META_RENDER;

  const refreshButton = refreshConfig.enabled ? (
    <button
      type="button"
      className={cn('refreshButton')}
      onClick={refresh}
      disabled={loading || !submissionId}
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

  const header = refreshConfig.enabled ? (
    <div className={cn('header', tokens.headerPad, 'justify-between')}>
      <div className="flex-sc gap-2">
        {refreshConfig.position === 'left' && refreshButton}
      </div>
      <div className="flex-sc gap-2">
        {refreshConfig.position === 'right' && refreshButton}
      </div>
    </div>
  ) : null;

  // State branches — order matters. "No id yet" wins over loading so a
  // designer using `from: 'api'` doesn't see a spinner on mount before
  // they've called `setSubmissionId`.
  let body;
  if (!submissionId) {
    const text =
      typeof config.missingIdText === 'string'
        ? config.missingIdText
        : 'No submission selected.';
    body = <div className={cn('empty')}>{text}</div>;
  } else if (loading) {
    body = <div className={cn('loading')}>Loading…</div>;
  } else if (error) {
    body = (
      <div className={cn('error')}>{error.message || 'Failed to load submission.'}</div>
    );
  } else if (!submission) {
    const text =
      typeof config.notFoundText === 'string'
        ? config.notFoundText
        : 'Submission not found.';
    body = <div className={cn('empty')}>{text}</div>;
  } else {
    // For meta templates, the row IS the submission and `submission` is
    // also the parent — this keeps `{{submission.X}}` valid everywhere
    // the widget uses an interpolation context.
    const ctx = { row: submission, submission };
    body = (
      <>
        <div className={cn('meta')}>
          {metaRender.map((entry, i) => (
            <RenderRow
              key={`meta-${i}`}
              entry={entry}
              ctx={ctx}
              cn={cn}
              tokens={tokens}
              slotPrefix="meta"
            />
          ))}
        </div>
        {config.milestones != null && (
          <MilestonesSection
            config={config}
            submission={submission}
            cn={cn}
            tokens={tokens}
          />
        )}
        {config.activities != null && (
          <ActivitiesSection
            config={config}
            submission={submission}
            cn={cn}
            tokens={tokens}
          />
        )}
        {config.actionsContainer != null && (
          <ActionsSection
            config={config}
            submission={submission}
            cn={cn}
            tokens={tokens}
            widgetId={id}
          />
        )}
      </>
    );
  }

  return (
    <WidgetAPI ref={ref} api={api.current}>
      <div className={cn('root', tokens.text)} data-submission-details-id={id}>
        {header}
        {body}
      </div>
    </WidgetAPI>
  );
});

const SubmissionDetailsComponent = forwardRef(({ id, config }, ref) => (
  <Provider store={store}>
    <SubmissionDetailsContent ref={ref} id={id} config={config} />
  </Provider>
));

/**
 * Initializes a SubmissionDetails widget instance — renders metadata,
 * activities, milestones, and actions for a single Kinetic submission.
 *
 * Phase 1 + 2 + 3 + 4 surface (shipped here):
 *   - submissionId resolution: literal string, `{ from: 'urlParam', name }`,
 *     or `{ from: 'api' }` (set later via the widget's API).
 *   - Submission fetch (`fetchSubmission` from @kineticdata/react) with a
 *     sensible default `include` set; `config.include` (string or array)
 *     appends to the defaults.
 *   - Metadata section — `config.meta.render` is an Activity-style array
 *     of render-rows (left / center / right positions, each an array of
 *     template strings supporting `{{path}}` and `{{format:FMT:path}}`).
 *   - Activities section — opt-in via `config.activities`. Per-type
 *     templates (`typeTemplates`, case-insensitive lookup with a
 *     `default` fallback), `exclude` list, `order: 'asc' | 'desc'` on
 *     `createdAt`, templated `emptyText`. Activity `data` is parsed
 *     from its JSON string form so `{{data.X}}` works.
 *   - Content items inside render position arrays accept either a
 *     string template OR an object `{ kv, value, … }` for a
 *     labels-above-values grid cell. Works in any render array
 *     (meta.render, activities.typeTemplates[*], milestones popover).
 *   - Milestones section (`config.milestones`) — opt-in horizontal
 *     dot-and-connector strip for 'Milestone'-type activities. Per-step
 *     `template.label` and optional HoverCard popover via
 *     `template.render`. `orderBy: 'createdAt' | '{{path}}'`. Workflow-
 *     managed status drives per-step coloring via `statusField` +
 *     `statusColors` (both case-insensitive); the connector toward the
 *     next dot takes the FROM milestone's color. When milestones is
 *     configured, the activities section implicitly filters Milestone
 *     entries so they only render once.
 *   - Actions section (`config.actionsContainer`) — opt-in. Array of
 *     groups; each group is `type: 'inline'` (default — flex row of
 *     action buttons) or `type: 'dropdown'` (trigger button that opens
 *     an Ark Popover containing the actions). Each action has
 *     `label` / `icon` / `display` (`'text'|'icon'|'icon-text'|
 *     'text-icon'`) / `when` (function predicate against the
 *     submission) / `clickAction` + `target` (chrome-utils system).
 *     Templated strings inside clickAction/target/label interpolate
 *     against the submission.
 *   - Refresh button (icon / label / position configurable) — also
 *     reachable via the API.
 *   - classNames slot system (string-additive or `{ add, remove }`).
 *   - Loading / error / empty / missing-id / not-found states.
 *
 * Coming in later phases:
 *   - Milestone `thermometer` visual variant (currently validated but
 *     renders identically to `progressBar`).
 *
 * API (via `bundle.widgets.SubmissionDetails.get(id)`):
 *   - `refresh()`            — re-fetch.
 *   - `setSubmissionId(id)`  — switch to a different submission. Pass null
 *                              / empty string to clear back to the empty
 *                              state.
 *   - `submission()`         — currently loaded submission object.
 *   - `submissionId()`       — currently loaded id (or null).
 *   - `loading()` / `error()` — current load state.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container
 * @param {Object} config
 * @param {string} [id]
 */
export const SubmissionDetails = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'SubmissionDetails');
  if (resolved && validateConfig(config)) {
    return registerWidget(SubmissionDetails, {
      container: resolved,
      Component: SubmissionDetailsComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The SubmissionDetails widget parameters are invalid. See the console for more details.',
  );
};
