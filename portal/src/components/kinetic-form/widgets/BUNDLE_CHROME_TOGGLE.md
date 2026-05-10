[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleChromeToggle Widget

External trigger widget for toggling a `BundleChrome` from anywhere on the page. Used to put a hamburger button in a header that drives a separate sidebar nav, or any other "open/close the chrome" affordance.

```js
// Initialize the BundleChromeToggle widget
bundle.widgets.BundleChromeToggle({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleChromeToggle.get(id);
```

## How it works

`BundleChromeToggle` subscribes to the `BundleChrome` registry at mount time. Subscriptions are queued — if the toggle mounts before its target chrome registers, the subscription is held and applied as soon as the chrome appears. This is what lets you place a header-mounted hamburger that drives the in-kapp nav: the header mounts at app load, and a per-kapp vertical chrome registers later as kapps load.

## Config

```js
window.bundle.widgets.BundleChromeToggle({
  container: K('content[Hamburger]').element(),
  id: 'kapp-toggle',
  config: {
    target: 'kapp',                  // BundleChrome id

    action: 'toggle',                // 'toggle' | 'show' | 'hide' | 'rail' | 'expand'

    icon: 'hamburger',               // default; or a Tabler icon name
    iconByState: {                   // optional; swaps icon based on chrome state
      expanded: 'x',
      rail: 'hamburger',
      hidden: 'hamburger',
    },

    size: 'md',                      // 'sm' | 'md' | 'lg' | 'xl'
    ariaLabel: 'Toggle navigation',
  },
});
```

## Action semantics

- **`toggle`** — primary "open/close" action. Cycles between `expanded` and the next collapsed state allowed for the chrome (`rail` if available, otherwise `hidden`).
- **`show`** — alias for `expand`. Goes to `expanded`.
- **`expand`** — goes to `expanded`.
- **`hide`** — goes to `hidden` (if allowed).
- **`rail`** — goes to `rail` (if allowed).

If an action targets a state not in the chrome's allowed `modes`, it's a no-op and a warning is logged.

## Icon selection

If `iconByState` is provided, it wins and the toggle rerenders its icon as the chrome changes mode. Otherwise `icon` is used statically.

The default icon is `'hamburger'` — three horizontal lines, the standard collapse-trigger look. Override with any [Tabler](https://tabler-icons.io/) icon name.

## Examples

### Hamburger that toggles a sidebar

A simple hamburger button mounted in a header element; toggles the kapp-level sidebar between expanded and rail (or hidden, depending on what the chrome allows).

```js
bundle.widgets.BundleChromeToggle({
  container: K('content[Hamburger]').element(),
  id: 'kapp-toggle',
  config: {
    target: 'kapp',
    action: 'toggle',
  },
});
```

### State-aware icon (hamburger ↔ X)

Swaps the icon based on the target chrome's current mode — a common UX pattern where the trigger reflects what clicking it will do.

```js
bundle.widgets.BundleChromeToggle({
  container: K('content[Header Toggle]').element(),
  id: 'header-toggle',
  config: {
    target: 'kapp',
    action: 'toggle',
    iconByState: {
      expanded: 'x',          // shows × when the nav is open
      rail:     'menu-2',     // shows hamburger when the nav is collapsed
      hidden:   'menu-2',
    },
    size: 'lg',
    ariaLabel: 'Open navigation',
  },
});
```

### Show / hide as separate triggers

Two specialized triggers — one to open, one to close. Useful when you want the open and close affordances in different places (e.g., open from a header button, close from a corner button on the nav itself).

```js
bundle.widgets.BundleChromeToggle({
  container: K('content[Open Help]').element(),
  config: { target: 'context', action: 'show', icon: 'help' },
  id: 'help-open',
});

bundle.widgets.BundleChromeToggle({
  container: K('content[Close Help]').element(),
  config: { target: 'context', action: 'hide', icon: 'x', size: 'sm' },
  id: 'help-close',
});
```

### Late-binding: target chrome doesn't exist yet

A toggle in the global header can target a per-kapp chrome that hasn't loaded yet. Subscriptions are queued until the chrome registers, so authoring order doesn't matter.

```js
// In the bundle's persistent header bundle script:
bundle.widgets.BundleChromeToggle({
  container: K('content[Sidebar Toggle]').element(),
  id: 'kapp-toggle',
  config: { target: 'kapp', action: 'toggle' },
});

// Later — when a kapp page loads — that page mounts:
bundle.widgets.BundleChrome({
  container: K('content[Sidebar]').element(),
  id: 'kapp',
  config: { orientation: 'vertical', items: [/* ... */] },
});

// The header's toggle now drives the freshly-mounted kapp chrome
// without any additional wiring.
```

## See also

- `BUNDLE_CHROME.md` — the chrome strip itself.
- `CHROME_ACTIONS.md` — `clickAction` and `target` vocabulary shared across chrome widgets.
