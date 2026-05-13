[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleAvatar Widget

`BundleAvatar` renders a user avatar — either an image, or an initial-letter placeholder when no image is provided. By default the avatar is for the logged-in user; you can override with an explicit username for showing assignees, comment authors, etc.

```js
// Initialize the BundleAvatar widget
bundle.widgets.BundleAvatar({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleAvatar.get(id);
```

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
An object of configurations for the widget. All fields optional.

> **`username`** — *string*  
> The username to display. The first letter (uppercased) is used for the placeholder when no image is shown. Defaults to the logged-in user's username when not provided.
>
> **`imageSrc`** — *string*  
> URL of an image to display instead of the initial-letter placeholder. If the image fails to load, the avatar falls back to the placeholder gracefully (no broken-image icon).
>
> For dynamic image sources (gravatar, profile attribute, image library), resolve the URL form-side and pass the resolved string here. Don't put templating in the config.
>
> **`size`** — *string*  
> One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`.
>
> **`color`** — *string*  
> One of `'primary'` or `'neutral'`. Optional — leaving it undefined lets a `className`-supplied color apply without conflict.
>
> **`clickAction`** — *Object*  
> What happens when the avatar is clicked. Defaults to `{ type: 'none' }`. See [Chrome Widget Actions](CHROME_ACTIONS.md#clickaction).
>
> **`target`** — *string or Object*  
> Where the click opens. See [Chrome Widget Actions](CHROME_ACTIONS.md#target).
>
> **`label`** — *string*  
> Accessibility label override. Auto-derived from `username` when not provided.
>
> **`className`** — *string*  
> Override the default kavatar styling. Use DaisyUI semantic classes, not raw Tailwind utility chains.
>
> **Color caveat:** when you set both `config.color` and a `className` that also affects color, results are unpredictable — both target the same CSS variables and source order decides which wins. Pick one approach per usage.

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API.

### Examples

#### Default — current user's initial-letter avatar, non-interactive

```js
bundle.widgets.BundleAvatar({
  container: K('content[Avatar]').element(),
  id: 'avatar',
});
```

#### Header-style avatar (large, clicks open profile)

```js
bundle.widgets.BundleAvatar({
  container: K('content[Avatar]').element(),
  config: {
    size: 'lg',
    clickAction: { type: 'internal', path: '/profile' },
    label: 'Open profile',
  },
  id: 'avatar',
});
```

#### Assignee avatar with image and event-based click

```js
bundle.widgets.BundleAvatar({
  container: K('content[Assignee]').element(),
  config: {
    username: 'jdoe',
    imageSrc: `${profileImageUrl('jdoe')}`,
    size: 'sm',
    label: 'Jane Doe',
    clickAction: { type: 'event', name: 'assignee-clicked' },
  },
  id: 'assignee',
});

bundle.utils.onWidgetEvent('assignee-clicked', e => {
  console.log('Assignee clicked:', e.detail.id);
  // ...do something
});
```

#### Avatar opening profile in a modal

```js
bundle.widgets.BundleAvatar({
  container: K('content[Avatar]').element(),
  config: {
    size: 'md',
    clickAction: { type: 'internal', path: '/profile' },
    target: { type: 'modal', size: 'md', title: 'Profile' },
  },
  id: 'avatar',
});
```

### Notes

- **Default username is the logged-in user.** Pass `username` only when showing someone else's avatar.
- **Image fallback is automatic.** When `imageSrc` 404s or otherwise fails, the avatar renders the initial-letter placeholder instead of a broken-image icon.
- **For multiple users at once** (assignee chips, "people in this thread"), a future composite widget will render multiple avatars from a username array. Until then, drop multiple `BundleAvatar` instances on the page.

See [Chrome Widget Actions](CHROME_ACTIONS.md) for full details on `clickAction` and `target`.

### Behavior inside `BundleChrome`

When mounted as a hosted widget inside a [`BundleChrome`](BUNDLE_CHROME.md), the avatar shrinks in **rail** mode.

- `railSize` (optional): one of `'sm' | 'md' | 'lg' | 'xl'`. Defaults to `'sm'`.
- `tooltip` (optional): shown by the chrome when the entry is in icon-only state. Defaults to `label`, then `username`.
