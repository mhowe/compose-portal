[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## SubmissionDetails Widget

`SubmissionDetails` renders a single Kinetic submission — a metadata header, an optional milestone strip, an activities feed, and a row of actions — for a submissionId resolved from config, a URL parameter, or set later through the widget's API. Designed to be dropped on a request-detail page in a bundle and configured per kapp without writing React; the section grammar mirrors the [Activity](ACTIVITY.md) widget's `render` arrays so designers can move between the two.

```js
// Initialize the SubmissionDetails widget
bundle.widgets.SubmissionDetails({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.SubmissionDetails.get(id);
```

### Phasing

This widget ships in phases. Items marked _(later)_ live in upcoming phases and will be documented here as they land.

- **submissionId resolution** — literal string, URL parameter, or API setter — _shipped_
- **Kinetic submission fetch** — `fetchSubmission` with default + caller-extensible `include` — _shipped_
- **Metadata section** — Activity-style `render` arrays + template interpolation — _shipped_
- **Activities section** — per-type render templates, `exclude`, `order`, templated `emptyText` — _shipped_
- **Milestones section** — opt-in horizontal visual for `Milestone`-type activities, in two flavors: `progressBar` (dot + connector strip with status-driven coloring) and `thermometer` (pill bar with theme-driven `warning → success` gradient fill, equal-width segments, gray for unreached). Shared: `statusField` + `statusColors`, optional HoverCard popover via `template.render`, templated `orderBy`, configurable label placement (`above | below`) — _shipped_
- **Actions section** — `actionsContainer` of inline + dropdown groups; per-action `display`, function-form `when` predicate, `clickAction`/`target` from the chrome-utils system — _shipped_
- **KV content item** — first-class labels-above-values cells inside any render array — _shipped_
- **Refresh control** — _shipped_
- **classNames slot system** — additive strings or `{ add?, remove? }` per slot — _shipped_

### `submissionId` — three sources

The widget needs an id before it can fetch. Config selects where the id comes from. The API setter overrides whatever the config picked, so a bundle script can always take control.

```js
// (a) Literal id — useful when the form bundle already knows it.
{ submissionId: '8c1f…-…-…' }

// (b) URL parameter — reads `?submissionId=…` from the hash query string
// first (the bundle's HashRouter puts query params after `?` inside the
// fragment), then falls back to the regular URL query string.
{ submissionId: { from: 'urlParam', name: 'submissionId' } }

// (c) Provided later via the widget's API. The widget shows the
// missing-id empty state until `setSubmissionId(...)` is called.
{ submissionId: { from: 'api' } }
```

The widget's API setter:

```js
bundle.widgets.SubmissionDetails.get('details').setSubmissionId('abc');
// Pass null / '' to clear back to the missing-id empty state.
bundle.widgets.SubmissionDetails.get('details').setSubmissionId(null);
```

### `include` — what gets fetched

The widget always asks the Kinetic API for a sensible default include set so every section the widget renders has the data it needs:

```
details, values, form, form.attributesMap, form.kapp,
activities, activities.details
```

`config.include` (string or array) appends to that list and de-duplicates. The widget never silently drops a default — additions only.

```js
{
  include: ['form.attributesMap[Icon]', 'form.categorizations'],
}
// or
{
  include: 'form.attributesMap[Icon],form.categorizations',
}
```

### Template syntax

Inside any string in `meta.render` (and, in later phases, the activity / milestone / action templates) the following `{{...}}` tokens resolve at render time:

- **`{{path}}`** or **`{{row.path}}`** — `_.get(row, path)`. In the metadata section, the "row" is the submission itself, so `{{label}}`, `{{values.Requested For}}`, `{{form.name}}`, `{{coreState}}`, etc. all work.
- **`{{submission.path}}`** — same as `{{path}}` in the metadata section, but in later phases (activities / milestones) where the row is an activity, the `submission.` prefix reads from the parent submission instead of the activity.
- **`{{format:FMT:path}}`** — formatting directive. Parser splits on the last colon so format strings can contain colons. `FMT === 'RelativeTime'` renders `"about 1 year ago"` via date-fns `formatDistance`; any other `FMT` is treated as a [moment](https://momentjs.com/docs/#/displaying/format/) format string. Unparseable values render as the empty string.

Missing values resolve to the empty string rather than throwing.

**Case-insensitive `data.X` lookups.** Activity `data` is JSON-parsed from a string field that workflow scripts populate, and authors aren't consistent about casing. The widget descends `data.X.Y` paths case-insensitively — so a template `{{data.Status}}` finds a stored `status`, `STATUS`, or `Status` field equally well. Top-level activity fields (`label`, `createdAt`, `type`, …) and `submission.*` lookups remain case-sensitive — those names are stable in the Kinetic API.

### Content items

Inside the position arrays (`left`, `center`, `right`) of any render-row — both in `meta.render` and in `activities.typeTemplates[*]` — each entry is either:

**A string template** — interpolated against the row context and rendered as a plain `<span>`. Empty results render nothing so a missing field doesn't leave a hole the row gap would otherwise expose.

```js
left: ['{{label}}', 'Submitted {{format:RelativeTime:createdAt}}'],
```

**A KV object** — a labels-above-values cell. `kv` is the static label (literal designer text); `value` is a template interpolated against the row context, so the full `{{path}}` / `{{format:FMT:path}}` / `{{submission.X}}` grammar works inside it.

```js
left: [
  { kv: 'Assigned Team', value: '{{data.Assigned Team}}' },
  { kv: 'Assigned Individual', value: '{{data.Assigned Individual}}' },
  { kv: 'Due', value: '{{format:RelativeTime:data.Due Date}}' },
],
```

Multiple KV cells in the same position array distribute evenly across the position's width (each cell is `flex-1`). To get the gray "details panel" look from the screenshot, stack KVs in their own render-row and style the row with `className`:

```js
{
  left: [
    { kv: 'By', value: '{{data.By}}' },
    { kv: 'Handle', value: '{{submission.handle}}' },
  ],
  className: 'rounded-md bg-base-200',
}
```

Per-cell class overrides — `className` (the whole cell), `labelClassName` (just the label), `valueClassName` (just the value) — layer on top of the `kv` / `kvLabel` / `kvValue` slot defaults. Use these for one-off cell styling; use `classNames.kvLabel` (etc.) for widget-wide overrides.

### Metadata section

`config.meta.render` is an array of render-rows. Each entry renders as one **line** stacked vertically inside the metadata card. Each line has up to three optional positions (`left`, `center`, `right`); positions you omit produce no element for that column. Each position is an array of **content items** — strings that interpolate against the loaded submission.

```js
config.meta = {
  render: [
    {
      left: ['{{label}}'],
      leftClassName: 'font-semibold text-lg',
      right: ['{{coreState}}'],
      rightClassName: 'text-base-content/60',
    },
    {
      left: ['Opened {{format:RelativeTime:createdAt}} by {{submittedBy}}'],
      leftClassName: 'text-sm text-base-content/60',
    },
  ],
};
```

When `config.meta.render` is omitted the widget falls back to a two-line default: bold label on top, `{{format:RelativeTime:createdAt}} by {{submittedBy}}` underneath.

Recognized per-render-row class keys: `className` (the line's container), `leftClassName`, `centerClassName`, `rightClassName`. These layer on top of the slot defaults — they don't replace them. Use the top-level `classNames.metaRow` / `classNames.metaPositionLeft` (etc.) for styling that should apply to every line.

### Activities section

The activities section renders `submission.activities` (the array Kinetic returns when `activities` is in the include — the widget's default include set already pulls it). The section is **opt-in**: it only renders when `config.activities` is present.

```js
config.activities = {
  title: 'Activity',                   // optional section heading
  exclude: ['note'],                   // types to drop (case-insensitive)
  order: 'asc',                        // 'asc' (default) | 'desc' — by createdAt
  emptyText: 'No activity for {{submission.handle}} yet.',
  typeTemplates: {
    Approval: [                        // case-insensitive key match
      {
        left: ['{{format:RelativeTime:createdAt}}'],
        leftClassName: 'text-sm text-base-content/60',
      },
      { left: ['{{label}}'], leftClassName: 'font-semibold' },
      {
        left: ['Assigned to {{data.Assigned Individual}}'],
        right: ['{{data.Status}}'],
        rightClassName: 'text-sm',
      },
    ],
    default: [                         // fallback for activities not matching a specific type
      {
        left: ['{{format:RelativeTime:createdAt}}'],
        leftClassName: 'text-sm text-base-content/60',
      },
      { left: ['{{label}}'], leftClassName: 'font-semibold' },
      { left: ['{{description}}'], leftClassName: 'text-sm' },
    ],
  },
};
```

**Per-type templates**

`typeTemplates` is an object keyed by activity `type` — matched case-insensitively, so `Approval`, `approval`, and `APPROVAL` all resolve to the same template. Each value is a render array with the same grammar as `meta.render` (each entry is one line stacked vertically inside the activity card; each line has `left` / `center` / `right` arrays of template strings plus optional `className` / `leftClassName` / etc.).

The special key `default` (also case-insensitive) is the fallback template used for activities whose type doesn't match any explicit entry. When no `typeTemplates` is supplied — or when no entry (and no `default`) matches — the widget falls back to a built-in three-line default: relative time, label, description.

**Activity context**

Inside any template string in a `typeTemplates` entry (and inside `emptyText`):

- `{{path}}` reads from the **activity** — e.g. `{{label}}`, `{{type}}`, `{{createdAt}}`.
- `{{data.X}}` reads from the activity's `data` field. Kinetic stores `data` as a JSON-encoded string; the widget parses it once per activity so `{{data.Assigned To}}` works whether the API returned the JSON-stringified form or a pre-parsed object. Parse failures log a warning and the lookup resolves to the empty string.
- `{{submission.path}}` reads from the **parent submission** — useful inside `emptyText` (e.g. `'No activities for {{submission.handle}} yet.'`) or to compose a label that references both ("for request {{submission.handle}}").
- `{{format:FMT:path}}` works the same way it does in `meta.render`.

**Exclude list**

`exclude: ['note', 'audit']` drops activities whose `type` matches any string in the list (case-insensitive). Use this when the activities feed shows up in another widget too and you want a focused view here.

**Order**

`order: 'asc'` (default) renders oldest-first, top-to-bottom — matches the typical "story of the request from intake to now" reading order. `'desc'` flips to newest-first.

### Milestones section

The milestones section renders activities of type `Milestone` (case-insensitive) as a horizontal strip — a label above each dot, dots connected by lines to read as a progression. It's **opt-in** the same way activities is: nothing renders unless `config.milestones` is supplied.

```js
config.milestones = {
  showMilestones: true,                  // boolean. default true. See "showMilestones" below.
  type: 'progressBar',                   // 'progressBar' (default) | 'thermometer'.
  position: 'horizontal',                // 'horizontal' is the only orientation today.
  orderBy: '{{data.Order}}',             // 'createdAt' (default) or a template. Numeric strings parse as numbers.
  title: 'Progress',                     // optional section heading.
  emptyText: 'No milestones yet.',       // optional. Presence renders an empty card; absence hides the section.
  // Status-driven coloring. Workflow pre-creates all milestone activities
  // up front and updates their `data.<statusField>` as the request moves;
  // the widget reads each milestone's status and colors the dot + the
  // connector leading to the next dot from this mapping.
  statusField: 'Status',                 // key inside `data` to read. case-insensitive. Default 'Status'.
  statusColors: {                        // map status value (case-insensitive) → DaisyUI color name.
    Closed: 'success',
    'In Progress': 'warning',
    Open: 'primary',
    'Not Started': 'base-300',
  },
  defaultColor: 'base-300',              // fallback for unmapped / missing status. Default 'base-300'.
  template: {
    label: '{{label}}',                  // template for the text above each dot. Defaults to '{{label}}'.
    render: [                            // optional. When present, hovering a milestone reveals these rows in a popover.
      {
        left: ['{{label}}'],
        leftClassName: 'font-semibold',
      },
      {
        left: ['{{format:RelativeTime:createdAt}}'],
        leftClassName: 'text-sm text-base-content/60',
      },
      {
        left: [{ kv: 'Assigned To', value: '{{data.Assigned To}}' }],
      },
    ],
  },
};
```

**Status-driven coloring**

Workflow pre-creates every milestone activity when the request starts, so the strip always shows the full sequence (e.g. all four of "Submitted → Approval → In Progress → Closed") even before the later ones are reached. Workflow then updates `data.<statusField>` on each milestone as the request progresses. The widget reads each milestone's status and:

- Colors the **dot** based on this milestone's status.
- Colors the **connector to the next milestone** based on this milestone's status too — so a closed-then-in-progress transition reads as one closed-colored segment ending at the in-progress dot.

`statusField` defaults to `'Status'` and is looked up **case-insensitively** in the activity's `data` object — workflow scripts that store `status`, `Status`, or `STATUS` all work.

`statusColors` is the value-to-color map. Keys match the status value **case-insensitively** (`'Closed'` matches a stored `closed`). Values are DaisyUI color names from the palette `success | warning | error | info | primary | secondary | accent | neutral | base-100 | base-200 | base-300 | base-content` — the same palette the Activity widget uses for status dots.

`defaultColor` is the fallback for any milestone whose status isn't in the map (or is missing entirely). Defaults to `'base-300'`. Workflow doesn't enforce a particular ordering across milestones — if milestone 3 ends up closed before milestone 2 is updated, the strip renders that exactly as the data says; the widget never "corrects" out-of-order updates.

When `statusColors` is omitted entirely, every dot and connector uses a single flat color (`'success'`) — matching the look the widget had before status-driven coloring landed.

**`showMilestones`** is the coordination knob between the strip and the activities feed. Three states:

- `config.milestones` **not present** — `Milestone`-type activities behave like any other activity and flow through the activities feed.
- `config.milestones` present, `showMilestones` omitted or `true` — Milestones render in the strip and are filtered out of the activities feed (no double-render).
- `config.milestones` present, `showMilestones: false` — strip hidden, AND Milestones are still filtered out of the activities feed. Use this when a different surface (e.g. an admin view) consumes Milestone activities and you don't want them to appear here at all.

**`orderBy`** picks the field to sort milestones by. Plain `'createdAt'` (the default) reads the activity's `createdAt`. Anything else is treated as a template string interpolated per activity — `'{{data.Order}}'` reads an `Order` field out of the parsed `data` JSON (case-insensitive). Workflow often stores ordering as a string (`"1"`, `"2"`, …); values that look numeric are compared numerically, otherwise lexicographically. Null / missing values sink to the end. Sort is ascending — the strip reads left-to-right as oldest / lowest-order first.

**`template.label`** is the text shown above each dot. Templates resolve against the milestone activity, with `{{submission.X}}` available for parent context. The default `'{{label}}'` reads the activity's `label` field.

**`template.render`** is optional. When supplied, hovering a milestone opens an Ark HoverCard popover containing those render-rows. Same grammar as `meta.render` and `activities.typeTemplates[*]` — including the KV content-item form. The trigger renders as a button so it's keyboard-focusable; default button styling is stripped so the strip looks the same as the non-interactive case.

**`emptyText`** is the one-knob version of "what happens when there are no Milestone activities yet." If you provide a string, the section renders an empty card with that text. If you omit it, the section is hidden entirely (you'll just see the meta and activities below it). Templates against `{{submission.X}}` work here, e.g. `'{{submission.handle}} hasn't reached any milestones yet.'`.

**`type: 'thermometer'`** renders a single horizontal pill instead of the dot-and-connector strip. A theme-driven gradient (default `warning → success`) fills the reached portion; the unreached portion is gray. Equal-width segments, with thin vertical dividers at each boundary.

```js
config.milestones = {
  type: 'thermometer',
  gradientStart: 'warning',           // any DOT_COLORS palette name. Default 'warning'.
  gradientEnd: 'success',             // any DOT_COLORS palette name. Default 'success'.
  reachedStatuses: ['Closed', 'In Progress'],  // case-insensitive list of statuses that count as "filled". See below.
  defaultColor: 'base-300',           // unreached overlay color. Default 'base-300'.
  template: { label: '{{label}}' },   // labels render in a row above (or below) the bar.
  labelPosition: 'below',             // 'above' | 'below'. See below.
  // statusField also applies — same case-insensitive `data.<statusField>` lookup as progressBar.
};
```

**Reached vs. unreached.** The thermometer needs a binary "filled or not" decision per milestone. Three modes in priority order:

1. **Explicit** (`reachedStatuses` configured) — a milestone is filled iff its `data.<statusField>` value matches one of the configured strings (case-insensitive). Reach for this when your workflow vocabulary doesn't map cleanly to progressBar's "gray-vs-colored" intuition.
2. **statusColors-driven** (the common case — `statusColors` configured, `reachedStatuses` omitted) — reached iff the resolved dot color isn't the `defaultColor`. This makes the thermometer's gray overlay match progressBar's gray dots exactly: anywhere progressBar would show the fallback color (status missing OR mapped to `defaultColor`), thermometer shows gray overlay. No extra knobs required.
3. **Fallback** (neither configured) — any non-empty status counts as filled; missing / empty status is unreached. Useful for "pre-created milestones with empty status until workflow touches them" patterns.

**Gradient.** `gradientStart` / `gradientEnd` are color names from the DaisyUI palette (`success | warning | error | info | primary | secondary | accent | neutral | base-100 | base-200 | base-300 | base-content`). The bar renders a smooth gradient between them; equal-width segments don't get individual colors — the bar is one continuous gradient, with thin vertical dividers indicating segment boundaries so the count of reached milestones reads off visually.

**Weighted segment lengths** are a queued follow-up; today every milestone takes `1/N` of the bar regardless of how long that phase typically takes. If you want to revisit that, an additive `data.<weightField>` knob would do it without breaking existing configs.

### Label placement

Applies to both `progressBar` and `thermometer`:

```js
config.milestones = {
  labelPosition: 'below',          // 'above' (default) | 'below'
  labelClassName: 'font-medium',   // additive class for the milestoneLabel slot
};
```

`labelPosition` flips whether milestone labels render above or below the visual (the dot row for `progressBar`, the pill bar for `thermometer`).

`labelClassName` is an additive shortcut that layers on top of the `milestoneLabel` slot defaults. Equivalent to `classNames.milestoneLabel: '…'` but easier to discover when configuring just the milestones block.

### Actions section

The actions section renders a row of buttons and/or dropdown menus at the bottom of the widget — Clone, Cancel, Escalate, Review, etc. Each action gates behind an optional `when` predicate so it shows only when the submission supports it. **Opt-in** via `config.actionsContainer`: nothing renders unless the key is present.

```js
config.actionsContainer = [
  // Group 1 — two inline icon buttons.
  {
    type: 'inline',                       // 'inline' (default) | 'dropdown'
    actions: [
      {
        label: 'Refresh',
        icon: 'refresh',
        display: 'icon',                  // 'text' | 'icon' | 'icon-text' | 'text-icon'
        clickAction: { type: 'event', name: 'submission-details:refresh' },
        clickActionLabel: 'Refresh {{label}}',
      },
      {
        label: 'Review',
        icon: 'binoculars',
        display: 'icon',
        when: submission => submission.coreState !== 'Closed',
        clickAction: { type: 'internal', path: '/requests/{{id}}/review' },
      },
    ],
  },
  // Group 2 — overflow dropdown.
  {
    type: 'dropdown',
    label: 'More',
    icon: 'dots-vertical',
    display: 'icon',
    actions: [
      {
        label: 'Clone',
        icon: 'copy',
        clickAction: { type: 'event', name: 'submission-details:clone' },
      },
      {
        label: 'Cancel Request',
        icon: 'x',
        when: submission => submission.coreState === 'Submitted',
        clickAction: { type: 'event', name: 'submission-details:cancel' },
      },
      {
        label: 'Escalate',
        icon: 'arrow-up',
        when: submission => submission.coreState !== 'Closed',
        clickAction: { type: 'event', name: 'submission-details:escalate' },
      },
    ],
  },
];
```

**Groups**

`actionsContainer` is an array of groups. Each group is a distinct visual unit — designers cluster actions by importance / function and the section lays the groups out side-by-side. Two group types:

- **`type: 'inline'`** (default) — actions render as a flex row of buttons inside the group. Useful for "primary" actions that should always be visible.
- **`type: 'dropdown'`** — the group collapses to a single trigger button (with the group's own `label` / `icon` / `display`) that opens an Ark Popover containing the actions. Useful for overflow / secondary actions.

A group with zero visible actions (everything filtered out by `when`) renders nothing — no empty dropdowns, no empty button rows.

**Group placement**

By default every group renders in a single in-flow row at the bottom of the widget. A group can opt into a fixed corner of the widget via `position`:

```js
{ position: 'top-right', type: 'inline', actions: [...] }
```

Recognized values: `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`. Positioned groups float absolutely over the widget root (which carries `relative` positioning for this purpose). Multiple groups in the same corner stack horizontally; the **first** group in `actionsContainer` array order sits closest to the corner (right-side corners use `flex-row-reverse` so "first" still reads as "closest to the corner" regardless of side). Groups without a `position` keep the in-flow bottom-row behavior — mix and match as needed.

**Actions**

Each action has:

- **`label`** — the visible text label. Template strings against the submission work: `'Review {{label}}'` produces "Review Purchase Request request for Matt Howe".
- **`icon`** — Tabler icon name.
- **`display`** — explicit shape: `'text'` (label only), `'icon'` (icon only), `'icon-text'` (icon first, then label), `'text-icon'` (label first, then icon). Omitting `display` infers it from what's present: both → `'icon-text'`; icon only → `'icon'`; text only → `'text'`.
- **`when`** — visibility predicate. Function form `(submission) => boolean` is the primary shape, since it can express anything (`submission.coreState !== 'Closed'`, `submission.values['Approval Status'] === 'Pending'`, …). A literal `true` / `false` works too. Omitting `when` always shows the action. Predicates that throw are swallowed and the action hides — a broken predicate shouldn't take the widget down.
- **`clickAction`** + **`target`** — same shape every other widget uses (see [Chrome Widget Actions](CHROME_ACTIONS.md)). String values inside both are interpolated against the submission, so `path: '/requests/{{id}}/review'` and `name: 'cancel-{{form.slug}}'` work.
- **`clickActionLabel`** — template for the action's aria-label. Falls back to the resolved `label`.

**Inferred display in dropdowns**

Inside a dropdown menu the item shape defaults to `icon-text` even when only an icon is supplied — a text-only list with a single bare icon item reads poorly. Explicit `display` still overrides if you really want an icon-only row inside the menu.

**Wiring actions to bundle script handlers**

The common pattern is `clickAction.type: 'event'` — the action dispatches a `CustomEvent` whose `detail.config` contains the original `clickAction` object. The form bundle's JS listens for the event name and runs the actual action (call a Kinetic integration, navigate, open a modal, …). This keeps the widget free of business logic and lets one config support arbitrary actions.

```js
window.addEventListener('submission-details:cancel', e => {
  // e.detail.config carries the clickAction object the action was configured with
  cancelSubmission(bundle.widgets.SubmissionDetails.get('details').submissionId());
});
```

### Refresh

A refresh button can sit in the widget's header. Same shape Activity uses — only `enabled: false` hides the button entirely.

```js
config.refresh = {
  enabled: true,         // default true. false to hide.
  icon: 'refresh',       // Tabler icon name, or null to drop the icon.
  label: 'Refresh',      // optional visible label.
  position: 'right',     // 'left' | 'right'. Default 'right'.
};
```

The refresh button is also exposed on the widget's API — call `refresh()` from a bundle script to re-fetch programmatically.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*

> **`submissionId`** — *string or `{ from: 'urlParam', name } | { from: 'api' }`*
> Where the submission id comes from. See **`submissionId` — three sources** above.
>
> **`include`** — *string or string array*
> Additional include params appended to the widget's default include set. De-duplicated.
>
> **`size`** — *string*
> `'sm' | 'md' (default) | 'lg' | 'xl'`. Scales icon sizes, row padding, gaps, and font sizes proportionately.
>
> **`meta`** — *object*
> Metadata section config. Currently the only key is `render` (see **Metadata section** above).
>
> **`activities`** — *object*
> Activities section config — opt-in (the section doesn't render unless this key is present). Keys: `title` (string), `exclude` (string array), `order` (`'asc' | 'desc'`, default `'asc'`), `emptyText` (string template, default `'No activities.'`), `typeTemplates` (object keyed by activity type, case-insensitive, with optional `default` fallback). See **Activities section** above.
>
> **`milestones`** — *object*
> Milestones section config — opt-in. Keys: `showMilestones` (boolean, default `true`), `type` (`'progressBar' | 'thermometer'`, default `'progressBar'`), `position` (`'horizontal'`, default `'horizontal'`), `orderBy` (string — `'createdAt'` or a template, default `'createdAt'`), `title` (string), `emptyText` (string template; presence renders an empty card, absence hides the section when no Milestone activities exist), `statusField` (string — the key inside each milestone's `data` to read, case-insensitive, default `'Status'`), `statusColors` (object mapping status value → DaisyUI color name; both keys and values are matched case-insensitively — used by progressBar for per-dot color, also drives the thermometer's reached-vs-unreached cutoff), `defaultColor` (DaisyUI color name used when a milestone's status isn't in the map AND as the thermometer's unreached-segment color, default `'base-300'`), `gradientStart` / `gradientEnd` (DaisyUI color names for the thermometer's gradient endpoints, default `'warning'` / `'success'`), `reachedStatuses` (case-insensitive list of statuses that explicitly count as "filled" for the thermometer; when omitted, statusColors drives the cutoff — see **Reached vs. unreached** above), `labelPosition` (`'above' | 'below'`, default `'above'`), `labelClassName` (additive class for the `milestoneLabel` slot), `template` (`{ label, render }` — see **Milestones section** above).
>
> **`actionsContainer`** — *array of action groups*
> Actions section config — opt-in. Each entry is `{ type?, position?, label?, icon?, display?, actions: [...] }`. `type` is `'inline'` (default — actions render as a flex row of buttons) or `'dropdown'` (actions collapse behind a trigger button with the group's own label/icon/display). `position` (optional) floats the group into a fixed corner of the widget — one of `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`; omit to keep the group in the in-flow bottom row. Each action is `{ label?, icon?, display?, when?, clickAction?, target?, clickActionLabel? }`. See **Actions section** above.
>
> **`refresh`** — *object*
> Refresh button config. Keys: `enabled` (boolean, default `true`), `icon` (string or `null`, default `'refresh'`), `label` (string, default empty), `position` (`'left' | 'right'`, default `'right'`).
>
> **`missingIdText`** — *string*
> Text rendered when no `submissionId` is available yet (e.g. `from: 'api'` before the setter has been called). Default `'No submission selected.'`.
>
> **`notFoundText`** — *string*
> Text rendered when the API responded but produced no submission. Default `'Submission not found.'`.
>
> **`classNames`** — *object*
> Per-slot class overrides. Each value is either a string (additive) or an object `{ add?: string, remove?: string[] }` for surgical control. Removal is the more reliable customization mechanism — Tailwind's compile-time content scan doesn't see classes typed in form bundles, so adding new classes can silently fail to take effect; removing unwanted defaults always works.
>

> #### Slots
>
> Shared chrome:
>
> - `root` — outer container.
> - `header` — top bar wrapping the refresh button.
> - `refreshButton` — refresh button.
> - `loading` — loading state.
> - `error` — error state.
> - `empty` — empty / missing-id / not-found state.
>
> Meta section:
>
> - `meta` — metadata card wrapper.
> - `metaRow` — one rendered line inside the meta card.
> - `metaPositionLeft` / `metaPositionCenter` / `metaPositionRight` — the three columns of a meta row.
>
> Activities section:
>
> - `activitiesSection` — outer wrapper for the whole activities block (title + list).
> - `activitiesTitle` — optional section heading.
> - `activitiesList` — the list element wrapping every activity card.
> - `activity` — each activity card.
> - `activityRow` — one rendered line inside an activity card.
> - `activityPositionLeft` / `activityPositionCenter` / `activityPositionRight` — the three columns of an activity row.
> - `activitiesEmpty` — the section's empty state (when the list is empty after filtering).
>
> Milestones section:
>
> - `milestonesSection` — outer wrapper for the whole milestones block (title + strip).
> - `milestonesTitle` — optional section heading.
> - `milestones` — the visual strip container (the flex row holding all steps).
> - `milestoneStep` — each step (label + dot + connector pair).
> - `milestoneLabel` — the label above the dot.
> - `milestoneDotRow` — the inner row holding connector / dot / connector.
> - `milestoneDot` — the dot itself.
> - `milestoneConnector` — the connector line between adjacent dots. The first step's leading half and the last step's trailing half use the same slot with `invisible` layered on, so overriding `milestoneConnector` (e.g. swapping the color) keeps the end-step spacing aligned.
> - `milestonesLabelsRow` — the labels row used by the thermometer (and by progressBar with `labelPosition: 'below'`).
> - `thermometer` — the thermometer's outer pill container.
> - `thermometerFill` — the gradient layer behind the bar. Render code adds the `from-*` / `to-*` gradient classes; designers overriding can swap the gradient direction or add layering.
> - `thermometerUnreached` — the gray overlay covering the unreached portion of the bar.
> - `thermometerDivider` — vertical hairlines at each segment boundary.
> - `milestonesEmpty` — the section's empty state (only renders when `emptyText` is supplied and no Milestone activities exist).
> - `milestonePopover` — the HoverCard popover container (when `template.render` is supplied).
> - `milestonePopoverRow` — one rendered line inside the popover.
> - `milestonePopoverPositionLeft` / `milestonePopoverPositionCenter` / `milestonePopoverPositionRight` — the three columns of a popover row.
>
> Actions section:
>
> - `actionsSection` — outer container holding every in-flow group (a flex row that wraps on narrow widths). Positioned groups skip this and render through `actionsCorner` instead.
> - `actionsCorner` — wrapper for each occupied corner of action groups (one per used corner; `position`-classes are layered on top to pin the corner).
> - `actionsGroup` — each `type: 'inline'` group's inner wrapper.
> - `actionButton` — pill-shaped action button (inline groups and dropdown trigger when not icon-only).
> - `actionButtonIcon` — round icon-only action button (inline groups and dropdown trigger when `display: 'icon'`).
> - `actionsDropdownContent` — the Ark Popover content panel for a `type: 'dropdown'` group.
> - `actionsDropdownItem` — each menu item inside a dropdown.
>
> KV content items (used in any render array, in either section):
>
> - `kv` — each label-above-value cell.
> - `kvLabel` — the cell's label text.
> - `kvValue` — the cell's value text.
>
> Unknown slots produce a warning and are ignored.

**`id`** — *string*
Optional id used by `registerWidget` for instance tracking. Pass an id and you can later call `bundle.widgets.SubmissionDetails.get(id)` to access the widget's API.

### API

Retrieve via `bundle.widgets.SubmissionDetails.get(id)`.

- **`refresh()`** — re-fetches the submission.
- **`setSubmissionId(id)`** — switch to a different submission. Pass `null` or `''` to clear back to the missing-id empty state. Overrides whatever the config resolved to on mount.
- **`submission()`** — currently loaded submission object (or `null`).
- **`submissionId()`** — currently active id (or `null`).
- **`loading()`** — `true` while a fetch is in flight.
- **`error()`** — last error from the API, or `null`.
- **`destroy()`** — unmounts the widget.

### Examples

**Minimal — URL-driven id, default metadata layout:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
  },
  id: 'details',
});
```

**Literal id with a custom three-line metadata layout:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: '8c1f4f72-…',
    meta: {
      render: [
        {
          left: ['{{label}}'],
          leftClassName: 'font-semibold text-xl',
          right: ['{{coreState}}'],
          rightClassName: 'text-base-content/60',
        },
        {
          left: ['Submitted by {{submittedBy}}'],
          leftClassName: 'text-sm text-base-content/60',
        },
        {
          left: ['Opened {{format:RelativeTime:createdAt}}'],
          leftClassName: 'text-sm text-base-content/60',
        },
      ],
    },
  },
  id: 'details',
});
```

**API-driven id — bundle script picks the submission later:**

```js
const detailsApi = await bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: { submissionId: { from: 'api' } },
  id: 'details',
});

