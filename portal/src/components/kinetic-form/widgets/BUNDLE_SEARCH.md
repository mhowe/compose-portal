[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleSearch Widget

`BundleSearch` is a styled trigger that opens the bundle's built-in search modal by default. It's a thin wrapper around [BundleLink](BUNDLE_LINK.md) with `clickAction: { type: 'openSearch', mode: 'searchOnly' }` and `icon: 'search'` pre-applied.

If your form needs a different search experience (a custom kapp scope, a bespoke search form, an integration with another search system), you can override the `clickAction` to fire an event or navigate elsewhere — the widget is genuinely just a styled button; "open search" is the default behavior, not the only one.

```js
// Initialize the BundleSearch widget
bundle.widgets.BundleSearch({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleSearch.get(id);
```

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
An object of configurations for the widget. All fields optional.

> **`icon`** — *string*  
> [Tabler icon](https://tabler-icons.io/) name. Defaults to `'search'`.
>
> **`text`** — *string*  
> Optional label. By default the widget renders icon-only (matches the auto-rendered header). Add `text` for a wider button like "Search Services" or "Submit a Request".
>
> **`iconPosition`** — *string*  
> `'left'` _(default)_ or `'right'`.
>
> **`size`** — *string*  
> One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`.
>
> **`clickAction`** — *Object*  
> Defaults to `{ type: 'openSearch', mode: 'searchOnly' }`. Override for different search behavior:
>
> - `{ type: 'openSearch', mode: 'full' }` — open the full search UI with categories carousel and popular forms.
> - `{ type: 'event', name: 'open-it-search' }` — fire a custom event for your form to handle.
> - `{ type: 'internal', path: '/forms/my-search-form' }` — navigate to a custom search form.
> - Any other [clickAction](CHROME_ACTIONS.md#clickaction) type also works.
>
> **`target`** — *string or Object*  
> Where the click opens. See [Chrome Widget Actions](CHROME_ACTIONS.md#target).
>
> **`label`** — *string*  
> Accessibility label override.
>
> **`className`** — *string*  
> Override the default ghost-button styling.

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API.

### Examples

#### Default — icon-only trigger, opens "search only" modal

```js
bundle.widgets.BundleSearch({
  container: K('content[Search]').element(),
  id: 'search',
});
```

#### Open the full search UI (categories + popular)

```js
bundle.widgets.BundleSearch({
  container: K('content[Search]').element(),
  config: {
    text: 'Submit a Request',
    clickAction: { type: 'openSearch', mode: 'full' },
  },
  id: 'search',
});
```

#### Wire the trigger to a custom search experience

```js
// Form load:
bundle.widgets.BundleSearch({
  container: K('content[Search]').element(),
  config: {
    text: 'Find IT Services',
    clickAction: { type: 'event', name: 'open-it-search' },
  },
  id: 'it-search',
});

// Listen for the click and open your own search:
bundle.utils.onWidgetEvent('open-it-search', () => {
  bundle.utils.openModal({
    type: 'internal',
    path: '/forms/it-search-form',
    size: 'xl',
    title: 'IT Search',
  });
});
```

### Notes

- **`'searchOnly'` mode** shows just the search input and results list (matches the auto-rendered header's behavior).
- **`'full'` mode** shows the search input, categories carousel, and popular forms list (matches the "Submit a Request" entry point on the legacy Home page).
- **The bundle's built-in search is scoped to the configured Service Portal Kapp.** For multi-kapp portals where you want kapp-specific searches, use `clickAction: 'event'` and wire your own search experience.

See [Chrome Widget Actions](CHROME_ACTIONS.md) for full details on `clickAction` and `target`.

### Behavior inside `BundleChrome`

When mounted as a hosted widget inside a [`BundleChrome`](BUNDLE_CHROME.md), the search trigger collapses to an icon-only button in **rail** mode (the magnifier icon stays; the optional `text` label is hidden). The configured `clickAction` is unchanged — clicking still opens whatever the trigger is wired to.

- `tooltip` (optional): shown by the chrome when the trigger is in icon-only state. Defaults to `text`, then `'Search'`.
