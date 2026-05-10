[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleHeader Widget

`BundleHeader` renders the bundle's standard header inline at its mount point — the same content as the auto-rendered top-level header (logo, all-kapps grid icon, search, avatar, hamburger menu). Useful when you've turned off the auto-header (for example by setting a form's `Display Mode = fullscreen`) and want to drop the standard header somewhere on your form, or when you want to put a banner or environment marker above or below the header.

```js
// Initialize the BundleHeader widget
bundle.widgets.BundleHeader({ container, id });
```

### Parameters

![name=container](https://img.shields.io/badge/container-gray)
![type=HTMLElement](https://img.shields.io/badge/HTMLElement_or_array--like-e66e22)  
The DOM element to render the header into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

![name=id](https://img.shields.io/badge/id-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Optional id used by the widget machinery for instance tracking. Multiple BundleHeader instances on the same page should each get a distinct id.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API.

### Examples

#### Drop the standard header onto a fullscreen page

```js
bundle.widgets.BundleHeader({
  container: K('content[Header]').element(),
  id: 'header',
});
```

#### Header with an "environment marker" stripe above it

```html
<!-- In your form's HTML structure -->
<div style="background: red; color: white; text-align: center; padding: 4px;">
  DEVELOPMENT ENVIRONMENT
</div>
<!-- Content element where BundleHeader renders -->
```

```js
// In your form's bundle script
bundle.widgets.BundleHeader({
  container: K('content[Header]').element(),
  id: 'header',
});
```

### Notes

- **The widget renders inline at its mount point** (not via the `#app-header` portal that the auto-rendered header uses). Place it wherever you want the header to appear on the page.
- **All links navigate the application** (logo → home, all-kapps icon → `/kapps`, profile avatar → `/profile`, menu items, etc.) — same behavior as the auto-rendered header.
- **The widget always renders** regardless of whether the bundle's auto-rendered header is hidden via `Display Mode = fullscreen`. The form designer placed it on purpose; we don't second-guess.
- **Compose with `BundleEnvironmentBar`, `BundleBroadcast`, etc.** (when shipped) to put markers above or below the header.

For finer-grained control — rendering only the logo, or only the avatar, or rearranging the pieces — use the individual chrome widgets:

- [BundleLogo](BUNDLE_LOGO.md)
- [BundleLink](BUNDLE_LINK.md)
- [BundleAvatar](BUNDLE_AVATAR.md)
- [BundleSearch](BUNDLE_SEARCH.md)