// Later, in the form's bundle code:
detailsApi.setSubmissionId(currentRow.id);
```

**Metadata + activities with per-type templates:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
    meta: {
      render: [
        {
          left: ['{{label}}'],
          leftClassName: 'font-semibold text-lg',
          right: ['{{coreState}}'],
          rightClassName: 'text-base-content/60',
        },
        {
          left: ['Opened {{format:RelativeTime:createdAt}} by {{submittedBy}}'],
          leftClassName: 'text-sm text-base-content/60',
        },
      ],
    },
    activities: {
      title: 'Activity',
      order: 'asc',
      emptyText: 'No activity for {{submission.handle}} yet.',
      typeTemplates: {
        Approval: [
          {
            left: ['{{format:RelativeTime:createdAt}}'],
            leftClassName: 'text-sm text-base-content/60',
          },
          {
            left: ['{{label}}'],
            leftClassName: 'font-semibold',
            right: ['{{data.Status}}'],
            rightClassName: 'text-sm',
          },
          // Detail panel — KV cells distribute evenly across the row.
          {
            left: [
              { kv: 'Assigned Team', value: '{{data.Assigned Team}}' },
              { kv: 'Assigned Individual', value: '{{data.Assigned Individual}}' },
              { kv: 'Comments', value: '{{data.Comments}}' },
            ],
            className: 'rounded-md bg-base-200',
          },
        ],
        Note: [
          {
            left: ['{{format:RelativeTime:createdAt}} — {{data.Author}}'],
            leftClassName: 'text-sm text-base-content/60',
          },
          { left: ['{{data.Body}}'] },
        ],
        default: [
          {
            left: ['{{format:RelativeTime:createdAt}}'],
            leftClassName: 'text-sm text-base-content/60',
          },
          { left: ['{{label}}'], leftClassName: 'font-semibold' },
          { left: ['{{description}}'], leftClassName: 'text-sm' },
        ],
      },
    },
  },
  id: 'details',
});
```

