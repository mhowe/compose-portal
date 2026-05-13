[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleLogo Widget

`BundleLogo` renders the bundle's logo with configurable size and click behavior. By default it shows the themed logo (whatever the space's Theme attribute or bundle default specifies); designers can override with the bundled svg or a custom URL.

```js
// Initialize the BundleLogo widget
bundle.widgets.BundleLogo({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleLogo.get(id);
```

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking.

**`config`** — *Object*  
An object of configurations for the widget. All fields optional.

> **`src`** — *string*  
> Image source. One of:
> 
> - `'theme'` *(default)* — uses the space's themed logo, falling back to the bundled svg.
> - `'bundled'` — uses the bundled svg directly, ignoring the theme.
> - Any other string — treated as an explicit image URL.
> 
> **`size`** — *string*  
> One of `'sm'`, `'md'` *(default)*, `'lg'`, `'xl'`. Controls the logo's height and max width.
> 
> **`clickAction`** — *Object*  
> What happens when the logo is clicked. Defaults to `{ type: 'none' }` (decorative, non-interactive). See [Chrome Widget Actions](CHROME_ACTIONS.md#clickaction) for the full list of types.
> 
> **`target`** — *string or Object*  
> Where the click opens. One of `'current'` *(default)*, `'new'`, `'modal'`, or an object form for modal options. See [Chrome Widget Actions](CHROME_ACTIONS.md#target) for details.
> 
> **`label`** — *string*  
> Accessibility label / tooltip. Auto-derived for `clickAction.type: 'home'` ("Home") and `'external'` ("Open hostname.com"). Provide explicitly for `'internal'` and `'event'` types.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API.

### Examples

#### Decorative logo (default)

```js
bundle.widgets.BundleLogo({
  container: K('content[Logo]').element(),
  id: 'logo',
});
```

#### Logo that takes the user home (runs the landing resolver)

```js
bundle.widgets.BundleLogo({
  container: K('content[Logo]').element(),
  config: {
    size: 'lg',
    clickAction: { type: 'home' },
  },
  id: 'logo',
});
```

#### Logo linking to an external site, opening in a new tab

```js
bundle.widgets.BundleLogo({
  container: K('content[Logo]').element(),
  config: {
    clickAction: { type: 'external', url: 'https://kineticdata.com' },
    target: 'new',
    label: 'Visit Kinetic Data',
  },
  id: 'logo',
});
```

#### Logo that fires a custom event for the form to handle

```js
// Form load:
bundle.widgets.BundleLogo({
  container: K('content[Logo]').element(),
  config: {
    clickAction: { type: 'event', name: 'logo-clicked' },
    label: 'Click me',
  },
  id: 'logo',
});

// Listen for the event:
bundle.utils.onWidgetEvent('logo-clicked', e => {
  console.log('Logo clicked:', e.detail);
});
```

#### Custom image URL with a fixed-size override

```js
bundle.widgets.BundleLogo({
  container: K('content[Logo]').element(),
  config: {
    src: 'https://example.com/path/to/our-logo.svg',
    size: 'xl',
    clickAction: { type: 'home' },
  },
  id: 'logo',
});
```

### Notes

- For dynamic image sources (gravatar, profile attribute, image library), resolve the URL form-side and pass it to `src` as a static string. Don't build templating into the widget.
- See [Chrome Widget Actions](CHROME_ACTIONS.md) for full details on `clickAction` and `target`, including how to open the click in a modal.

### Behavior inside `BundleChrome`

When mounted as a hosted widget inside a [`BundleChrome`](BUNDLE_CHROME.md), the logo automatically shrinks in **rail** mode.

**`railSize`** — *string*, optional  
One of `'sm' | 'md' | 'lg' | 'xl'`. The size to render at when the chrome is in rail mode. Defaults to `'sm'` so the logo fits in a typical rail strip.

**`railSrc`** — *string*, optional  
An alternative image source to use in rail mode — useful when you have a separate "mark" version of your logo. Same syntax as `src` (`'theme'`, `'bundled'`, or a URL). Defaults to whatever `src` is.

**`tooltip`** — *string*, optional  
Shown by the chrome when the entry is in icon-only state. Defaults to `label` if omitted.
