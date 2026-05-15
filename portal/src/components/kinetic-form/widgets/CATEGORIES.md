[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Categories Widget

`Categories` renders the current kapp's categories as cards in a CSS-grid layout. Clicking a card drills into that category's sub-categories — nesting follows the `Parent` attribute convention, with a breadcrumb at the top of the detail view. The widget is the wayfinding half of a "browse to a form" experience; the forms half is its own widget (see the `Forms` widget, separate).

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

> #### Scope
>
> **`kappSlug`** — *string*
> Explicit kapp to render categories for. When omitted (the common case), the widget reads from the kapp currently in Redux — which follows the URL: `/kapps/services` puts the `services` kapp in `state.app.kapp`, and so on. Set `kappSlug` when you need to render a specific kapp's categories regardless of where the user is — e.g. a "Help" widget that always shows the `support` kapp's categories from anywhere in the portal. When `kappSlug` differs from the URL's kapp, the widget fetches the named kapp independently and does not disturb global state.
>
> #### Presentation
>
> **`cardVariant`** — *string*
> `'background' | 'side' | 'stacked' (default) | 'icon-only'`. See the variants table above.
>
> **`iconAttribute`** — *string*
> Category attribute name whose value is a Tabler icon name. Default `'Icon'`. Set to `null` to disable icon rendering entirely.
>
> **`imageAttribute`** — *string*
> Category attribute name whose value is an image URL. Default `'Background Image'`. Set to `null` to disable image rendering entirely.
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
> #### Filtering
>
> **`hideHidden`** — *boolean*
> Default `true`. When `true`, categories with `Hidden = 'true'` are excluded. Set `false` for an admin view.
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
> Shown when the filtered list (top-level or sub-category) is empty. Default `'No categories to display'`.
>
> **`loadingText`** — *string*
> Shown while a cross-kapp fetch is in progress (only applies when `kappSlug` is set and points to a kapp other than the one currently in Redux). Default `'Loading categories…'`.
>
> **`debug`** — *boolean*
> When `true`, the widget logs a `[Categories widget] data snapshot` group to the console every render — showing which source it's using (redux / fetch), the target kapp slug, and a table of every category with its slug, name, `hidden` value, `parent` value, and `displayOrder` value. Useful when the widget renders empty and you need to distinguish "no kapp loaded" from "all filtered out" from "all nested." Default `false`.
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
> | `cardDescription`     | `kd-category-description text-sm text-base-content/70 line-clamp-2`                   | Description line.                                                                    |
> | `breadcrumb`          | `kd-category-breadcrumb flex-sc flex-wrap gap-1 text-sm text-base-content/70 mb-4`    | Breadcrumb container on detail views.                                                |
> | `breadcrumbItem`      | `kd-category-breadcrumb-item kbtn kbtn-ghost kbtn-xs`                                | Each clickable crumb (home link + every ancestor).                                   |
> | `breadcrumbSeparator` | `kd-category-breadcrumb-separator opacity-50 px-1`                                   | The `/` between crumbs.                                                              |
> | `sectionTitle`        | `kd-category-section-title text-sm font-semibold text-base-content/60 uppercase mt-6 mb-3` | Heading rendered above the sub-category list on detail views.                  |
> | `emptyState`          | `kd-category-empty text-base-content/60 italic py-8 text-center`                     | Shown when the filtered list is empty (and when a cross-kapp fetch is loading).      |
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

### Examples

#### Service catalog landing — stacked cards, default everything

```js
bundle.widgets.Categories({
  container: K('content[Catalog]').element(),
  config: { cardVariant: 'stacked' },
  id: 'service-catalog',
});
```

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
- **Current-kapp source.** The widget reads `state.app.kapp.categories` from Redux, which App.jsx loads with `include: 'attributesMap,categories,categories.attributesMap'`. `state.app.kapp` follows the URL — navigating to `/kapps/<slug>` updates Redux so the widget renders that kapp's categories without any per-widget configuration.
- **Cross-kapp source.** Set `config.kappSlug` to render another kapp's categories from anywhere in the portal. The widget fetches that kapp independently (via `useData(fetchKapp, ...)`) and does not write to global state, so the rest of the portal's "current kapp" doesn't change.
- **Modal-safe navigation.** v1's `'widget'` navigation mode keeps drill state internal — embedding the widget inside a form rendered in a modal works without disrupting the underlying page.
- **Console errors, not silent failures.** Invalid enum values, mistyped slot names, etc. log to the console at registration time and either reject the init promise or are silently dropped (slot names warn but don't block).

### Future ideas (not implemented)

- **Forms display.** A separate `Forms` widget that renders forms within a category — composed on a category detail page alongside Categories. Will reuse the same `cardVariant` / `classNames` / icon / image vocabulary.
- **Favorites.** Per-user form favorites stored via `upsertUserPreference`, namespaced with `bundle.spaceSlug()`. Will land with the Forms widget.
- **`url` and `page` navigation modes.** Sync the selection to `?category=<slug>` (for deep-linking) or render category cards as `Link`s to a configured detail route (for distinct detail-page layouts).
- **Configurable columns.** Today the grid uses CSS Grid `auto-fit` with a per-variant minimum column width. Per-breakpoint column counts (`{ sm: 1, md: 2, lg: 3 }`) are a future addition.
- **Per-variant size scale.** A `size` config like the Kapps widget, modulating padding, icon size, and minimum column width.
- **Form-count badge.** A "(N forms)" hint on each card. Requires a per-category form fetch, deferred until the Forms widget is in place.
