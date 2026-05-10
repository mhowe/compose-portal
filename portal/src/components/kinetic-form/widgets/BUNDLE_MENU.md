[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleMenu Widget

`BundleMenu` renders a configurable menu — either as a popover dropdown (triggered by a button) or as an always-visible inline list. Items support icons, text, descriptions, nested children, dividers, and section headers, and use the same `clickAction` / `target` system as the other chrome widgets.

Common use cases:

- Hamburger / primary nav menu in a header (popover)
- Sidebar navigation (inline)
- Footer link columns (inline)
- Bulk-action menus on selection toolbars (popover)
- Admin / utility menus (popover, with `hidden` for conditional items)

```js
// Initialize the BundleMenu widget
bundle.widgets.BundleMenu({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleMenu.get(id);
```

### Parameters

![name=container](https://img.shields.io/badge/container-gray)
![type=HTMLElement](https://img.shields.io/badge/HTMLElement_or_array--like-e66e22)  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

<details>
<summary>
  <img alt="name=config" src="https://img.shields.io/badge/config-gray">
  <img alt="type=Object" src="https://img.shields.io/badge/Object-e66e22">
  <br>
  An object of configurations for the widget. All fields optional.
</summary>
<br>
<blockquote>

![name=layout](https://img.shields.io/badge/layout-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
`'popover'` _(default)_ or `'inline'`.

- **`'popover'`** — render an icon/text trigger button; clicking opens a dropdown of items. Items close the popover on click.
- **`'inline'`** — render the items in place as a vertical list. No trigger.

![name=items](https://img.shields.io/badge/items-gray)
![type=Array](https://img.shields.io/badge/Object[]-e66e22)  
The list of items the menu displays. See [Item shapes](#item-shapes) below for the item config.

<details>
<summary>
  <img alt="name=trigger" src="https://img.shields.io/badge/trigger-gray">
  <img alt="type=Object" src="https://img.shields.io/badge/Object-e66e22">
  <br>
  Popover layout only. The clickable thing that opens the dropdown.
</summary>
<br>
<blockquote>

![name=icon](https://img.shields.io/badge/icon-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
[Tabler icon](https://tabler-icons.io/) name. Resolution:

- Provide a string → use that icon.
- Provide `text` only (no `icon`) → no icon (text-only trigger).
- Provide neither `icon` nor `text` → default to `'menu-2'` (hamburger).
- Pass `icon: null` (or `''`) → explicitly suppress the icon even when no text is provided.

![name=text](https://img.shields.io/badge/text-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Optional label. Without text and without an icon, the trigger falls back to the hamburger icon as a sensible default.

![name=iconPosition](https://img.shields.io/badge/iconPosition-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
`'left'` _(default)_ or `'right'`.

![name=size](https://img.shields.io/badge/size-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`.

![name=label](https://img.shields.io/badge/label-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Accessibility label for the trigger button.

![name=className](https://img.shields.io/badge/className-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Override the default ghost-button styling.

</blockquote>
</details>

</blockquote>
</details>

![name=id](https://img.shields.io/badge/id-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Optional id used by the widget machinery for instance tracking.

### Item shapes

Each entry in `config.items` is one of three shapes. `hidden: true` on any item skips it.

#### Regular item

```js
{
  icon: 'home',                   // optional Tabler icon
  text: 'Home',                   // required label
  description: 'Personal home',   // optional sub-text
  clickAction: { type: 'home' },  // shared clickAction union
  target: 'current',              // shared target option
  label: 'Go home',               // optional aria-label override
  children: [ ... ],              // optional nested items (rendered inline-expanded)
  hidden: false,                  // skip rendering when true
}
```

`children` are nested items rendered with increasing left indent below the parent. The parent itself is still clickable and uses its own `clickAction` (often `{ type: 'none' }` for a header-style parent that just groups children).

See [Chrome Widget Actions](CHROME_ACTIONS.md) for the full clickAction and target vocabulary.

#### Section header

```js
{ header: true, text: 'Admin' }
```

A non-interactive section title rendered in small uppercase text. Use to label groups of items in a longer menu.

#### Divider

```js
{ divider: true }
```

A horizontal rule between items. No other fields apply.

### Examples

#### Hamburger-style header menu (replaces the hardcoded one)

```js
bundle.widgets.BundleMenu({
  container: K('content[Menu]').element(),
  config: {
    layout: 'popover',
    trigger: { icon: 'menu-2', size: 'lg' },
    items: [
      { icon: 'home',     text: 'Home',           clickAction: { type: 'home' } },
      { icon: 'send',     text: 'Submit Request', clickAction: { type: 'event', name: 'open-search' } },
      { icon: 'inbox',    text: 'Check Status',   clickAction: { type: 'internal', path: '/requests' } },
      { icon: 'list',     text: 'My Work',        clickAction: { type: 'internal', path: '/actions' } },
      { divider: true },
      { header: true, text: 'Admin' },
      { icon: 'palette',  text: 'Theme Editor',   clickAction: { type: 'internal', path: '/theme' }, hidden: !K('identity').spaceAdmin },
      { icon: 'settings', text: 'Settings',       clickAction: { type: 'internal', path: '/settings' } },
    ],
  },
  id: 'main-menu',
});
```

#### Inline sidebar nav

```js
bundle.widgets.BundleMenu({
  container: K('content[Sidebar]').element(),
  config: {
    layout: 'inline',
    items: [
      { icon: 'inbox', text: 'Inbox',    clickAction: { type: 'internal', path: '/inbox' } },
      { icon: 'send',  text: 'Sent',     clickAction: { type: 'internal', path: '/sent' } },
      { divider: true },
      { header: true, text: 'Folders' },
      { icon: 'folder', text: 'Projects', clickAction: { type: 'internal', path: '/folders/projects' } },
      { icon: 'folder', text: 'Personal', clickAction: { type: 'internal', path: '/folders/personal' } },
    ],
  },
  id: 'sidebar',
});
```

#### Nested menu with parent grouping

```js
bundle.widgets.BundleMenu({
  container: K('content[Menu]').element(),
  config: {
    layout: 'inline',
    items: [
      {
        icon: 'briefcase',
        text: 'Services',
        clickAction: { type: 'none' }, // parent isn't clickable, just groups
        children: [
          { icon: 'computer', text: 'IT',     clickAction: { type: 'internal', path: '/kapps/it' } },
          { icon: 'users',    text: 'HR',     clickAction: { type: 'internal', path: '/kapps/hr' } },
          { icon: 'building', text: 'Facilities', clickAction: { type: 'internal', path: '/kapps/facilities' } },
        ],
      },
      { divider: true },
      { icon: 'help', text: 'Help', clickAction: { type: 'internal', path: '/forms/help' }, target: 'modal' },
    ],
  },
  id: 'main',
});
```

#### Footer-style link column

```js
bundle.widgets.BundleMenu({
  container: K('content[FooterLinks]').element(),
  config: {
    layout: 'inline',
    items: [
      { text: 'About',   clickAction: { type: 'external', url: 'https://example.com/about' }, target: 'new' },
      { text: 'Privacy', clickAction: { type: 'external', url: 'https://example.com/privacy' }, target: 'new' },
      { text: 'Terms',   clickAction: { type: 'external', url: 'https://example.com/terms' }, target: 'new' },
      { text: 'Contact', clickAction: { type: 'event', name: 'open-contact' } },
    ],
  },
  id: 'footer-links',
});
```

### Notes

- **Items support every `clickAction` type**, including `target: 'modal'` for opening the click in a modal. See [Chrome Widget Actions](CHROME_ACTIONS.md).
- **Conditional items** — compute `hidden` form-side using your form's bundle script (e.g. `hidden: !K('identity').spaceAdmin`) before passing the items array. The widget receives a static config.
- **Nested items render inline-expanded** in v1 — the parent and all children are visible at once with indentation. Flyout submenus and click-to-expand accordions are future polish.
- **The popover closes when an item is clicked.** Section headers and dividers don't close it (they're not interactive).
- **`'none'`-clickAction items** are non-interactive and don't close the popover. Useful for nested-parent items that only exist to group their children.

### Integration-sourced items

In addition to (or instead of) static `items`, you can populate the menu from a Kinetic integration. Useful for:

- Admin-authored quick links — admin maintains a form whose submissions become menu items, no code changes needed.
- Kapp switcher — list the kapps the user has access to, drawn from a kapp-listing integration.
- Dynamic action menus — items reflecting the user's role, the current record, etc.

#### Config

Add an `integration` block to your config alongside (or instead of) `items`. Static `items` render first; integration items append after.

```js
config: {
  items: [ /* optional static items */ ],
  integration: {
    kappSlug: 'admin',                   // required
    formSlug: 'quick-links',             // optional — kapp integration if omitted
    integrationName: 'list-active-links', // required
    listProperty: 'submissions',         // required — path in response holding the array
    parameters: { /* ... */ },           // optional integration params

    itemMap: { /* see below */ },        // declarative per-row mapping
    // OR
    transform: row => ({ /* ... */ }),   // function alternative to itemMap

    errorProperty: 'error',              // optional — path where errors live in response body
    loadingMessage: 'Loading…',          // optional, defaults to 'Loading...'
    errorMessage: 'Could not load.',     // optional, defaults to 'Failed to load menu items.'
    onSuccess: response => { /* ... */ },// optional callback
    onError: err => { /* ... */ },       // optional callback
  },
}
```

#### `itemMap` — declarative template mapping

The most common path. Define an object that mirrors the item config shape; any string containing `{{path}}` is interpolated against each row using lodash-style path resolution. Plain strings are literal. Nested objects (like `clickAction`) are walked recursively.

```js
itemMap: {
  icon: '{{values["Link Icon"]}}',     // dot or bracket notation; quotes for keys with spaces
  text: '{{values["Link Title"]}}',
  description: '{{values.Description}}',
  clickAction: {
    type: 'internal',                  // literal — no {{}} → used as-is
    path: '{{values["Link Path"]}}',   // template
  },
}
```

Path resolution (lodash `_.get`):

| Path                          | Resolves to                       |
| ----------------------------- | --------------------------------- |
| `{{values.Name}}`             | `row.values.Name`                 |
| `{{values["Link Title"]}}`    | `row.values["Link Title"]`        |
| `{{values.Categories[0]}}`    | `row.values.Categories[0]`        |
| `{{label}}`                   | `row.label` (top-level)           |

Missing values resolve to `''` (empty string) — easier to spot misconfigured paths than silent skipped rows. Designers can use `transform` to filter out incomplete rows.

#### `transform` — function alternative

For complex mappings (conditionals, computed values, row filtering), provide a function that receives a row and returns a full item config. If `transform` is set, `itemMap` is ignored.

```js
transform: row => ({
  icon: row.values.IsExternal ? 'external-link' : 'link',
  text: row.values.Name,
  clickAction: row.values.IsExternal
    ? { type: 'external', url: row.values.Url }
    : { type: 'internal', path: row.values.Path },
})
```

Provide `itemMap` *or* `transform`, not both. The widget logs a console error if both are present.

#### Example — admin-authored quick links

The admin builds a `quick-links` form with fields `Link Title`, `Link Path`, `Link Icon`. An integration `list-active-links` returns active submissions of that form.

```js
bundle.widgets.BundleMenu({
  container: K('content[QuickLinks]').element(),
  config: {
    layout: 'inline',
    items: [
      { icon: 'home', text: 'Home', clickAction: { type: 'home' } },
      { divider: true },
      { header: true, text: 'Quick Links' },
    ],
    integration: {
      kappSlug: 'admin',
      formSlug: 'quick-links',
      integrationName: 'list-active-links',
      listProperty: 'submissions',
      itemMap: {
        icon: '{{values["Link Icon"]}}',
        text: '{{values["Link Title"]}}',
        clickAction: {
          type: 'internal',
          path: '{{values["Link Path"]}}',
        },
      },
    },
  },
  id: 'quick-links',
});
```

When the admin adds a new submission to the `quick-links` form, the menu picks it up on the next refresh (call `BundleMenu.get('quick-links').refresh()` or reload the page).

#### Loading + error UX

While the integration is fetching, a single non-interactive item appears at the bottom of the menu with `loadingMessage` (defaults to `'Loading...'`). If the fetch errors, that placeholder is replaced with `errorMessage` (defaults to `'Failed to load menu items.'`). Static items remain visible the whole time.

The widget also calls optional `onSuccess(response)` and `onError(err)` callbacks if you provide them.

#### Sorting & filtering

Sorting and filtering happen on the **integration side** — the integration should return rows in display order and pre-filtered. The widget renders rows in the order received. This keeps the widget config simple and integration logic centralized.

### API

![name=refresh](https://img.shields.io/badge/refresh%28%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Re-fetches integration items. Useful when the underlying source changes (admin added a new submission, parameters changed, etc.). No-op when no `integration` is configured.

```js
// Re-fetch the integration items
bundle.widgets.BundleMenu.get('quick-links').refresh();
```

### Coming soon

Future enhancements queued for this widget:

- **Built-in source: kapps.** `kapps: true` to auto-derive items from the user's available kapps (the kapp-switcher pattern), without writing an integration.
- **Active-state highlighting** for the current route (sidebar nav use case).
- **Click-to-expand nested items** for deep menus where always-expanded becomes overwhelming.

### Behavior inside `BundleChrome`

When mounted as a hosted widget inside a [`BundleChrome`](BUNDLE_CHROME.md), the popover trigger collapses to icon-only in **rail** mode (the popover panel itself is unaffected — its items still render normally when opened).

- If your trigger has neither an icon nor visible text in rail mode, the widget falls back to the default hamburger (`menu-2`) so the trigger remains clickable.
- `tooltip` (optional): shown by the chrome when the trigger is in icon-only state. Defaults to `trigger.text`, then `trigger.label`.
