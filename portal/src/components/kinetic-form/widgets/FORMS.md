[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Forms Widget

`Forms` renders a kapp's forms as cards in a CSS-grid layout, sharing the same `cardVariant`, `size`, `iconSize`, text-positioning, and `classNames` vocabulary as the [Categories widget](CATEGORIES.md). Designers reach for it as the second half of a "browse to a form" experience — pinned to one category, auto-bound to a sibling Categories widget's selection, or flat across the whole kapp.

```js
// Initialize the Forms widget
bundle.widgets.Forms({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Forms.get(id);
```

### Scope resolution

The widget figures out which forms to show in this order:

1. **`config.categorySlug`** — when set, pin to that category's forms.
2. **Sibling Categories widget** — when no `categorySlug` is set, the widget reads the current selection published by any Categories widget rendered against the same resolved kapp slug. Drilling a category in Categories instantly reframes this widget.
3. **All forms in the kapp** — when neither is set (no Categories widget mounted, or none selected), show every form.

The auto-bind is keyed by kapp slug via `state.widgets.categorySelection[kappSlug]` — Categories writes its current selection there and clears the entry on unmount, so a Forms widget that outlives its Categories peer reverts to "all forms in kapp."

If multiple Categories widgets target the same kapp on one page, the most recent selection wins. For unambiguous multi-pair pages, explicit `config.categorySlug` is the safer choice.

### Per-form data

Each card reads from the form's native fields (`name`, `slug`, `status`, `description`, `categorizations`) plus optional attributes:

| Attribute            | Purpose                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `Icon`               | [Tabler](https://tabler-icons.io/) icon name. Attribute name configurable via `iconAttribute`. Set to `null` to disable. |
| `<imageAttribute>`   | URL of an image to render as the card's media. **No default** — set explicitly (e.g. `imageAttribute: 'Background Image'`) to opt in. |
| `<filterAttribute>`  | When set, only forms whose value of that attribute is truthy are shown. E.g. `filterAttribute: 'Featured'`. |

The form's native `description` field provides the card body copy when `showDescription` is `true`; there's no attribute fallback (forms have a native description field, so the indirection that Categories needs isn't useful here).

### Fetching forms

The bundle's bulk space fetch loads kapps with attributes, categories, and categorizations — but not forms (form definitions are heavy, and most pages don't need them). The Forms widget fills that gap on demand:

- On mount, if `state.app.kappCache[<slug>].forms` is `undefined`, the widget fires one `fetchForms({ kappSlug, include: 'attributesMap,categorizations,categorizations.category' })` and writes the result back to the cache.
- Concurrent mounts for the same kapp coalesce on a single in-flight promise — two Forms widgets on the page share one HTTP request.
- Only metadata is requested. Form pages, elements, and layout are **not** included; the cache stays small and the widget never has to load form definitions to render cards.

Use `bundle.refreshKappForms(slug)` to re-fetch after a known mutation, or call `widget.refresh(slug)` from the instance API.

### Presentation modes

The widget renders in one of two top-level modes, picked with `config.presentation`:

- **`'cards'`** _(default)_ — visual card grid. All the card knobs (`cardVariant`, `size`, `cardWidth`, `iconSize`, `textVertical`/`textHorizontal`, `showDescription`, etc.) apply.
- **`'list'`** — flat text list. Each visible form renders as a clickable row with an optional leading icon, the form name, and (when `showDescription` is true) the form description on a second line in a smaller muted style. Same click semantics as cards — `clickAction`, `target`, and `formClickAction` all behave identically — but the row uses the slimmer slot set (`listRoot`, `listItem`, `listIcon`, `listLabel`, `listTitle`, `listDescription`) and skips card-specific knobs like `cardVariant` and `cardWidth`. Useful when forms compose with Categories in a tight sidebar or when the page already does heavy visual work elsewhere.

Forms don't have a parent chain (the way categories do), so the list is flat — no indentation, no hierarchy. List rows aren't a persistent selection either: clicking navigates per the standard click rules, the same way cards do.

### Card variants

Pick the card layout with `config.cardVariant` (cards presentation only):

- **`'background'`** — image fills the card; title and description sit at the bottom over a gradient scrim.
- **`'side'`** — image on the left third, title and description on the right.
- **`'stacked'`** _(default)_ — image (or icon) on top, title and description below.
- **`'icon-only'`** — no image; large centered icon over centered title and description.

When a form has neither an icon nor an image, the media region still renders as an empty placeholder so cards across the grid keep their text baselines aligned.

### Navigation

The only mode supported in v1 is `'widget'` — pure client-side state, no URL touch. Click behavior is handled by the standard `clickAction` + `target` system (see below). `'url'` (sync `?form=`) and `'page'` (per-form detail route) are planned for v2.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*
An object of configurations for the widget. All fields optional.

> #### Scope
>
> **`kappSlug`** — *string*
> Explicit kapp to render forms for. When omitted (the common case), the widget resolves the kapp scope automatically via `useKappContext`:
>
> - If the widget is rendered **inside a `BundleContainer`**, it follows the container's inner path (`/kapps/<slug>/...`).
> - Otherwise it falls back to the global URL-driven slug.
>
> Set `kappSlug` to a specific value to render a known kapp's forms regardless of where the widget lives. Set `kappSlug: 'global'` to opt out of container-aware resolution even inside a container. See [Kapp Cache](KAPP_CACHE.md#per-container-scope).
>
> **`categorySlug`** — *string*
> Pin to a specific category's forms. When omitted, the widget reads the sibling Categories widget's selection from `state.widgets.categorySelection[<kappSlug>]`; when nothing is selected (or no Categories widget is mounted), the `initialView` decides what renders.
>
> **`initialView`** — *string or Object*
> Controls what the widget renders **when no category is bound** (no `config.categorySlug` pin AND no Categories-widget selection). Once a category is bound, `initialView` is irrelevant — the widget shows that category's forms. Default `'all'`.
>
> | Value | What it renders | Triggers fetch? |
> | ----- | --------------- | --------------- |
> | `'all'` _(default)_ | Every form in the kapp. | Yes |
> | `'empty'` | The empty state with `emptyText`. | No |
> | `'blank'` | Nothing at all — no copy, no DOM noise inside `root`. | No |
> | `{ categorySlug: <slug> }` | The named category's forms. Pair with a Kinetic category whose `Hidden` attribute is `'true'` — the Categories widget hides it from the visible list, but this widget still reads from it. The canonical pattern for "Popular", "Featured", "Editor's Picks" type curation, with the form list produced by an external process. | Yes |
> | `{ filterAttribute: <name> }` | Forms whose `<name>` attribute is truthy. Independent from the widget-level `filterAttribute`, which applies in every state — `initialView.filterAttribute` only applies when no category is bound. | Yes |
> | `{ uncategorized: true }` | Forms with no `categorizations` at all. Useful for surfacing orphaned forms in admin views. | Yes |
>
> `'empty'` and `'blank'` modes skip the on-mount fetch entirely — a Forms widget that never enters a list-rendering state never pulls forms. As soon as a category gets bound (the user drills into the sibling Categories widget), the fetch fires and the list renders.
>
> #### Source filtering
>
> **`status`** — *string or array of strings*
> Filter forms by status. Default `['Active', 'New']`. Accepts:
>
> - A single value: `'Active'`, `'New'`, `'Inactive'`
> - An array: `['Active', 'New']`
> - The sentinel `'all'` (or an array containing `'all'`): show every status
>
> Comparison is case-insensitive. Applied client-side against the cached forms, so toggling `status` between two widgets that share the same kapp cache does not re-fetch.
>
> **`filterAttribute`** — *string*
> Attribute name to require as truthy. Useful for "Featured" subsets. Example: `filterAttribute: 'Featured'` shows only forms whose `Featured` attribute is `'true'` (or `'yes'`, `'1'`, `'on'`).
>
> **`limit`** — *number*
> Cap the rendered list to this many cards (after filter + order).
>
> #### Presentation
>
> **`presentation`** — *string*
> `'cards'` _(default)_ | `'list'`. Top-level mode switch. See [Presentation modes](#presentation-modes).
>
> **`cardVariant`** — *string*
> `'background' | 'side' | 'stacked' (default) | 'icon-only'`. See [Card variants](#card-variants). Ignored when `presentation: 'list'`.
>
> **`size`** — *string*
> `'sm' | 'md' (default) | 'lg' | 'xl'`. Scales grid column width, body padding, font sizes, the per-variant fixed dimension, and the default icon size. Same scale as Categories — see [`CATEGORIES.md`'s size table](CATEGORIES.md#card-variants) for the per-variant breakdown. Ignored when `presentation: 'list'`.
>
> **`cardWidth`** — *string*
> `'fixed'` _(default)_ | `'stretch'`. Controls how the card grid behaves when there are fewer cards than columns. Ignored when `presentation: 'list'`.
>
> Both modes calculate the number of cards per row at the size's `min` width, so a full row has the same number of cards in both modes. What differs is what happens when there are fewer:
>
> - **`'fixed'`** — empty tracks stay reserved as ghost slots, so each occupied card keeps the same width whether the row is full or sparse. Useful when the widget renders in a sidebar or narrow region and you don't want a single card to grow to fill the whole container.
> - **`'stretch'`** — empty tracks collapse and the survivors stretch to fill the row. 5 cards → 2 cards on a wide screen makes the 2 nearly 2½× as wide. Use when you want a fluid grid that always fills the row.
>
> **`iconAttribute`** — *string*
> Form attribute name whose value is a Tabler icon name. Default `'Icon'`. Set to `null` to disable icon rendering entirely.
>
> **`imageAttribute`** — *string*
> Form attribute name whose value is an image URL. Default `null` (no image rendering). Set to a string like `'Background Image'` to opt in.
>
> **`iconSize`** — *string or number*
> Icon rendering size. Accepts either a preset string (`'sm' | 'md' | 'lg' | 'xl'`) or a custom pixel number; overrides the per-variant default.
>
> **`textVertical`** — *string*
> Vertical alignment of the card's text block within the card body. `'top'` _(default)_ | `'middle'` | `'bottom'`.
>
> **`textHorizontal`** — *string*
> Horizontal alignment of the card's text block. `'left'` _(default)_ | `'center'` | `'right'`.
>
> **`showDescription`** — *boolean*
> Render the form's `description` line. Default `true`. Applies to both presentation modes: under the title on cards, and beneath the title in list rows (smaller and muted via the `listDescription` slot).
>
> #### Ordering
>
> **`orderBy`** — *string*
> `'name'` _(default)_ | `'createdAt'` | `'updatedAt'`. Default-sort is alphabetical because forms don't have a `Display Order` convention by default (unlike categories). Designers who want a manual sort key can layer one on by filtering via `filterAttribute` and limiting.
>
> **`orderDirection`** — *string*
> `'asc'` (default) | `'desc'`.
>
> #### Click behavior
>
> **`clickAction`** — *Object*
> Standard `clickAction` discriminated union (`'home' | 'internal' | 'external' | 'event' | 'openSearch' | 'none'`). When omitted, each card defaults to `{ type: 'internal', path: '/kapps/<kappSlug>/forms/<formSlug>' }`. For `type: 'event'`, the dispatched `CustomEvent` carries the clicked form on `detail.form` (mirroring how Kapps surfaces the clicked kapp on `detail.kapp`).
>
> **`target`** — *string or Object*
> Standard `target` field — `'current'` (default), `'new'`, `'modal'`, or `{ type: 'container', id }` for container nav. See [chrome-utils](BUNDLE_LINK.md#click-action-and-target) (used by the BundleLink widget) for the full vocabulary. Inside a `BundleContainer`, set `target: { type: 'container', id: '<your-container-id>' }` to navigate the container rather than the outer page.
>
> **`formClickAction`** — *function*
> Imperative escape hatch. Receives `{ form, navigate }` — call `navigate()` to invoke the default route (`/kapps/<kappSlug>/forms/<formSlug>`), or do nothing to suppress it (e.g., open a confirm dialog first, or hand off to bespoke logic). Supersedes `clickAction` and `target` entirely when provided.
>
> #### Empty / loading copy
>
> **`emptyText`** — *string*
> Shown when the filtered list is empty. Default `'No forms to display'`.
>
> **`loadingText`** — *string*
> Shown during the initial on-mount fetch when no cached forms exist yet for the resolved kapp. Default `'Loading forms…'`.
>
> #### Diagnostics
>
> **`debug`** — *boolean*
> When `true`, the widget logs a `[Forms widget] data snapshot` group every render — target kapp slug, cache status, effective category filter, statuses being applied, and a per-form table. Useful when the widget renders empty.
>
> #### Escape hatches
>
> **`className`** — *string*
> Extra classes on the root element. Additive.
>
> **`classNames`** — *Object keyed by slot name*
> Per-slot class overrides. Each value is one of two shapes:
>
> - **String** — additive. Concatenated on top of the widget's defaults (and any variant-specific extras the widget layers on internally).
> - **Object `{ add?: string, remove?: string[] }`** — surgical. `remove` first strips the listed class tokens from the resolved default; `add` then appends new classes. Use this when you need to drop a default the widget would otherwise apply.
>
> Recognized slots:
>
> | Slot                  | Default                                                                              | What it styles                                                                       |
> | --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
> | `root`                | _(empty)_                                                                            | The outermost wrapper of the widget.                                                 |
> | `grid`                | `kd-form-grid w-full`                                                                | The CSS-grid container for cards. Layout (auto-fit, gap) is applied inline.          |
> | `card`                | `kd-form-card group relative flex w-full overflow-hidden …`                          | Each clickable form card. Visual chrome (border, hover, transition).                 |
> | `cardMedia`           | `kd-form-media bg-base-200 overflow-hidden`                                          | Image / icon region. Variant-specific layout extras are layered on at render.        |
> | `cardOverlay`         | _(empty)_                                                                            | Legibility scrim over `background` variant images.                                   |
> | `cardIcon`            | `kd-form-icon text-base-content/50`                                                  | Wrapper around the `<Icon>` element when no image is set.                            |
> | `cardImage`           | `w-full h-full object-cover`                                                         | The `<img>` element when `imageAttribute` resolves a URL.                            |
> | `cardBody`            | `kd-form-body flex-c-ss gap-2 w-full`                                                | Title + description container.                                                       |
> | `cardTitle`           | `kd-form-title font-semibold`                                                        | Form name.                                                                           |
> | `cardDescription`     | `kd-form-description text-base-content/70 line-clamp-2`                              | Description line.                                                                    |
> | `emptyState`          | `kd-form-empty text-base-content/60 italic py-8 text-center`                         | Shown when the filtered list is empty.                                                |
> | `loadingState`        | `kd-form-loading text-base-content/60 italic py-8 text-center`                       | Shown while the initial fetch is in flight.                                          |
> | `listRoot`            | `kd-form-list flex-c-st gap-0 m-0 p-0 list-none w-full`                              | Outer `<ul>` of the list presentation. Only used when `presentation: 'list'`.        |
> | `listItem`            | `kd-form-list-item flex-sc gap-2 w-full px-3 py-2 rounded-md cursor-pointer hover:bg-base-200 transition text-left text-base-content no-underline` | Each row's clickable element (button or anchor — chosen by `clickAction`/`target`).   |
> | `listIcon`            | `kd-form-list-icon flex-cc w-4 shrink-0 text-base-content/60`                        | Icon wrapper inside a list row. Renders unconditionally when `iconAttribute` is configured — even for forms with no icon value — so names align across rows. |
> | `listLabel`           | `kd-form-list-label flex-c-st gap-0.5 flex-1 min-w-0`                                | Vertical stack containing the title and (when `showDescription` is true) the description. `min-w-0` lets the inner truncate clip long labels. |
> | `listTitle`           | `kd-form-list-title truncate`                                                        | Form name in list mode. Single-line truncate at the row width.                        |
> | `listDescription`     | `kd-form-list-description text-sm text-base-content/70 truncate`                     | Form description in list mode. Smaller and muted than the title; single-line truncate keeps rows uniform-height. Only rendered when `showDescription` is true and the form has a non-empty `description`. |
>
> Unknown slot names produce a console warning and are ignored.
>
> Convention: this widget uses the **plural** `classNames` (multiple slots) — same as Categories and Profile.

**`id`** — *string*
Optional id used by the widget machinery for instance tracking. Required if you want to call API methods on the widget after it mounts.

### API

**`update(patch)`** — *Function*
Merges `patch` into the widget's config and re-renders.

```js
bundle.widgets.Forms.get('hr-forms').update({ cardVariant: 'side' });
```

**`refresh(slug)`** — *async Function*
Re-fetches the kapp's forms and overwrites the cache entry. Returns the `@kineticdata/react` response so callers can inspect `response.error`. Pass an explicit slug, or rely on `config.kappSlug` when set; auto-resolved slugs aren't reachable from the instance API, so wire a slug explicitly if your widget uses container/global auto-resolution.

```js
const { forms, error } = await bundle.widgets.Forms.get('hr-forms').refresh('services');
```

Equivalent to `bundle.refreshKappForms(slug)` — both write through the same shared in-flight cache.

### Examples

#### Show every form in the current kapp, stacked variant

```js
bundle.widgets.Forms({
  container: K('content[FormsList]').element(),
  config: { cardVariant: 'stacked' },
  id: 'all-forms',
});
```

#### Flat text list — pairs naturally with Categories in a narrow sidebar

```js
bundle.widgets.Forms({
  container: K('content[SidebarForms]').element(),
  config: {
    presentation: 'list',
    // iconAttribute still drives the row icon — leave 'Icon' (default) to
    // show one when set, set to null to skip the icon column entirely.
  },
  id: 'sidebar-forms',
});
```

#### Keep cards from getting too wide in a narrow container

```js
bundle.widgets.Forms({
  container: K('content[Forms]').element(),
  config: {
    cardVariant: 'side',
    // 'fixed' (default) keeps each card at the size's min width even when
    // there's spare horizontal room. 'stretch' is the historical behavior
    // — cards expand to fill the row.
    cardWidth: 'fixed',
  },
  id: 'forms',
});
```

#### Pin to one category, with the form's `Featured` attribute filtering it down

```js
bundle.widgets.Forms({
  container: K('content[FeaturedHR]').element(),
  config: {
    categorySlug: 'hr',
    filterAttribute: 'Featured',
    limit: 6,
  },
  id: 'featured-hr',
});
```

#### Compose with a Categories widget — drill the Categories widget and this widget reframes automatically

```js
// Page composition (e.g. on a "Service Catalog" landing):
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: { cardVariant: 'stacked' },
  id: 'catalog',
});
bundle.widgets.Forms({
  container: K('content[CategoryForms]').element(),
  // No categorySlug — auto-binds to the Categories widget's current
  // selection. Shows all forms in the kapp until the user drills a category.
  config: { cardVariant: 'side', showDescription: true },
  id: 'category-forms',
});
```

#### Same composition — but Forms stays empty until a category is picked

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: { cardVariant: 'stacked' },
  id: 'catalog',
});
bundle.widgets.Forms({
  container: K('content[CategoryForms]').element(),
  config: {
    initialView: 'empty',
    cardVariant: 'side',
    emptyText: 'Select a category to see forms.',
  },
  id: 'category-forms',
});
```

With `initialView: 'empty'`, the widget renders only the `emptyText` until the Categories widget publishes a selection. The on-mount `fetchForms` is skipped too — no wasted round trip for forms the user might never look at.

#### Show "Popular Forms" as the initial state, with the curation handled outside the widget

```js
// Backend (a Kinetic task / integration / admin process) maintains a category
// named 'popular' whose `Hidden` attribute is 'true' — it's invisible to the
// Categories widget's normal user-facing list, but the Forms widget reads
// directly from it. Whichever process owns "what's popular" attaches and
// detaches forms to this category as the rankings change.
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: { cardVariant: 'stacked' },  // hideHidden defaults to true
  id: 'catalog',
});
bundle.widgets.Forms({
  container: K('content[CategoryForms]').element(),
  config: {
    initialView: { categorySlug: 'popular' },
    cardVariant: 'side',
  },
  id: 'category-forms',
});
```

The same pattern works for `'featured'`, `'recommended'`, `'new-this-week'` — any curation surface you can express as a hidden category. As soon as the user drills into a real category in the Categories widget, that selection takes over.

#### Initial state blank, then forms appear on selection

```js
bundle.widgets.Forms({
  container: K('content[Forms]').element(),
  // Nothing renders inside the root until a category is bound. Useful when
  // Forms sits below Categories and you don't want any "No forms…" copy
  // adding noise before the user has interacted.
  config: { initialView: 'blank' },
  id: 'category-forms',
});
```

#### Surface orphaned forms (no categorizations)

```js
bundle.widgets.Forms({
  container: K('content[Orphans]').element(),
  config: {
    initialView: { uncategorized: true },
    emptyText: 'Every form is categorized — nothing to clean up.',
  },
  id: 'admin-orphans',
});
```

#### Background-image variant with explicit attribute name

```js
bundle.widgets.Forms({
  container: K('content[Featured]').element(),
  config: {
    cardVariant: 'background',
    size: 'lg',
    imageAttribute: 'Background Image',
    filterAttribute: 'Featured',
  },
  id: 'featured-forms',
});
```

#### Open the form in a modal instead of routing

```js
bundle.widgets.Forms({
  container: K('content[Quick]').element(),
  config: {
    // Default clickAction (internal route to the form page) + modal target =
    // open the form page in a modal rather than navigating the outer page.
    target: { type: 'modal', size: 'lg' },
  },
  id: 'quick-forms',
});
```

#### Container-aware navigation — load the form into a named BundleContainer

```js
bundle.widgets.Forms({
  container: K('content[Forms]').element(),
  config: {
    target: { type: 'container', id: 'main-container' },
  },
  id: 'forms-in-container',
});
```

#### Custom click — confirm before navigating

```js
bundle.widgets.Forms({
  container: K('content[Forms]').element(),
  config: {
    formClickAction: ({ form, navigate }) => {
      if (window.confirm(`Open "${form.name}"?`)) navigate();
    },
  },
  id: 'confirm-forms',
});
```

#### Refresh after a server-side change

```js
K('form').on('submit', async () => {
  await bundle.widgets.Forms.get('hr-forms').refresh('services');
  // or: await bundle.refreshKappForms('services');
});
```

### Notes

- **Case-insensitive enums.** `cardVariant`, `orderBy`, `orderDirection`, `navigationMode`, and `status` values are all lowercased before comparison. Free-text fields (`emptyText`, `loadingText`, etc.) preserve case.
- **Status sentinel.** `status: 'all'` (or an array including `'all'`) opts out of status filtering entirely. Otherwise the default is `['Active', 'New']` — production-ready and recently-promoted forms.
- **Metadata only in cache.** The forms cache stores form records with `attributesMap` and `categorizations`. It deliberately does **not** include `pages`, `elements`, or `layout` — those are loaded separately when a form is actually rendered. Cards only ever need metadata.
- **Auto kapp scope.** Same `useKappContext` story as Categories. Inside a `BundleContainer`, the widget follows the container's inner kapp slug. Set `config.kappSlug: 'global'` to opt out, or pin to a specific slug.
- **Auto category-bind cleanup.** The Categories widget clears its published selection on unmount, so a Forms widget that outlives its sibling falls back to "all forms in kapp" rather than holding onto a stale selection.
- **Default route.** When neither `clickAction` nor `formClickAction` is set, each card renders as `<a href="#/kapps/<kappSlug>/forms/<formSlug>">`. The bundle's internal-link interceptor handles outer-page hash navigation. For modal or container nav, layer in `target` or `clickAction` explicitly — there's no automatic "if I'm in a container, navigate the container" yet (see Future ideas).
- **Console errors, not silent failures.** Invalid enum values, mistyped slot names, etc. log to the console at registration time and either reject the init promise or are silently dropped (slot names warn but don't block).

### Future ideas (not implemented)

- **Per-card badge with a designer-defined rule.** A `badge: { text, when }` config option — render a small badge ("New", "Beta", "Updated <date>") on each card, with `when` evaluating a per-form predicate (attribute equality, status, recency, etc.). Tracked separately from the v1 widget.
- **Favorites.** Per-user form favorites stored via `upsertUserPreference`, namespaced with `bundle.spaceSlug()`. Toggle on each card, plus a new `initialView: { favorites: true }` mode that surfaces the current user's favorites as the unbound state. Reserved key — the validator already rejects unknown `initialView` shapes, so adding this is a non-breaking extension.
- **Context-aware default click.** Detect the nearest `BundleContainer` and default `target` to `{ type: 'container', id: <derived> }` so designers don't have to wire it manually. Requires exposing container `id` from `slotPath` (today only slotPath is reachable through DOM ancestry).
- **Per-form `Display Order` attribute.** Numeric sort key, mirroring the Categories convention. Today forms sort by name by default; an opt-in `orderBy: 'displayOrder'` would read a `Display Order` attribute.
- **`url` and `page` navigation modes.** Sync the selection to `?form=<slug>` for deep-linking, or render cards as `Link`s to a configured detail route.
- **Subtree category filter.** Today `categorySlug` matches forms in exactly that category. A `categoryMode: 'direct' | 'subtree'` option would include forms in descendant categories (via the `Parent` attribute chain).
- **Multi-pair auto-bind.** A `selectionKey` shared between paired Categories and Forms widgets to support multiple independent pairs on the same page.
