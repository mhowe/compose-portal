[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleLink Widget

`BundleLink` renders a configurable icon + text link. Generic enough for header navigation buttons, footer links, call-to-action buttons, or any clickable element with an icon and label.

```js
// Initialize the BundleLink widget
bundle.widgets.BundleLink({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleLink.get(id);
```

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
An object of configurations for the widget. At least one of <code>icon</code> or <code>text</code> is required.

> **`icon`** — *string*  
> [Tabler icon](https://tabler-icons.io/) name (e.g. `'home'`, `'border-all'`, `'settings'`). Invalid names render as a clearly-marked "missing" icon glyph.
>
> **`text`** — *string*  
> The label text. For dynamic values (user attributes, etc.), resolve form-side before calling the widget — e.g. `text: \`Welcome, ${identity('attribute:First Name')}\``.
>
> **`iconPosition`** — *string*  
> `'left'` _(default)_ or `'right'`. Position of the icon relative to the text.
>
> **`size`** — *string*  
> One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`. Controls padding, icon size, and font size as a coherent set.
>
> **`clickAction`** — *Object*  
> What happens when the link is clicked. Defaults to `{ type: 'none' }`. See [Chrome Widget Actions](CHROME_ACTIONS.md#clickaction) for the full list.
>
> **`target`** — *string or Object*  
> Where the click opens. See [Chrome Widget Actions](CHROME_ACTIONS.md#target).
>
> **`label`** — *string*  
> Accessibility label override. Auto-derived from `text` when not provided.
>
> **`className`** — *string*  
> Override the default ghost-button styling. Use DaisyUI semantic classes (e.g. `'kbtn kbtn-primary'`, `'kbtn kbtn-outline kbtn-lg'`), not raw Tailwind utility chains. Note: setting `className` replaces the `size`-derived classes — pick one approach per usage.

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API.

### Examples

#### Icon + text link, navigates home

```js
bundle.widgets.BundleLink({
  container: K('content[Home]').element(),
  config: {
    icon: 'home',
    text: 'Home',
    clickAction: { type: 'home' },
  },
  id: 'home-link',
});
```

#### "Docs" link with right-positioned external arrow, opens in new tab

```js
bundle.widgets.BundleLink({
  container: K('content[Docs]').element(),
  config: {
    text: 'Documentation',
    icon: 'external-link',
    iconPosition: 'right',
    clickAction: { type: 'external', url: 'https://docs.example.com' },
    target: 'new',
  },
  id: 'docs-link',
});
```

#### User-personalized greeting (form-side resolves the name)

```js
bundle.widgets.BundleLink({
  container: K('content[Greeting]').element(),
  config: {
    icon: 'user',
    text: `Welcome, ${identity('attribute:First Name')}`,
    clickAction: { type: 'internal', path: '/profile' },
    label: 'Open profile',
  },
  id: 'greeting',
});
```

#### Help link, opens in a modal with no backdrop dismissal

```js
bundle.widgets.BundleLink({
  container: K('content[Help]').element(),
  config: {
    icon: 'help',
    text: 'Help',
    clickAction: { type: 'internal', path: '/forms/help' },
    target: {
      type: 'modal',
      size: 'lg',
      title: 'Help',
      closeOn: ['esc', 'button'], // backdrop click won't dismiss
    },
  },
  id: 'help',
});
```

#### Custom-styled "Submit Request" call-to-action

```js
bundle.widgets.BundleLink({
  container: K('content[CTA]').element(),
  config: {
    icon: 'send',
    text: 'Submit Request',
    clickAction: { type: 'event', name: 'submit-clicked' },
    className: 'kbtn kbtn-primary kbtn-lg',
  },
  id: 'cta',
});

bundle.utils.onWidgetEvent('submit-clicked', () => {
  // Form-side handler decides what to do
});
```

### Notes

- **At least one of `icon` or `text` is required.** Validation rejects configs that omit both.
- **Icon-only renders as a square button** (`kbtn-square`). Icon+text or text-only render as a regular button.
- **The `Icon` atom uses [Tabler Icons](https://tabler-icons.io/).** Browse the catalog there for valid names.
- For dynamic text (user attributes, dates, etc.), resolve form-side and pass the resolved string. The widget receives static config.

See [Chrome Widget Actions](CHROME_ACTIONS.md) for full details on `clickAction` and `target`, including modal options and event listeners.

### Behavior inside `BundleChrome`

When mounted as a hosted widget inside a [`BundleChrome`](BUNDLE_CHROME.md), `BundleLink`'s text is hidden in **rail** mode (icon-only button), provided an `icon` is configured. If no icon is configured, the text remains so the link still has something to render.

Optional `tooltip` config: shown by the chrome when the link is in icon-only state. Defaults to `text` (then `label`) if omitted.
