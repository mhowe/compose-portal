[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Categories Widget

`Categories` renders the current kapp's categories as cards in a CSS-grid layout. Clicking a card drills into that category's sub-categories — nesting follows the `Parent` attribute convention, with a breadcrumb at the top of the detail view. The widget is the wayfinding half of a "browse to a form" experience; pair it with the [Forms widget](FORMS.md), which auto-binds to the current category selection.

```js
// Initialize the Categories widget
bundle.widgets.Categories({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Categories.get(id);
```

### Per-category attributes

All optional. Set them on a category to influence how that category is presented; leave them blank to fall through to a sensible default.

| Attribute              | Purpose                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `Parent`               | Slug of the parent category. Conventional nesting — categories without a `Parent` value are top-level. The attribute name is configurable via `parentAttribute`. |
| `Icon`                 | [Tabler](https://tabler-icons.io/) icon name (e.g. `briefcase`, `chart-bar`). Attribute name configurable via `iconAttribute`. |
| `Background Image`     | URL of an image to render as the card's media. Attribute name configurable via `imageAttribute`.    |
| `Description`          | Card body copy. Falls back to the category's own `description` field when empty.                    |
| `Hidden`               | `'true'` hides the category from the widget by default. Override with `hideHidden: false`.          |
| `Display Order`        | Numeric sort key for `orderBy: 'displayOrder'`. Lower values appear first. Non-numeric → end.       |
| `<filterAttribute>`    | When `filterAttribute` is set, only categories whose value of that attribute is truthy are shown. E.g. set `filterAttribute: 'Promoted'` to render only categories with `Promoted = 'true'`. |

### Card variants

Pick the layout with `config.cardVariant`:

- **`'background'`** — image fills the card; title and description sit at the bottom over a gradient scrim for legibility. Use when the imagery is the headline.
- **`'side'`** — image occupies the left third of the card, title and description on the right two-thirds. Editorial / catalog feel.
- **`'stacked'`** _(default)_ — image (or icon) on top, title and description below. The safest default for mixed content.
- **`'icon-only'`** — no image; large centered icon over centered title and description. Use when icons are designed and images aren't.

When a category has neither an icon nor an image, the media region still renders as an empty placeholder so cards across the grid keep their text baselines aligned. The slot's default background (`bg-base-200`) shows through; override the `cardMedia` slot if you want a different empty-state look.

### Nesting

Top-level cards are categories with no `Parent` attribute. Clicking a card sets the widget's internal selection to that slug, and the grid re-renders showing categories whose `Parent` equals the selected slug. A breadcrumb above the grid lets the user navigate back to any ancestor or to the home view.

Categories whose `Parent` chain loops are detected on the breadcrumb walk and trigger a `console.warn` — the walk stops at the cycle so the UI doesn't hang.

### Navigation

The only mode supported in v1 is `'widget'` — pure client-side state, no URL touch. This makes the widget safe to embed inside a form that loads in a modal (the modal stays self-contained; drilling doesn't navigate the page underneath). `'url'` (sync to `?category=`) and `'page'` (navigate to a configured detail route) are planned for v2.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*
An object of configurations for the widget. All fields optional.

> #### Presentation
>
> **`presentation`** — *string*
> `'cards'` _(default)_ | `'list'`. Top-level mode switch.
>
> - **`'cards'`** — visual card grid. All the card knobs (`cardVariant`, `size`, `iconSize`, `textVertical`/`textHorizontal`, `showFormCount`, slot system, etc.) apply.
> - **`'list'`** — hierarchical text tree. Every category is visible at once with nested sub-categories indented one step further. Click any name to drill (sets `currentSlug` + fires `categoryClickAction`, same as a card click). The picked category gets the `listItemActive` slot extras for visual feedback. List mode uses a slimmer slot set (`listRoot`, `listItem`, `listItemActive`, `listIcon`, `listIndent`) and skips the breadcrumb / `subCategoriesTitle` since the full hierarchy is already in view.
>
> A `picker` presentation (compact dropdown for fast selection) was scoped for this round but deferred — that use case is being rethought as a separate unified category+form picker widget rather than another mode on this one.
>
> #### Scope
>
> **`kappSlug`** — *string*
> Explicit kapp to render categories for. When omitted (the common case), the widget resolves the kapp scope automatically via `useKappContext`:
>
> - If the widget is rendered **inside a `BundleContainer`**, it follows the container's inner path (`/kapps/<slug>/...`) — so the widget reflects "this container's current kapp."
> - Otherwise it falls back to the global URL-driven slug — `/kapps/services` puts the `services` kapp in scope, etc.
>
> Set `kappSlug` to a specific value when you need to render a known kapp's categories regardless of where the widget lives — e.g. a "Help" widget that always shows the `support` kapp's categories from anywhere in the portal. Set `kappSlug: 'global'` to opt out of container-aware resolution even inside a container. All three resolution paths read from the same `state.app.kappCache` populated by the bulk space fetch, so no extra network call happens.
>
> #### Presentation
>
> **`cardVariant`** — *string*
> `'background' | 'side' | 'stacked' (default) | 'icon-only'`. See the variants table above.
>
> **`size`** — *string*
> `'sm' | 'md' (default) | 'lg' | 'xl'`. Scales the grid's column-width range, the card body padding, title and description font sizes, the per-variant fixed dimension (background's min-height, side's media width / min-height, stacked's media height), and the variant's default media icon size. `md` matches the pre-size-scale defaults, so existing configs keep their look without setting `size` explicitly.
>
> **`cardWidth`** — *string*
> `'fixed'` _(default)_ | `'stretch'`.
>
> Both modes calculate the number of cards per row at the size's `min` width, so a full row has the same number of cards in both modes. What differs is what happens when there are fewer cards than fit on a row:
>
> - **`'fixed'`** — empty tracks stay reserved as ghost slots, so each occupied card keeps the same width whether the row is full or sparse. Drilling from 5 cards to 2 leaves the 2 at the same width, with empty space on the right.
> - **`'stretch'`** — empty tracks collapse and the survivors stretch to fill the row. 5 cards → 2 cards on a wide screen makes the 2 nearly 2½× as wide. The pre-`cardWidth` behavior; use when you want a fluid grid.
>
> | size | min col | body padding | title    | description | background min-h | side media | stacked media | icon (background / side / stacked / icon-only) |
> | ---- | ------- | ------------ | -------- | ----------- | ---------------- | ---------- | ------------- | ---------------------------------------------- |
> | sm   | 140–240 | `p-3`        | `text-sm`  | `text-xs`   | `min-h-36`       | `w-1/3 min-h-24` | `h-24`   | 48 / 32 / 32 / 40 |
> | md   | 180–320 | `p-4`        | `text-base`| `text-sm`   | `min-h-44`       | `w-1/3 min-h-32` | `h-32`   | 64 / 48 / 48 / 56 |
> | lg   | 240–400 | `p-5`        | `text-lg`  | `text-base` | `min-h-52`       | `w-1/3 min-h-40` | `h-40`   | 80 / 64 / 64 / 72 |
> | xl   | 300–480 | `p-6`        | `text-xl`  | `text-base` | `min-h-64`       | `w-1/3 min-h-48` | `h-52`   | 96 / 80 / 80 / 88 |
>
> `iconSize` (separate config) still wins over the per-size icon default if set explicitly.
>
> **`iconAttribute`** — *string*
> Category attribute name whose value is a Tabler icon name. Default `'Icon'`. Set to `null` to disable icon rendering entirely.
>
> **`imageAttribute`** — *string*
> Category attribute name whose value is an image URL. Default `'Background Image'`. Set to `null` to disable image rendering entirely.
>
> **`textVertical`** — *string*
> Vertical alignment of the card's text block (title + form count + description) within the card body. `'top'` _(default)_ | `'middle'` | `'bottom'`. Use `'bottom'` on the `side` variant when you have a long title that would otherwise wrap into the top-right corner badge.
>
> **`textHorizontal`** — *string*
> Horizontal alignment of the card's text block. `'left'` _(default)_ | `'center'` | `'right'`. The `'right'` option pairs naturally with `formCountPlacement: 'title-right'` to anchor both ends of the title row. For the `icon-only` variant, pass `'center'` explicitly to get the historical centered look — the variant no longer hard-codes center alignment so the per-card text positioning stays consistent across variants.
>
> **`iconSize`** — *string or number*
> Icon rendering size. Accepts either a preset string or a custom pixel number; overrides the per-variant default (`background: 64`, `side: 48`, `stacked: 48`, `icon-only: 56`).
>
> | Preset  | Pixels |
> | ------- | ------ |
> | `'sm'`  | 24     |
> | `'md'`  | 36     |
> | `'lg'`  | 48     |
> | `'xl'`  | 64     |
>
> Pass a positive number (`iconSize: 72`) for anything outside the preset range. Case-insensitive for the preset form (`'LG'` works the same as `'lg'`).
>
> **`showDescription`** — *boolean*
> Render the description line. Default `true`.
>
> **`showFormCount`** — *boolean*
> Render an "N forms" count on each card, derived from the kapp's `categorizations` array (direct forms only — forms in descendant categories aren't summed). Default `false`. Always renders a value when enabled, including `'0 forms'` for empty categories, so cards stay visually consistent across the grid.
>
> **`formCountPlacement`** — *string*
> Where the count renders on each card. Default `'title-right'`. Ignored when `showFormCount` is `false`.
>
> | Value           | Behavior                                                                                                                                                                                              |
> | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `'title-right'` _(default)_ | Same row as the title, right-justified via flex. Title takes remaining width.                                                                                                                          |
> | `'inline'`      | Appended to the title as part of the same text node, separated by a `·`. Compact; reads as one heading.                                                                                                |
> | `'corner'`      | Absolute-positioned pill in the top-right corner of the card. Renders over the media area; uses a translucent `bg-base-100/80` + `backdrop-blur-sm` treatment so it stays legible over background-variant images. |
>
> #### Filtering
>
> **`hideHidden`** — *boolean*
> Default `true`. When `true`, categories with `Hidden = 'true'` are excluded. Set `false` for an admin view.
>
> **`hideEmpty`** — *false | true | `'direct'` | `'subtree'`*
> Default `false`. When set, categories with no attached forms are filtered out. The form list comes from the kapp's `categorizations` array — no additional fetches.
>
> - `false` / omitted — show every category, populated or not.
> - `true` / `'direct'` — hide categories that have zero **direct** form attachments. A category whose only forms live in a child still gets hidden.
> - `'subtree'` — hide a category only when neither it nor any descendant category (via the `Parent` chain) has any form attachments. Useful for navigation roots that exist purely to group children.
>
> **`filterAttribute`** — *string*
> Attribute name to require as truthy. Useful for "Promoted" subsets. Example: `filterAttribute: 'Promoted'` shows only categories whose `Promoted` attribute is `'true'` (or `'yes'`, `'1'`, `'on'`).
>
> **`limit`** — *number*
> Cap the rendered list to this many cards (after filter + order). Useful with `filterAttribute` for "top X promoted" displays.
>
> #### Ordering
>
> **`orderBy`** — *string*
> `'displayOrder'` (default) — sort by `Display Order` numerically, missing or non-numeric values sort to the end, ties break alphabetically by name. `'name'` — pure alphabetical. `'createdAt'` — chronological.
>
> **`orderDirection`** — *string*
> `'asc'` (default) | `'desc'`.
>
> #### Nesting
>
> **`parentAttribute`** — *string*
> Attribute name whose value is the parent category's slug. Default `'Parent'`. Configurable so deployments that use a different name (e.g. `'Parent Category'`) don't have to rename their attribute.
>
> #### Navigation
>
> **`navigationMode`** — *string*
> `'widget'` (default — only mode supported in v1). Client-side state, no URL touch. Safe inside modals and form-renders.
>
> #### Detail view
>
> **`showBreadcrumb`** — *boolean*
> Render the breadcrumb when a category is selected. Default `true`.
>
> **`breadcrumbHomeLabel`** — *string*
> First crumb label that navigates back to the top-level view. Default `'All'`.
>
> **`subCategoriesTitle`** — *string*
> Heading rendered above the sub-category grid on detail views. Default `'Categories'`. Set to an empty string to suppress.
>
> **`emptyText`** — *string*
> Shown when the top-level filtered list is empty (the kapp has no categories the widget can display). Default `'No categories to display'`. **Not shown in detail view** — when the user has drilled into a category that has no sub-categories, the widget renders only the breadcrumb so that a Forms widget (or whatever else is composed on the page) can take over without an awkward "no categories" message above its content.
>
> **`debug`** — *boolean*
> When `true`, the widget logs a `[Categories widget] data snapshot` group to the console every render — showing the target kapp slug, whether the kapp is in the cache, and a table of every category with its slug, name, `hidden` value, `parent` value, and `displayOrder` value. Useful when the widget renders empty and you need to distinguish "kapp not in cache yet" from "all filtered out" from "all nested." Default `false`.
>
> #### Escape hatches
>
> **`categoryClickAction`** — *function*
> Optional handler called instead of the default card-click behavior. Receives `{ category, navigate }` — call `navigate()` to invoke the default drill behavior, or do nothing to suppress it (e.g. to open a modal instead).
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
> **When to use the object form's `remove`.** Adding a class works for any utility Tailwind has compiled — the bundle compiles a large utility set via `@source inline(...)` safelists in `portal/src/index.css` plus the standard React-source scan. Most everyday utilities (margins, padding, colors, sizing, gap, flex, `kbtn-*`, `kd-*`, etc.) are reachable from form-designer bundle code. If you hit a class that doesn't seem to take effect, it's likely outside the safelist and not used in source — `remove` is the most direct alternative because it operates on the existing default string and doesn't depend on new CSS being generated.
>
> Recognized slots:
>
> | Slot                  | Default                                                                              | What it styles                                                                       |
> | --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
> | `root`                | _(empty)_                                                                            | The outermost wrapper of the widget.                                                 |
> | `grid`                | `kd-category-grid w-full`                                                            | The CSS-grid container for cards. Layout (auto-fit, gap) is applied inline.          |
> | `card`                | `kd-category-card group relative flex w-full overflow-hidden …`                       | Each clickable category card. Visual chrome (border, hover, transition).             |
> | `cardMedia`           | `kd-category-media bg-base-200 overflow-hidden`                                      | Image / icon region. Variant-specific layout extras are layered on at render.        |
> | `cardOverlay`         | _(empty)_                                                                            | Legibility scrim over `background` variant images.                                   |
> | `cardIcon`            | `kd-category-icon text-base-content/50`                                              | Wrapper around the `<Icon>` element when no image is set.                            |
> | `cardImage`           | `w-full h-full object-cover`                                                         | The `<img>` element when `imageAttribute` resolves a URL.                            |
> | `cardBody`            | `kd-category-body flex-c-ss gap-2 p-4 w-full`                                        | Title + description container.                                                       |
> | `cardTitle`           | `kd-category-title font-semibold text-base`                                          | Category name.                                                                       |
> | `cardFormCount`       | `kd-category-form-count text-xs font-medium text-base-content/60`                    | Form-count badge ("N forms") rendered when `showFormCount: true`. Placement layout is layered on by `formCountPlacement` — the slot default keeps text styling only. |
> | `cardDescription`     | `kd-category-description text-sm text-base-content/70 line-clamp-2`                   | Description line.                                                                    |
> | `breadcrumb`          | `kd-category-breadcrumb flex-sc flex-wrap gap-1 text-sm text-base-content/70 mb-4`    | Breadcrumb container on detail views.                                                |
> | `breadcrumbItem`      | `kd-category-breadcrumb-item kbtn kbtn-ghost kbtn-xs`                                | Each clickable crumb (home link + every ancestor).                                   |
> | `breadcrumbSeparator` | `kd-category-breadcrumb-separator opacity-50 px-1`                                   | The `/` between crumbs.                                                              |
> | `sectionTitle`        | `kd-category-section-title text-sm font-semibold text-base-content/60 uppercase mt-6 mb-3` | Heading rendered above the sub-category list on detail views.                  |
> | `emptyState`          | `kd-category-empty text-base-content/60 italic py-8 text-center`                     | Shown when the filtered list is empty.                                                |
> | `listRoot`            | `kd-category-list flex-c-st gap-0 m-0 p-0 list-none w-full`                          | Outer `<ul>` of the list presentation. Only used when `presentation: 'list'`.        |
> | `listItem`            | `kd-category-list-item flex-sc gap-2 w-full px-3 py-2 rounded-md cursor-pointer hover:bg-base-200 transition text-left text-base-content` | Each row's clickable button. Depth indentation is applied as inline `padding-left` per nesting level. |
> | `listItemActive`      | `bg-base-200 font-semibold`                                                          | Extras layered onto `listItem` when the row's slug matches `currentSlug`.            |
> | `listIcon`            | `kd-category-list-icon flex-cc w-4 shrink-0 text-base-content/60`                    | Icon wrapper inside a list row. Renders unconditionally when `iconAttribute` is configured — even for categories with no icon value — so names align across rows. Width matches the rendered icon size. |
> | `listIndent`          | `kd-category-list-indent`                                                            | Reserved for indent treatment (tree lines, bullets, etc.). Empty by default; depth padding is applied inline. |
>
> Unknown slot names produce a console warning and are ignored. Slot values must be strings (or the `{ add?, remove? }` object shape, or omitted).
>
> Convention: this widget uses the **plural** `classNames` (multiple slots) rather than the singular `className` used by single-element chrome widgets — matching the [Profile widget](PROFILE.md#parameters) precedent.

**`id`** — *string*
Optional id used by the widget machinery for instance tracking. Required if you want to call API methods on the widget after it mounts.

### API

**`update(patch)`** — *Function*
Merges `patch` into the widget's config and re-renders. Works for any field.

```js
bundle.widgets.Categories.get('catalog').update({ cardVariant: 'background' });
```

**`getSelection()`** — *Function*
Returns the currently-drilled category's slug, or `null` when no category is selected (the top-level view). Useful for forms and other widgets that need to read "where am I right now?" without reaching into Redux.

```js
const slug = bundle.widgets.Categories.get('catalog').getSelection();
// → 'hr' when drilled into the HR category, null at the top level
```

The same value is published to `state.widgets.categorySelection[kappSlug]` for React consumers — `useSelector(selectCategorySelection(kappSlug))` works inside other widget trees.

### Examples

#### Service catalog landing — stacked cards, default everything

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: { cardVariant: 'stacked' },
  id: 'service-catalog',
});
```

#### Large background cards for a headline section

```js
bundle.widgets.Categories({
  container: K('content[Featured]').element(),
  config: { cardVariant: 'background', size: 'lg' },
  id: 'featured',
});
```

#### Hierarchical text tree (list presentation)

```js
bundle.widgets.Categories({
  container: K('content[Tree]').element(),
  config: {
    presentation: 'list',
    iconAttribute: 'Icon',   // omit or set null for plain text
  },
  id: 'tree',
});
```

Every category renders at once; nested sub-categories are indented under their parent. Clicking any name fires the same drill / `categoryClickAction` flow as the card variant.

#### Promoted-only top 6 with image-driven cards

```js
bundle.widgets.Categories({
  container: K('content[Promoted]').element(),
  config: {
    cardVariant: 'background',
    filterAttribute: 'Promoted',
    limit: 6,
  },
  id: 'promoted',
});
```

#### Icon-only quick picks, name-sorted

```js
bundle.widgets.Categories({
  container: K('content[QuickPicks]').element(),
  config: {
    cardVariant: 'icon-only',
    orderBy: 'name',
    showDescription: false,
  },
  id: 'quick-picks',
});
```

#### Click-action override — open a category in a modal instead of drilling

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: {
    categoryClickAction: ({ category }) => {
      bundle.utils.openModal({
        type: 'internal',
        path: `/forms/category-detail?slug=${category.slug}`,
        size: 'lg',
      });
    },
  },
  id: 'modal-catalog',
});
```

