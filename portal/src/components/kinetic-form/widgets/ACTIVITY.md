[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Activity Widget

`Activity` renders form-submission-style activity feeds as a single sorted list. It composes one or more datasources — static JSON, a Kinetic submissions query, or a Kinetic integration — into one merged stream, sorted by a per-source date field, with an icon + description on the left and a status indicator on the right. Pair it with a header refresh button and forward/back pagination when you need a "My Activity" surface in a portal landing page.

```js
// Initialize the Activity widget
bundle.widgets.Activity({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Activity.get(id);
```

### Phasing

This widget is shipping in phases. The scope below is what currently ships. Items marked _(later)_ are part of the design but live in upcoming phases and will be added to this doc as they land.

- **Datasources** — three types (`static`, `kinetic-submissions`, `integration`) — _shipped_
- **Default row render** — icon · description · status — _shipped_
- **Status template** — single string or match-object conditional — _shipped_
- **Sizing** — `sm | md | lg | xl` — _shipped_
- **classNames slot system** — additive strings or `{ add?, remove? }` per slot — _shipped_
- **Refresh button** — label / icon / position — _shipped_
- **Forward/back pagination** — _shipped_
- **Custom `render` config** — multi-position, multi-line layouts with per-row / per-position className overrides — _shipped_
- **`{{format:FMT:path}}` directive** — `RelativeTime` + arbitrary moment format strings — _shipped_
- **Filter dialog** — popover trigger + staged-draft dialog with datasource and status buckets, `sourceMismatch: show | hide`, hardwired (non-user-settable) mode — _shipped_
- **Pagination styles + text** — `forwardBackward` (default) / `pageNumbers` (windowed) / `infiniteScroll`; `pageOfTotal` / `recordRange` / `recordRangeWithTotal` / `both` / `none` text variants — _shipped_
- **Row clickAction** — per-datasource `clickAction` + `target`, template interpolation in values (`{{row.id}}` in paths), `rowInteractive` slot for hover styling — _shipped_
- **`sourceMismatch: 'userChoice'`** — per-source "Show unmatched" toggle inside the filter dialog — _shipped_
- **Data-driven filter buckets** (`status.filterMode: 'datadriven'`) — auto-surface buckets from unique values in loaded data, layered alongside template-defined buckets — _shipped_
- **Sidebar filter** — _v2, documented when scope firms up_

### Datasources

`config.datasources` is a required, non-empty array. Every entry has a unique `name` (used as an internal key), a required `sortField` (lodash path into the row that produces the date/time used to merge sources), and a `type`. The shape of the rest depends on `type`:

#### `type: 'static'`

Use when the rows are already on hand — e.g. assembled by a form's bundle script before the widget mounts.

```js
{
  name: 'announcements',
  type: 'static',
  sortField: 'date',
  data: [
    { id: 'n-1', date: '2026-05-10T12:00:00Z', message: 'New widget shipped' },
    { id: 'n-2', date: '2026-05-15T09:30:00Z', message: 'Theme builder updated' },
  ],
  description: '{{message}}',
}
```

`data` must be an array (omitted → empty source). All other per-source common fields (`description`, `icon`, `status`, `idField`, etc.) work the same as the other types.

#### `type: 'kinetic-submissions'`

Calls `searchSubmissions` from `@kineticdata/react`. Required: `kapp`. Optional: `form` (scopes to a single form). The `search` object is passed straight through to the SDK — use `q`, `include`, `limit`, `orderBy`, etc.

`search.include` is the one shape gotcha — the SDK expects it as an array of strings (`['details', 'values', 'form']`). The widget also accepts a comma-separated string (`'details,values,form'`) and normalizes it before the call, but the array form is canonical.

```js
{
  name: 'my-requests',
  type: 'kinetic-submissions',
  kapp: 'services',
  search: {
    q: 'submittedBy = "matt.howe@kineticdata.com"',
    include: ['details', 'values', 'form', 'form.attributesMap'],
    limit: 100,
  },
  sortField: 'createdAt',
  description: 'Request for {{values.Requested For}}: {{form.name}}',
  status: {
    template: [
      { when: { coreState: 'Submitted' }, render: 'Open ({{values.Status}})', dot: 'success' },
      { when: { coreState: 'Draft' },     render: 'Draft',  dot: 'neutral' },
      { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300' },
      { render: '{{coreState}}' },
    ],
    filterField: 'coreState',
  },
}
```

The widget queries each datasource exactly once on mount (and again on `refresh()`); it does not paginate at the API. Use `search.limit` to bound the per-source fetch.

#### `type: 'integration'`

Reuses the integration plumbing from `integration.js` (`useIntegration` / `BundleMenu`). The `integration` block requires `kappSlug`, `integrationName`, and `listProperty` (path to the array of rows inside the response). Optional: `formSlug`, `parameters`, `errorProperty`.

```js
{
  name: 'tickets',
  type: 'integration',
  integration: {
    kappSlug: 'services',
    integrationName: 'list-my-tickets',
    listProperty: 'tickets',
    parameters: { username: 'matt' },
  },
  sortField: 'opened_at',
  description: '{{summary}}',
  icon: 'ticket',
  status: {
    template: [
      { when: { state: 'open' },   render: 'Open' },
      { when: { state: 'closed' }, render: 'Closed' },
    ],
  },
}
```

### Per-datasource common fields

All optional unless noted.

| Field            | Type              | Purpose                                                                                            |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `name`           | string (required) | Unique key for the source; appears in error messages, used to tag rows internally.                 |
| `label`          | string            | Human-readable label (used by the filter UI in later phases; safe to set now).                     |
| `sortField`      | string (required) | Lodash path into the row producing the merge/sort value. Sort is descending (most recent first).   |
| `idField`        | string            | Lodash path to the row's unique id. Default: `'id'`. Used as the React key and for action handlers.|
| `referenceField` | string            | Lodash path to a user-facing reference (e.g. a `handle` or ticket number). Defaults to `idField`.  |
| `description`    | string            | Template for the description text. `{{path}}` segments are lodash-`get` into the row.              |
| `icon`           | string            | Static [Tabler](https://tabler-icons.io/) icon name OR a template that resolves to one.            |
| `status`         | object            | `{ template, dot?, filterField?, filterMode? }`. See **Status template** and the **Filter** section for `filterMode: 'datadriven'`.                                                                                                                                                                                          |
| `clickAction`    | object            | Per-row click behavior. Reuses the shared chrome-utils system (`type: 'internal' | 'external' | 'home' | 'event' | 'openSearch' | 'none'`). String values are interpolated against the row — `path: '/requests/{{row.id}}'`. See **Row click** below. |
| `target`         | string or object  | Where the click goes — `'current'` / `'new'` / `'modal'` / `{ type: 'container', id }`. Reuses the chrome-utils target system; defaults to `'current'`.                                                  |
| `clickActionLabel` | string          | Template for the row's aria-label when clickable. Falls back to a sensible default per clickAction type.                                                                                                |

### Template syntax

Inside `description`, `status.template` (and any `status.template[*].render`), `icon`, and the per-position content arrays of `config.render`, the following `{{...}}` tokens resolve at render time:

- **`{{path}}`** or **`{{row.path}}`** — `_.get(row, path)`. Both forms are equivalent; pick whichever reads better. `row.X` is explicit; bare `X` matches the existing convention used by `BundleMenu`'s `itemMap`.
- **`{{datasource.k}}`** — `k` ∈ `name | label | icon | description | status | iconSpacer`. Reads the per-row resolved bag: `icon` is the icon name the datasource's `icon` template resolved to; `description` and `status` are the rendered strings from those templates. Most useful inside `config.render`.
- **`{{format:FMT:path}}`** — formatting directive. Parser splits on the **last** colon so format strings can contain colons (`YYYY-MM-DD HH:mm:ss`). `FMT === 'RelativeTime'` renders "about 1 year ago" via date-fns `formatDistance`; any other `FMT` is treated as a [moment](https://momentjs.com/docs/#/displaying/format/) format string. Unparseable values render as the empty string.

Missing values resolve to the empty string rather than throwing, so a typo in a path shows up visually rather than as a runtime error.

### Custom render

By default each activity row shows the icon + description on the left and the status + colored dot on the right. To override the layout — including multiple stacked lines per row, three-column layouts, or mixing format directives with row data — supply `config.render`.

```js
config.render = [
  {
    left: ['{{datasource.icon}}', '{{datasource.description}}'],
    center: ['{{format:RelativeTime:row.createdAt}}'],
    right: ['{{datasource.status}}'],
  },
  {
    left: ['{{datasource.iconSpacer}}', '{{values.Detailed Description}}'],
  },
];
```

Each entry in the array renders as one **line** stacked vertically inside the activity row's card. Each line has three optional positions (`left`, `center`, `right`); positions you omit produce no element for that column. Each position is an array of **content items** — strings that interpolate against the row + the resolved datasource bag.

Three tokens get special rendering when they appear as a standalone content item (the entire string):

- **`{{datasource.icon}}`** — renders the icon for this row inside the `iconBox` slot. Falls back to an invisible icon-sized spacer when this row's icon template resolved to empty but any other datasource in the config declares an icon — keeps the icon column aligned across mixed-icon configs.
- **`{{datasource.iconSpacer}}`** — explicit invisible icon-sized box. Use it on a stacked second line to indent text past the icon column.
- **`{{datasource.status}}`** — status text plus the colored status dot, matching the default-render look.

Any other string (including ones with embedded `{{...}}` tokens) interpolates and renders as a plain `<span>`. The shortcut `{{datasource.description}}` standalone wraps the description in the `description` slot so long descriptions ellipsize the same way they do by default.

#### Per-render-row class overrides

`render` entries can include sibling `className` keys to override styling on a per-line / per-position basis without going through the top-level `classNames`. These layer **on top of** the slot defaults; they don't replace them.

```js
config.render = [
  {
    className: 'border-b border-base-200',
    left: ['{{datasource.icon}}', '{{datasource.description}}'],
    leftClassName: 'gap-3',
    right: ['{{datasource.status}}'],
    rightClassName: 'text-xs',
  },
  {
    className: 'pt-1',
    left: ['{{datasource.iconSpacer}}', '{{values.Notes}}'],
    leftClassName: 'text-sm text-base-content/60',
  },
];
```

Recognized keys per entry: `className` (the whole render-row container), `leftClassName`, `centerClassName`, `rightClassName`.

### Status template

`status.template` accepts either form:

**Plain string** — interpolated against the row.

```js
status: { template: '{{coreState}}' }
```

**Match-object array** — entries are tried in order; the first whose `when` object fully matches the row wins. Every key in `when` must equality-match (`===`) the lodash-`get` value at that path on the row. An entry with no `when` is the catch-all fallback (omit it to leave unmatched rows blank).

```js
status: {
  template: [
    { when: { coreState: 'Submitted' }, render: 'Open ({{values.Status}})' },
    { when: { coreState: 'Draft' },     render: 'Draft' },
    { when: { coreState: 'Closed' },    render: 'Closed' },
    { render: '{{coreState}}' },
  ],
}
```

#### Status dot

A small colored dot can render next to the status text — useful for at-a-glance state ("Open" + green, "Closed" + gray, etc.). The dot is **opt-in**; without configuration no dot renders.

- **`status.dot`** — _string_. Datasource-level default color. Applies to every row in this datasource that doesn't override it at the entry level.
- **`status.template[i].dot`** — _string or `false`_. Per-matched-entry color (the common case for state-driven coloring). `false` explicitly suppresses the dot for that entry, even when `status.dot` would otherwise apply.

Recognized color names: `success`, `warning`, `error`, `info`, `primary`, `secondary`, `accent`, `neutral`, `base-100`, `base-200`, `base-300`, `base-content`. (These map to the DaisyUI semantic palette. Other values fail validation — keep the surface narrow so dots stay theme-aware.)

```js
status: {
  template: [
    { when: { coreState: 'Submitted' }, render: 'Open',  dot: 'success' },
    { when: { coreState: 'Draft' },     render: 'Draft', dot: 'neutral' },
    { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300' },
    { render: '{{coreState}}' },
  ],
}
```

**Spacer behavior**: when *any* datasource configures a dot anywhere, every row reserves dot-width inside `{{datasource.status}}` — so an Activity widget mixing one dot-enabled source with one dot-less source keeps the status column aligned across rows.

### Filter

`config.filter` enables a popover dialog that lets the user narrow the merged list by **datasource** and/or **status bucket**. Filter buckets come from one or both of:

1. **Template-defined**: each `status.template` entry with a `when` clause is one bucket. Designers get pretty labels + dot colors for known states.
2. **Data-driven** (opt-in via `status.filterMode: 'datadriven'`): the widget walks the loaded rows and auto-adds any unique `filterField` value that isn't already covered by a single-key template `when`. Designers don't have to enumerate every possible value — unexpected statuses surface automatically.

```js
config.filter = {
  userSettable: true,             // default true. false = filter is hardwired, no dialog renders.
  options: 'full',                // 'full' (default) | 'datasource' | 'status'.
  sourceMismatch: 'show',         // 'show' (default) | 'hide' | 'userChoice'.
  position: 'right',              // 'left' | 'right'. Header placement.
  allLabel: 'All activity',       // trigger button label when no filters are active.
  active: {                       // initial filter state.
    datasources: ['requests'],
    statuses: { requests: ['open', 'draft'] },
    showUnmatched: { requests: true }, // userChoice mode only; default true per source.
  },
};
```

**Bucket identifiers** — each match-object entry gets a stable key used in `filter.active.statuses` and internally for selection tracking. Designers should give entries an explicit `value` to lock the identifier across config edits; without one, the widget falls back to `auto-<index>`, which moves when the entry order changes. Datadriven buckets use the raw `filterField` value (stringified) as the key.

```js
status: {
  template: [
    { when: { coreState: 'Submitted' }, render: 'Open',  dot: 'success', value: 'open' },
    { when: { coreState: 'Draft' },     render: 'Draft', dot: 'neutral', value: 'draft' },
    { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300', value: 'closed' },
    { render: '{{coreState}}' },
  ],
}
```

**Optional `label`** — overrides the filter-UI button text per entry. Defaults to the `render` text with `{{...}}` tokens stripped, then to the bucket key.

**`options`** — gates which sections render in the dialog:

- `'full'` _(default)_ — datasource section (when `>1 source`) + status section.
- `'datasource'` — datasource section only.
- `'status'` — status section only.

**`sourceMismatch`** — controls what happens to rows whose status didn't land in any defined bucket (in template-mode: a `when`-less fallback matched, or nothing matched; in datadriven-mode: the row has no `filterField` value at all) when a status filter is active for their source:

- `'show'` _(default)_ — let them through regardless of the status filter.
- `'hide'` — drop them.
- `'userChoice'` — surface a per-source **Show unmatched** toggle inside the dialog so the user picks. The toggle's per-source default lives in `filter.active.showUnmatched[<source>]` (default `true`).

**`userSettable: false`** — hides the trigger button entirely. `filter.active` still applies, so this is the way to hardwire a filter into the widget (e.g., always-show-Open).

**Trigger button label** — `allLabel` when no filter is active, otherwise a comma-joined summary of selected bucket / source labels, capped at 3 entries with a `+N` overflow indicator.

**Dialog UX** — changes inside the dialog stage locally; **Show Results** commits and closes; **Clear filters** resets the draft to empty; the **X** in the header closes without applying. Applying a new filter also resets the pagination to page 1.

#### Datadriven mode

Set `status.filterMode: 'datadriven'` on a datasource (and provide `status.filterField`) to make the widget enumerate filter buckets from actual loaded data. Template entries still drive how each row's status text + dot render; datadriven mode only adds extra buckets for values the template doesn't cover.

```js
status: {
  filterField: 'coreState',       // required when filterMode is 'datadriven'
  filterMode: 'datadriven',
  template: [
    { when: { coreState: 'Submitted' }, render: 'Open', dot: 'success', value: 'open' },
    { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300', value: 'closed' },
    // No need to enumerate 'Draft', 'Pending', etc. — they auto-appear in the filter UI
    // if they show up in real data.
  ],
}
```

Notes:

- Datadriven buckets use the raw value as both `key` and `label` and have no dot.
- A row whose `filterField` value matches a template entry's single-key `when` bucket-keys to that entry (so dot + label + selection state line up).
- A row whose `filterField` value doesn't match any template entry bucket-keys to the raw value. The filter UI shows that raw-value bucket.
- Rows where `filterField` itself is missing/null still count as unmatched and fall through to `sourceMismatch`.

### Row click

Each datasource can declare a row-level `clickAction` so clicking anywhere on a row navigates or fires an event. This reuses the same `clickAction` + `target` system the chrome widgets (`BundleLink`, `BundleAvatar`, `Profile` action buttons, etc.) use — read [Chrome Widget Actions](CHROME_ACTIONS.md) for the full reference; this section just covers what's specific to the Activity widget.

```js
{
  name: 'requests',
  type: 'kinetic-submissions',
  // …
  clickAction: { type: 'internal', path: '/requests/{{row.id}}' },
  target: 'current',
  clickActionLabel: 'View {{form.name}} request',
}
```

- All string values inside `clickAction` and `target` are interpolated against the row context, so `path: '/requests/{{row.id}}'` or `url: 'https://tickets.example.com/{{ticketId}}'` work per-row.
- The interpolated `clickAction` then routes through the shared `ClickActionWrapper`, which picks the element: `<a>` for `target: 'current'` / `'new'`, `<button>` for `target: 'modal'` / `'container'` / `event` / `openSearch`.
- `clickActionLabel` becomes the row's `aria-label` (templated). When omitted, the wrapper falls back to a sensible default per clickAction type (e.g. `'Home'` for `type: 'home'`).
- The row gets `cursor-pointer hover:bg-base-200 transition-colors` styling via the `rowInteractive` slot, layered on top of `row`. Override either slot to restyle.
- Non-interactive rows (no `clickAction` or `clickAction.type === 'none'`) stay rendered as a plain `<div>` — no behavior change for static feeds.
- Mixed configs are fine: with one source clickable and another not, only the clickable source's rows pick up the hover affordance.

```js
// Drill into a request detail page in a modal:
clickAction: { type: 'internal', path: '/requests/{{row.id}}' },
target: { type: 'modal', size: 'lg', title: '{{form.name}}' },
```

```js
// Fire a custom DOM event the form bundle's JS listens for:
clickAction: { type: 'event', name: 'activity-row-clicked' },
```

#### Event payload for row clicks

When a row's `clickAction.type` is `'event'`, the Activity widget auto-populates `event.detail.data` with the two fields a handler almost always needs:

```js
bundle.utils.onWidgetEvent('activity-row-clicked', e => {
  // e.detail.data = { datasource: 'requests', id: 'abc123' }
  // (datasource = the datasource's `name`; id = the row's `idField` value)
});
```

To carry more — additional row fields, the form name, anything else — write a `data` block in the clickAction. Activity interpolates it against the row context like the rest of the clickAction, and any keys you provide **override** the auto-defaults (so you can rename `id` to something domain-specific like `requestId`):

```js
clickAction: {
  type: 'event',
  name: 'activity-row-clicked',
  data: {
    requestId: '{{row.id}}',
    formSlug: '{{form.slug}}',
    submittedAt: '{{row.submittedAt}}',
  },
}
// e.detail.data = {
//   datasource: 'requests',     // auto (designer didn't supply it)
//   id: 'abc123',               // auto (designer didn't supply it)
//   requestId: 'abc123',        // from designer's data block
//   formSlug: 'purchase-request',
//   submittedAt: '2026-05-12T...',
// }
```

See [Chrome Widget Actions — Listening for `event` clickActions](CHROME_ACTIONS.md#listening-for-event-clickactions) for the full `event.detail` shape across all chrome widgets.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*
All non-`datasources` fields optional.

> **`datasources`** — *Array, required*
> Non-empty array of datasource configs. See **Datasources** above.
>
> **`size`** — *string*
> `'sm' | 'md' (default) | 'lg' | 'xl'`. Scales icon sizes, row padding, gaps, font sizes, and pagination control sizes proportionately.
>
> | size | row icon | row padding | row gap   | text       | status dot |
> | ---- | -------- | ----------- | --------- | ---------- | ---------- |
> | sm   | 18 px    | `py-2 px-4` | `gap-3`   | `text-sm`  | `h-1.5 w-1.5` |
> | md   | 22 px    | `py-3 px-5` | `gap-4`   | `text-base`| `h-2 w-2`     |
> | lg   | 26 px    | `py-4 px-6` | `gap-5`   | `text-lg`  | `h-2.5 w-2.5` |
> | xl   | 30 px    | `py-5 px-7` | `gap-6`   | `text-xl`  | `h-3 w-3`     |
>
> **`render`** — *Array*
> Custom row-render configuration. See **Custom render** above for the full grammar and special tokens. Each entry is one stacked line inside the activity row; each entry has up to three positions (`left`, `center`, `right`) plus optional `className` / `leftClassName` / `centerClassName` / `rightClassName` sibling keys. When omitted, the widget renders the default `[icon][description] ... [status]` layout.
>
> **`filter`** — *object*
> Filter dialog config. See **Filter** above. Keys: `userSettable` (boolean, default `true`), `options` (`'full' | 'datasource' | 'status'`, default `'full'`), `sourceMismatch` (`'show' | 'hide' | 'userChoice'`, default `'show'`), `position` (`'left' | 'right'`, default `'right'`), `allLabel` (string, default `'All activity'`), `active` (`{ datasources?, statuses?, showUnmatched? }`).
>
> **`pagination`** — *object*
> Pagination settings.
>
> - **`recordsPerPage`** — _number, default `25`_. Page size for client-side pagination (also the batch size for `infiniteScroll`).
> - **`maxReturned`** — _number or `'all'`, default `'all'`_. Cap on the merged result set after sort. `0` and `'all'` both mean unlimited. Useful for "most recent N" feeds; not a per-source limit (use `search.limit` for that).
> - **`style`** — _string_. `'forwardBackward'` _(default)_ — prev / text / next. `'pageNumbers'` — windowed `< 1 2 3 … 10 >` page buttons. `'infiniteScroll'` — no buttons; the bottom of the list watches for the viewport via `IntersectionObserver` and appends the next batch when the sentinel scrolls into view.
> - **`text`** — _string, default `'pageOfTotal'`_. In-bar text variant. `'pageOfTotal'` = `Page 1 of 5`; `'recordRange'` = `Records 1 to 25`; `'recordRangeWithTotal'` = `Records 1 to 25 of 42`; `'both'` = `Page 1 of 5 · Records 1 to 25`; `'none'` hides the text entirely. Ignored by `infiniteScroll` (the bottom indicator stands in for it).
> - **`pageNumbersWindow`** — _number, default `1`_. For `pageNumbers` style: how many pages to show on each side of the current page before collapsing to `…`. The first and last pages always show.
> - **`scrollLoadingText`** — _string, default `'Scroll for more'`_. Indicator text when more rows are available in `infiniteScroll` style.
> - **`scrollEndText`** — _string, default `'No more records'`_. Indicator text when the list is fully loaded in `infiniteScroll` style.
>
> **`refresh`** — *object*
> Refresh control settings.
>
> - **`enabled`** — _boolean, default `true`_. Set `false` to hide the button entirely.
> - **`icon`** — _string or `null`, default `'refresh'`_. Tabler icon name; `null` hides the icon.
> - **`label`** — _string_. Visible label next to (or instead of) the icon. Default empty.
> - **`position`** — _`'left' | 'right'`, default `'right'`_. Where the button sits in the header.
>
> **`classNames`** — *object*
> Per-slot class overrides. Each value is either a string (additive — concatenated on top of widget defaults via `clsx`) or an object `{ add?: string, remove?: string[] }` for surgical control: `remove` strips the listed tokens from defaults before `add` appends. Removal is the more reliable customization mechanism — Tailwind's compile-time content scan doesn't see classes typed in form bundles, so adding new classes can silently fail to take effect; removing unwanted defaults always works.

> #### Slots
>
> Recognized slot names (unknown slots produce a warning and are ignored):
>
> - `root` — outer container.
> - `header` — top bar wrapping the refresh button.
> - `list` — wrapper around the rows.
> - `row` — each activity row's outer element. Stacks one or more `renderRow`s vertically.
> - `rowInteractive` — layered on top of `row` when the datasource declares a `clickAction`. Resets the button / anchor defaults (text alignment, underline, color) and adds the hover affordance (`cursor-pointer`, `hover:bg-base-200`).
> - `renderRow` — one rendered line inside an activity row (one per `config.render` entry, or one for the default render). Flex row of three positions.
> - `positionLeft` / `positionCenter` / `positionRight` — the three columns of a `renderRow`. All three are `flex-1` with different `justify-content` so 2- or 3-column layouts both lay out cleanly.
> - `iconBox` — circular icon background.
> - `description` — description text.
> - `statusText` — status text.
> - `statusDot` — colored dot rendered next to the status text.
> - `pagination` — pagination bar.
> - `paginationText` — in-bar pagination text (Page N of X / record range / both / etc.).
> - `prevButton` / `nextButton` — pagination prev / next buttons.
> - `pageNumber` / `pageNumberActive` / `pageNumberEllipsis` — page-number buttons + active variant + `…` separator (used by the `pageNumbers` style).
> - `infiniteScrollSentinel` — bottom-of-list sentinel container that triggers the next batch when scrolled into view (`infiniteScroll` style).
> - `infiniteScrollText` — "Scroll for more" / "No more records" indicator text.
> - `filterTrigger` / `filterTriggerLabel` — header button that opens the filter dialog; label inside it.
> - `filterDialog` — the popover panel.
> - `filterDialogHeader` / `filterDialogTitle` / `filterDialogClose` — the dialog header row and its parts.
> - `filterGroup` / `filterGroupTitle` — each section in the dialog (Sources, Status…) and its subheading.
> - `filterButtonRow` — the wrap-flex container of toggle buttons inside a section.
> - `filterButton` / `filterButtonActive` — each toggle button; `filterButtonActive` layers on top when the button is selected.
> - `filterDot` — small dot rendered inside a status filter button when the bucket has a dot color.
> - `filterFooter` — bottom row of the dialog containing Clear / Show Results.
> - `filterClearButton` / `filterApplyButton` — the two footer buttons.
> - `refreshButton` — refresh button.
> - `empty` — "no activity" empty state.
> - `loading` — loading state.
> - `error` — per-source error chip rendered above the list.

**`id`** — *string*
Optional id used by `registerWidget` for instance tracking. Pass an id and you can later call `bundle.widgets.Activity.get(id)` to access the widget's API.

### API

Retrieve via `bundle.widgets.Activity.get(id)`.

- **`refresh()`** — re-fetches every datasource (via the same loaders the widget uses on mount). The widget shows the loading state until every loader has resolved.
- **`destroy()`** — unmounts the widget.

### Loading discipline

All datasources fire in parallel. The widget holds the loading state until **every** loader has resolved (success or error) — partial data is never rendered. Per-source failures are collected separately so the rest of the feed still renders; failing sources surface as red error chips above the list with the source `name` and the failure message.

### Examples

**Minimal — single Kinetic submissions source, default render:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [
      {
        name: 'requests',
        type: 'kinetic-submissions',
        kapp: 'services',
        search: {
          q: 'submittedBy = "matt.howe@kineticdata.com"',
          include: ['details', 'values', 'form'],
          limit: 50,
        },
        sortField: 'createdAt',
        icon: 'shopping-cart',
        description: '{{form.name}} request',
        status: {
          template: [
            { when: { coreState: 'Submitted' }, render: 'Open',  dot: 'success' },
            { when: { coreState: 'Draft' },     render: 'Draft', dot: 'neutral' },
            { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300' },
          ],
          filterField: 'coreState',
        },
      },
    ],
    pagination: { recordsPerPage: 10 },
  },
  id: 'activity',
});
```

**Two sources merged — Kinetic submissions + integration:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    size: 'lg',
    datasources: [
      {
        name: 'requests',
        label: 'Requests',
        type: 'kinetic-submissions',
        kapp: 'services',
        search: {
          q: 'submittedBy = "me"',
          limit: 100,
          include: ['details', 'values', 'form'],
        },
        sortField: 'createdAt',
        icon: 'shopping-cart',
        description: 'Request for {{values.Requested For}}: {{form.name}}',
        status: {
          template: [
            { when: { coreState: 'Submitted' }, render: 'Open' },
            { when: { coreState: 'Closed' },    render: 'Closed' },
          ],
        },
      },
      {
        name: 'tickets',
        label: 'Service Desk Tickets',
        type: 'integration',
        integration: {
          kappSlug: 'services',
          integrationName: 'service-desk-list',
          listProperty: 'tickets',
        },
        sortField: 'opened_at',
        icon: 'ticket',
        description: '{{summary}}',
        status: {
          template: [
            { when: { state: 'open' },   render: 'Open' },
            { when: { state: 'closed' }, render: 'Closed' },
          ],
        },
      },
    ],
    refresh: { label: 'Refresh', position: 'right' },
    pagination: { recordsPerPage: 15 },
  },
  id: 'activity',
});
```

**Two-line custom render — description on top, detail + relative time underneath:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [
      {
        name: 'requests',
        type: 'kinetic-submissions',
        kapp: 'services',
        search: {
          q: 'submittedBy = "me"',
          include: ['details', 'values', 'form'],
          limit: 100,
        },
        sortField: 'createdAt',
        icon: 'shopping-cart',
        description: 'Request for {{values.Requested For}}: {{form.name}}',
        status: {
          template: [
            { when: { coreState: 'Submitted' }, render: 'Open ({{values.Status}})' },
            { when: { coreState: 'Draft' },     render: 'Draft' },
            { when: { coreState: 'Closed' },    render: 'Closed' },
          ],
        },
      },
    ],
    render: [
      {
        left: ['{{datasource.icon}}', '{{datasource.description}}'],
        center: ['Submitted {{format:RelativeTime:row.createdAt}}'],
        right: ['{{datasource.status}}'],
      },
      {
        left: ['{{datasource.iconSpacer}}', '{{values.Detailed Description}}'],
        leftClassName: 'text-sm text-base-content/60',
      },
    ],
    pagination: { recordsPerPage: 10 },
  },
  id: 'activity',
});
```

**Filterable feed — single source, status buckets with dots:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [
      {
        name: 'requests',
        label: 'Requests',
        type: 'kinetic-submissions',
        kapp: 'services',
        search: {
          q: 'submittedBy = "me"',
          include: ['details', 'values', 'form'],
          limit: 100,
        },
        sortField: 'createdAt',
        icon: 'shopping-cart',
        description: 'Request for {{values.Requested For}}: {{form.name}}',
        status: {
          template: [
            { when: { coreState: 'Submitted' }, render: 'Open',  dot: 'success', value: 'open' },
            { when: { coreState: 'Draft' },     render: 'Draft', dot: 'neutral', value: 'draft' },
            { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300', value: 'closed' },
          ],
        },
      },
    ],
    filter: {
      allLabel: 'All requests',
      active: { statuses: { requests: ['open'] } },
    },
    pagination: { recordsPerPage: 10 },
  },
  id: 'activity',
});
```