**Milestones strip with a hover popover and a coordinating activities feed:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
    milestones: {
      title: 'Progress',
      orderBy: '{{data.Order}}',
      // Workflow pre-creates all milestone activities, then updates each
      // one's `data.Status` as the request moves. The widget reads that
      // status (case-insensitively) and colors the dot + the line leading
      // to the next dot from this mapping.
      statusField: 'Status',
      statusColors: {
        Closed: 'success',
        'In Progress': 'warning',
        Open: 'primary',
        'Not Started': 'base-300',
      },
      template: {
        label: '{{label}}',
        render: [
          { left: ['{{label}}'], leftClassName: 'font-semibold' },
          {
            left: ['{{format:RelativeTime:createdAt}}'],
            leftClassName: 'text-sm text-base-content/60',
          },
          {
            left: [
              { kv: 'Status', value: '{{data.Status}}' },
              { kv: 'By', value: '{{data.By}}' },
            ],
          },
        ],
      },
    },
    // The activities feed renders all *non-Milestone* activities.
    activities: {
      title: 'Activity',
      emptyText: 'No activity yet.',
    },
  },
  id: 'details',
});
```

**Thermometer milestones with labels below and the theme-driven default gradient:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
    milestones: {
      type: 'thermometer',
      orderBy: '{{data.Order}}',
      labelPosition: 'below',
      // Default gradient is warning → success. Override here to taste:
      // gradientStart: 'info', gradientEnd: 'accent',
      reachedStatuses: ['Closed', 'In Progress'],
      template: {
        label: '{{label}}',
        // Hovering a label still opens the popover if `template.render` is set.
        render: [
          { left: ['{{label}}'], leftClassName: 'font-semibold' },
          { left: [{ kv: 'Status', value: '{{data.Status}}' }] },
        ],
      },
    },
  },
  id: 'details',
});
```

