[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Kapps Widget

`Kapps` renders the kapps the current user can see — as **pills**, square **tiles**, or rich **cards** — into a content element on the form. Built for space landing pages, but works anywhere you want a "pick a kapp" surface. Each item links to its kapp landing page (`/kapps/<slug>`).

```js
// Initialize the Kapps widget
bundle.widgets.Kapps({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Kapps.get(id);
```

### Per-kapp `Display - *` attributes

The widget reads optional kapp attributes — every one is opt-in. Set them on a kapp to influence how that kapp is presented; leave them blank to fall through to a sensible default.

| Attribute              | Multi | Purpose                                                                                   |
| ---------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `Display - Category`   | yes   | Used by `filter` and `groupBy`. A kapp with multiple categories appears in each group.    |
| `Display - Description`| no    | Card body copy. Falls back to the kapp's own `description` field when empty.              |
| `Display - Icon`       | no    | [Tabler](https://tabler-icons.io/) icon name (e.g. `settings`, `users`, `chart-bar`).     |
| `Display - Color`      | no    | Accent color — daisy semantic key (`primary`, `success`, …) or hex. Renders as a border.  |
| `Display - Hidden`     | no    | `'true'` hides the kapp from the widget by default. Override with `includeHidden: true`.  |
| `Display - Order`      | no    | Numeric sort key for `sort: 'order'`. Lower values appear first. Non-numeric → end.       |

All `Display - *` attribute definitions are declared in the [bundle manifest](../../../helpers/bundle-manifest.js) so Space Settings can surface and deploy them.

### Types

Pick the type with `config.type`:

- **`'pill'`** — wide, single-row chips. Equal height across rows (a generous `min-height` accommodates 2-line names). Best for compact, link-style lists.
- **`'tile'`** _(default)_ — square, icon-centric tiles arranged in a grid. Excellent at variable-length names because the icon dominates and the name sits below. The app-launcher look — likely the right default for a landing page.
- **`'card'`** — vertical cards with optional icon, name, and description. Equal heights enforced via `grid-auto-rows: 1fr`. Descriptions clamp to two lines.

Columns are not configurable — the widget uses CSS Grid `auto-fit` with a min column width that scales with `size`. Containers get as many columns as fit.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*
An object of configurations for the widget. All fields optional.

> #### Presentation
>
> **`type`** — *string*
> `'pill' | 'tile' (default) | 'card'`.
>
> **`size`** — *string*
> `'sm' | 'md' (default) | 'lg' | 'xl'`. Scales padding, font size, icon size, and the grid's minimum column width.
>
> **`showIcon`** — *boolean*
> Render `Display - Icon`. Default `true`.
>
> **`showName`** — *boolean*
> Render the kapp name. Default `true`. Set to `false` for icon-only tiles in a tight space.
>
> **`showDescription`** — *boolean*
> Render the description (card type only). Default `true`. Ignored for pill / tile.
>
> **`iconPlacement`** — *string*
> Where the icon sits. `'auto'` (default) resolves per type — see table below. An invalid value for the current type silently falls back to `'auto'`'s value.
>
> | type   | auto         | other allowed values                                  |
> | ------ | ------------ | ----------------------------------------------------- |
> | pill   | `'left'`     | `'left'`, `'right'`, `'none'`                         |
> | tile   | `'top'`      | `'top'`, `'none'`                                     |
> | card   | `'hero'`     | `'hero'`, `'top-banner'`, `'inline-left'`, `'none'`   |
>
> **`accentPlacement`** — *string*
> Where the `Display - Color` accent border renders. `'auto'` (default) resolves per type — pill → `'none'`; tile → `'top'`; card → `'left'`. Other values: `'left'`, `'top'`, `'right'`, `'bottom'`, `'none'`. Semantic color keys resolve to daisyUI CSS variables so the accent tracks the active theme.
>
> #### Filtering
>
> **`filter`** — *string or Array of strings*
> Restrict to kapps whose `Display - Category` matches any of these values. Matches against the raw attribute text (case-sensitive). When omitted, all categories pass through.
>
> **`include`** — *Array of strings*
> Allowlist of kapp slugs. Only listed slugs are eligible to render.
>
> **`exclude`** — *Array of strings*
> Denylist of kapp slugs. Listed slugs are removed before grouping.
>
> **`includeHidden`** — *boolean*
> Default `false`. When `true`, kapps with `Display - Hidden = 'true'` are still shown — useful for an admin-only Kapps view.
>
> #### Grouping
>
> **`groupBy`** — *string*
> `'category'` to render section headings keyed on `Display - Category`. Omitted or `null` (default) renders a flat grid.
>
> When grouped, a kapp with multiple categories appears in **each** of its groups. Kapps with no category go into a final "Other" bucket. Empty groups never render.
>
> **`ungroupedLabel`** — *string*
> Section label for the no-category bucket. Default `'Other'`.
>
> **`accordion`** — *string*
> Group expansion behavior. Ignored when `groupBy` is null.
>
> - `'all-open'` _(default)_ — all groups expanded; click any heading to collapse.
> - `'first-open'` — first group expanded, the rest collapsed.
> - `'all-closed'` — all collapsed; click to expand.
> - `'off'` — all expanded, headings not clickable (no toggle UI).
>
> State is **in-session only** — collapsing a group never persists across page reloads. New categories that appear after mount initialize per the accordion default while keeping existing toggles.
>
> #### Sort
>
> **`sort`** — *string*
> `'order'` _(default)_ — sort by `Display - Order` numerically, missing or non-numeric values sort to the end, ties break alphabetically by name. `'name'` — pure alphabetical.
>
> `Display - Order` is stored as text on the kapp record; the widget parses it with `parseFloat` before comparing.
>
> #### States
>
> **`emptyText`** — *string*
> Rendered when zero kapps are visible after filtering and access checks. Default `'No kapps to display'`. Empty groups never get a per-group empty message — they simply don't render.
>
> #### Escape hatch
>
> **`className`** — *string*
> Extra classes on the root element. Additive.

**`id`** — *string*
Optional id used by the widget machinery for instance tracking. Required if you want to call API methods on the widget after it mounts.

### API

**`update(patch)`** — *Function*
Merges `patch` into the widget's config and re-renders. Works for any field.

```js
bundle.widgets.Kapps.get('home').update({ filter: 'admin', sort: 'name' });
```

### Examples

#### Landing page — grouped cards with first group open

```js
bundle.widgets.Kapps({
  container: K('content[Kapps]').element(),
  config: {
    type: 'card',
    size: 'lg',
    groupBy: 'category',
    accordion: 'first-open',
  },
  id: 'space-home',
});
```

#### App-launcher tiles, no description, icon only

```js
bundle.widgets.Kapps({
  container: K('content[Launcher]').element(),
  config: {
    type: 'tile',
    size: 'md',
    showName: false,
  },
  id: 'launcher',
});
```

#### Three separate widgets per category

```js
bundle.widgets.Kapps({
  container: K('content[AdminKapps]').element(),
  config: { type: 'pill', filter: 'Admin' },
  id: 'admin-kapps',
});

bundle.widgets.Kapps({
  container: K('content[CapabilityKapps]').element(),
  config: { type: 'card', size: 'md', filter: 'Capability' },
  id: 'capability-kapps',
});

bundle.widgets.Kapps({
  container: K('content[ToolKapps]').element(),
  config: { type: 'tile', filter: ['Tools', 'Utilities'] },
  id: 'tool-kapps',
});
```

#### Admin-only view that surfaces hidden kapps

```js
bundle.widgets.Kapps({
  container: K('content[AllKapps]').element(),
  config: {
    type: 'card',
    includeHidden: true,
    sort: 'name',
    emptyText: 'No kapps in this space yet.',
  },
  id: 'all-kapps-admin',
});
```

### Notes

- **Case-insensitive everywhere.** All enum-style inputs (`type`, `size`, `iconPlacement`, `accentPlacement`, `accordion`, `sort`, `groupBy`) and all `Display - *` attribute values are normalized to lowercase before comparison. So `type: 'Card'`, `Display - Color = 'Primary'`, `Display - Icon = 'Settings'`, and `filter: ['Admin']` all just work. Free-text fields (`emptyText`, `ungroupedLabel`, `Display - Description`) preserve case. Group headings preserve the original case of the first category-value seen in that bucket, so groupings still read naturally.
- **Theme-aware accents.** `Display - Color` accepts daisy semantic keys (`primary`, `success`, …) which resolve to CSS variables and track the active theme, or hex / `rgb(...)` / `var(...)` strings which pass through unchanged.
- **Equal heights.** Pills enforce a `min-height` per size so two-line names match single-line ones. Tiles are square (`aspect-ratio: 1`). Cards share row heights via `grid-auto-rows: 1fr` and `h-full`.
- **Description truncation.** Cards clamp to two lines with ellipsis (`line-clamp-2`). Not configurable in v1.
- **Multi-valued categories.** A kapp with `Display - Category = ['Admin', 'Tools']` appears in both groups when `groupBy: 'category'` is set, and matches against either when `filter` is used.
- **Hidden override hierarchy.** `Display - Hidden` is checked first. `include` / `exclude` then operate on whatever survived, so an explicit `include` does *not* unhide a hidden kapp unless `includeHidden: true` is also set.
- **In-tree navigation.** Items are `react-router` `Link`s wrapped in an internal-link interceptor so clicks navigate cleanly even when the widget mounts inside its own React tree (form CoreForm, BundleContainer, etc.).
- **Console errors, not silent failures.** Invalid `type`, `size`, `accordion`, `filter`, etc. log `console.error` at registration time and the widget rejects its init promise. The visible widget never half-renders into a broken state.

### Future ideas (not implemented)

- **Custom link target.** A `Display - URL` attribute (or `linkTarget` config) so a kapp pill / card can deep-link into a specific form instead of the kapp landing.
- **Status badges.** A `Display - Status` attribute rendered as a corner badge (`BETA`, `NEW`, etc.). Skipped in v1 to keep the attribute surface tight.
- **Custom card background.** Per-kapp banner image. Held off because arbitrary images will fight text legibility — better solved with a reserved banner zone + dedicated image attribute when a real use case lands.
- **Persistent accordion state.** Local-storage of collapsed-group state, keyed by widget id. Skipped on purpose for v1 — categories can change and stale state is worse than a reset.
- **Click-action override.** A whole-widget or per-kapp `clickAction` matching the chrome-widget shape, for cases where the default `/kapps/<slug>` link isn't right.