**Page-numbers pagination with both text variants:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [/* …same as above… */],
    pagination: {
      style: 'pageNumbers',
      text: 'both',
      recordsPerPage: 20,
      pageNumbersWindow: 2,
    },
  },
  id: 'activity',
});
```

**Infinite scroll feed:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [/* …same as above… */],
    pagination: {
      style: 'infiniteScroll',
      recordsPerPage: 25,
      scrollLoadingText: 'Loading more…',
      scrollEndText: 'You\'re all caught up.',
    },
  },
  id: 'activity',
});
```

**Datadriven status filter with user-controlled unmatched-rows toggle:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [
      {
        name: 'requests',
        type: 'kinetic-submissions',
        kapp: 'services',
        search: {
          q: 'submittedBy = "me"',
          include: ['details', 'values', 'form'],
          limit: 200,
        },
        sortField: 'createdAt',
        icon: 'shopping-cart',
        description: '{{form.name}} request',
        status: {
          filterField: 'coreState',
          filterMode: 'datadriven',
          template: [
            // Known states get pretty labels + dots.
            { when: { coreState: 'Submitted' }, render: 'Open',   dot: 'success',  value: 'open' },
            { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300', value: 'closed' },
            // Anything else (Draft, Pending, …) auto-appears in the filter UI.
          ],
        },
      },
    ],
    filter: {
      allLabel: 'All requests',
      sourceMismatch: 'userChoice',
    },
    pagination: { recordsPerPage: 15 },
  },
  id: 'activity',
});
```

**Clickable rows that open the request detail in a modal:**

```js
bundle.widgets.Activity({
  container: K('content[Activity]').element(),
  config: {
    datasources: [
      {
        name: 'requests',
        type: 'kinetic-submissions',
        kapp: 'services',
        search: {
          q: 'submittedBy = "me"',
          include: ['details', 'values', 'form'],
          limit: 100,
        },
        sortField: 'createdAt',
        icon: 'shopping-cart',
        description: 'Request for {{values.Requested For}}: {{form.name}}',
        status: {
          template: [
            { when: { coreState: 'Submitted' }, render: 'Open',  dot: 'success', value: 'open' },
            { when: { coreState: 'Closed' },    render: 'Closed', dot: 'base-300', value: 'closed' },
          ],
        },
        clickAction: { type: 'internal', path: '/requests/{{row.id}}' },
        target: { type: 'modal', size: 'lg', title: '{{form.name}}' },
        clickActionLabel: 'View {{form.name}} request',
      },
    ],
    pagination: { recordsPerPage: 10 },
  },
  id: 'activity',
});
```

### Notes

- **Sort order** is descending by `sortField` — most recent first. Rows with a missing or unparseable sort value sink to the bottom.
- **Icon column reserves space** when *any* datasource declares an `icon`, so rows from a no-icon source still align with rows from an icon source.
- **Validation is advisory but blocking**: misshapen configs log a descriptive `console.error` and the initializer returns a rejected Promise. Form designers see the error in the browser console.
- Applying a filter resets pagination to page 1 so we never land on a now-empty page.