#### Hide empty categories + show a form-count badge

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: {
    cardVariant: 'side',
    hideEmpty: 'subtree',          // suppress categories whose subtree has zero forms
    showFormCount: true,           // "N forms" on each card
    formCountPlacement: 'corner',  // pill in the top-right; legible over images
  },
  id: 'catalog',
});
```

Both `hideEmpty` and `showFormCount` read from the kapp's `categorizations` array, which is already in the bundle's kapp cache (populated by the bulk space fetch at startup) — no additional network calls are made.

#### Reposition the text block on a side-variant card

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: {
    cardVariant: 'side',
    showFormCount: true,
    formCountPlacement: 'corner',  // pill in the top-right
    textVertical: 'bottom',        // push title/description to the bottom
    textHorizontal: 'left',
  },
  id: 'side-catalog',
});
```

`textVertical` and `textHorizontal` flow into the cardBody slot as flex `justify-*` and `items-*` (plus `text-*`) — both axes are independent.

#### Restyle slots via classNames

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: {
    classNames: {
      // ADD only — append classes on top of the defaults.
      cardTitle: 'text-lg tracking-tight',

      // REMOVE + ADD — drop the default body padding and use a tighter one,
      // then make the title block sit against the top edge of the card.
      cardBody: {
        remove: ['p-4', 'gap-2'],
        add:    'p-3 gap-1',
      },

      // REMOVE only — strip the default media background so a transparent
      // empty placeholder doesn't look like a grey bar above text cards.
      cardMedia: {
        remove: ['bg-base-200'],
      },

      // Width override for the side-variant media slot — restyle the
      // image-on-the-left treatment to take half the card instead of a third.
      // Removing w-1/3 is more reliable than fighting Tailwind specificity
      // by adding `w-1/2` next to it.
      // (Only applies when cardVariant === 'side'.)
    },
  },
  id: 'catalog',
});
```

When you only need to add classes, use the string form. When you need to drop a default the widget would otherwise apply, use the object form's `remove` array. Removal is the most reliable customization tool in this bundle — see the note in the `classNames` parameter for why.

### Notes

- **Case-insensitive enums.** `cardVariant`, `orderBy`, `orderDirection`, `navigationMode`, and `Hidden` / `<filterAttribute>` truthy values are all lowercased before comparison. Free-text fields (`emptyText`, `subCategoriesTitle`, etc.) preserve case.
- **Numeric coerce for `Display Order`.** Stored as text on the record; parsed with `parseFloat` so `"10"` sorts after `"2"`. Missing / non-numeric values sort to the end with alphabetical tie-break.
- **Cycle protection on Parent walk.** A `Parent` chain that loops back triggers a `console.warn` and stops the walk at the repeat — the UI never hangs.
- **Auto kapp scope.** The widget resolves which kapp to show via `useKappContext`. When rendered inside a `BundleContainer`, it observes that container's published kapp slug (driven by the container's inner path) — so a kapp loaded into a container "looks like the current kapp" to widgets inside, even when the outer browser URL hasn't changed. Outside any container it falls back to `state.app.kappSlug` (URL-driven). See [Kapp Cache](KAPP_CACHE.md#per-container-scope) for the contract.
- **Cross-kapp source.** Set `config.kappSlug` to a specific slug to render that kapp's categories regardless of where the widget lives. Set `config.kappSlug: 'global'` to opt out of container-aware resolution and pin to the outer URL's kapp even inside a container. All sources read from `state.app.kappCache[<slug>]` — populated up front by the bulk space fetch, no extra network call.
- **Modal-safe navigation.** v1's `'widget'` navigation mode keeps drill state internal — embedding the widget inside a form rendered in a modal works without disrupting the underlying page.
- **Console errors, not silent failures.** Invalid enum values, mistyped slot names, etc. log to the console at registration time and either reject the init promise or are silently dropped (slot names warn but don't block).

### Future ideas (not implemented)

- **`url` and `page` navigation modes.** Sync the selection to `?category=<slug>` (for deep-linking) or render category cards as `Link`s to a configured detail route (for distinct detail-page layouts).
- **Configurable columns.** Today the grid uses CSS Grid `auto-fit` with a per-variant, per-size minimum column width. Per-breakpoint column counts (`{ sm: 1, md: 2, lg: 3 }`) are a future addition.
- **Subtree form-count badge.** Today the badge shows direct form counts only. A `formCountMode: 'direct' | 'subtree'` option would show roll-up counts on parent categories. The compute is already done internally when `hideEmpty: 'subtree'` is set — just not surfaced as a badge mode.