**Full surface — meta + milestones + activities + actions (clone / cancel / review / overflow):**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
    milestones: {
      orderBy: '{{data.Order}}',
      statusColors: {
        Closed: 'success',
        'In Progress': 'warning',
        Open: 'primary',
        'Not Started': 'base-300',
      },
    },
    activities: { title: 'Activity' },
    actionsContainer: [
      // Primary actions — always visible.
      {
        actions: [
          {
            label: 'Refresh',
            icon: 'refresh',
            display: 'icon',
            clickAction: { type: 'event', name: 'submission-details:refresh' },
          },
          {
            label: 'View Request',
            icon: 'eye',
            display: 'text-icon',
            clickAction: { type: 'internal', path: '/requests/{{id}}/review' },
          },
        ],
      },
      // Overflow dropdown — secondary actions gated on coreState.
      {
        type: 'dropdown',
        label: 'More',
        icon: 'dots-vertical',
        display: 'icon',
        actions: [
          {
            label: 'Clone',
            icon: 'copy',
            clickAction: { type: 'event', name: 'submission-details:clone' },
          },
          {
            label: 'Cancel Request',
            icon: 'x',
            when: submission => submission.coreState === 'Submitted',
            clickAction: { type: 'event', name: 'submission-details:cancel' },
          },
          {
            label: 'Escalate',
            icon: 'arrow-up',
            when: submission => submission.coreState !== 'Closed',
            clickAction: { type: 'event', name: 'submission-details:escalate' },
          },
        ],
      },
    ],
  },
  id: 'details',
});
```

**Corner-positioned actions — top-right view trigger + bottom-right overflow:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
    actionsContainer: [
      // Floats over the top-right corner. First (and only) group → at the corner.
      {
        position: 'top-right',
        actions: [
          {
            label: 'View Request',
            icon: 'eye',
            display: 'text-icon',
            clickAction: { type: 'internal', path: '/requests/{{id}}/review' },
          },
        ],
      },
      // Floats over the bottom-right corner.
      {
        position: 'bottom-right',
        type: 'dropdown',
        label: 'More',
        icon: 'dots-vertical',
        display: 'icon',
        actions: [
          {
            label: 'Clone',
            icon: 'copy',
            clickAction: { type: 'event', name: 'submission-details:clone' },
          },
          {
            label: 'Cancel Request',
            icon: 'x',
            when: submission => submission.coreState === 'Submitted',
            clickAction: { type: 'event', name: 'submission-details:cancel' },
          },
        ],
      },
    ],
  },
  id: 'details',
});
```

**Reach into form attributes via additional include:**

```js
bundle.widgets.SubmissionDetails({
  container: K('content[Details]').element(),
  config: {
    submissionId: { from: 'urlParam', name: 'submissionId' },
    include: ['form.attributesMap[Icon]'],
    meta: {
      render: [
        {
          left: ['{{form.attributesMap.Icon.0}} {{label}}'],
          leftClassName: 'font-semibold text-lg',
        },
      ],
    },
  },
  id: 'details',
});
```

### Notes

- **Default include set** intentionally pulls everything later phases will need (`activities` + its details) so the bundle script doesn't have to remember to add them when the activities / milestones sections light up.
- **State precedence** — when no `submissionId` resolves (typical with `from: 'api'` before the bundle script calls `setSubmissionId`), the widget shows the missing-id empty state rather than a loading spinner.
- **Race guard** — rapid `setSubmissionId` calls drop stale responses on arrival so older data can never paint over newer data.
- **Validation is advisory but blocking** — misshapen configs log a descriptive `console.error` and the initializer returns a rejected Promise. Form designers see the error in the browser console.
