[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleChrome Widget

A configurable chrome strip that hosts links, dividers, section labels, and other widgets. One widget, one config shape; `orientation: 'vertical' | 'horizontal'` flips between sidebar nav and header.

```js
// Initialize the BundleChrome widget
bundle.widgets.BundleChrome({ container, config, id });

// Retrieve a reference to the widget's controller
bundle.widgets.BundleChrome.get(id);
```

## Two-layer convention

`BundleChrome` is designed to be used at two layers in a bundle, without conflict:

| Layer | Orientation | Mounts at | Conventional `id` | Owner |
|---|---|---|---|---|
| Bundle | `horizontal` | App root header element | `'header'` | Bundle (same on every page) |
| Kapp | `vertical` | Inside the kapp's content area | `'kapp'` | The kapp page (changes per kapp) |

Rules that keep them from colliding:

- **DOM nesting:** the kapp-level vertical chrome mounts *inside* the kapp content, never as a sibling of the header. Switching kapps then unmounts/remounts it cleanly via the existing `registerWidget` MutationObserver path.
- **Distinct `contentSelector`s:** the header pushes one content area (e.g. `.kd-app-content`); the kapp nav pushes a deeper one (e.g. `.kd-kapp-content`).
- **z-index ordering:** the header sits above kapp-level overlays so toggles in the header always remain reachable.
- **Two toggles, never one shared:** each chrome has its own `BundleChromeToggle` instance.
- **Reserved ids are conventional, not enforced.** Using `'header'` and `'kapp'` lets a hamburger toggle in the header consistently target the current kapp's vertical chrome regardless of which kapp is loaded — the registry's queued-subscriptions handle mount-order.

## Orientation and state

```
orientation:     'vertical' | 'horizontal'   (default 'vertical')
side:            'left' | 'right'            (vertical only; default 'left')
modes:           list of allowed modes
defaultMode:     starting mode
layout:          'push' | 'overlay'          (default 'push')
contentSelector: CSS selector — what reflows in push mode
```

Default `modes` per orientation:

- **vertical**: `['expanded', 'rail', 'hidden']`
- **horizontal**: `['expanded', 'hidden']` — `'rail'` allowed if explicitly listed; if used, hides item labels at the same height.

## Slots

Three regions. `top` and `bottom` are pinned, `items` is the scrollable middle.

```
top:    [ entry, … ]   (vertical: top of strip;   horizontal: leftmost cluster)
items:  [ entry, … ]   (vertical: middle strip;   horizontal: middle of header)
bottom: [ entry, … ]   (vertical: bottom of strip; horizontal: rightmost cluster)
```

## Slot entry kinds

```js
// link — built-in renderable, lightweight
{ type: 'link', id, label, icon, clickAction, target?, tooltip? }

// section heading — visible in expanded; collapses to a thin divider in rail
{ type: 'section', id, label }

// divider — explicit rule
{ type: 'divider' }

// widget reference — mounts a registered bundle widget by name
{ widget: 'BundleSearch', config: { ... }, id?, tooltip? }
```

**`type: 'link'` vs `widget: 'BundleLink'`.** Both render a clickable icon+label. Prefer built-in `link` for simple navigation — lighter to render, fewer config knobs. Use `BundleLink` when you need its full config (custom className, etc.).

## Active state

- No auto-detection. Default: nothing active.
- `chrome.setActiveItem(itemId | null)` — single active across built-in `link` items.
- Renders `data-active="true"` on the item element. No default class, no styling. Host CSS targets `[data-active="true"]`.
- Hosted widgets manage their own active state — chrome does not touch them.

## Tooltips

- Each entry may carry `tooltip: string`. Built-in `link` items default to their `label` if `tooltip` is omitted.
- Chrome renders the tooltip whenever the entry shows without visible text — i.e. in any rail mode.
- Tooltip rendering is centralized in the chrome; widgets don't render their own.

## Internal toggle

```js
internalToggle: {
  show: true,                     // default true
  icon: 'chevron',                // default; auto-flips with side / orientation
  position: 'top',                // 'top' | 'bottom' | 'edge-mid'
  ariaLabel: 'Collapse navigation',
}
```

## Mode contract for hosted widgets

Any widget mounted via a `widget` entry can opt into mode awareness by exposing `setMode(mode)` on its api object. The chrome:

1. Calls `api.setMode(currentMode)` immediately after the widget's `create()` resolves.
2. Calls `api.setMode(newMode)` on every chrome state transition.
3. Always sets a CSS class on the slot element: `kd-chrome-mode-expanded | kd-chrome-mode-rail | kd-chrome-mode-hidden`. Widgets without `setMode` adapt via CSS only.

Late mounters can query the current mode via `chrome.getMode()`.

## Coordination registry

```js
window.bundle.widgets.BundleChrome.get(id)            // -> controller or undefined
window.bundle.widgets.BundleChrome.on(id, event, fn)  // queues if not yet registered
window.bundle.widgets.BundleChrome.off(id, event, fn)
```

Controller (returned by `get(id)` and as the api on `create()` resolution):

```js
{
  id,
  getMode(), setMode(mode),
  toggle(),                  // expanded ↔ rail (or ↔ hidden if rail not allowed)
  expand(), collapse(), hide(),
  setActiveItem(id | null),
  getActiveItem(),
  getOrientation(), getSide(),
  destroy(),
}
```

Events: `change ({ mode, prev })`, `destroy`.

## Accessibility

- `role="navigation"` with `aria-label`.
- `aria-expanded` on the internal toggle.
- `aria-hidden="true"` on labels suppressed in rail.
- `Esc` closes overlay-hidden mode.

## Config reference

```js
window.bundle.widgets.BundleChrome({
  container: K('content[Header]').element(),
  id: 'header',
  config: {
    // Orientation
    orientation: 'horizontal',
    side: 'left',

    // State machine
    modes: ['expanded', 'hidden'],
    defaultMode: 'expanded',

    // Layout
    layout: 'push',
    contentSelector: '.kd-app-content',

    // Accessibility
    ariaLabel: 'Top navigation',

    // Internal toggle
    internalToggle: {
      show: true,
      icon: 'chevron',
      position: 'top',
      ariaLabel: 'Collapse navigation',
    },

    // Slots
    top:    [ /* entries */ ],
    items:  [ /* entries */ ],
    bottom: [ /* entries */ ],
  },
});
```

## Out of scope (v2)

These are intentionally deferred. Each is additive — adding any later does not break v1 configs.

- **Persistence** of mode across reloads (`localStorage`-backed).
- **Breakpoints** array for responsive mode/layout swaps.
- **Hover-to-peek** rail expansion.
- **`cycle()`** controller method (covered by explicit `setMode`).
- **`before-change`** cancellable event.
- **Per-item `activeClass`** (use host CSS on `[data-active="true"]`).
- **Inline `render` slot kind** for non-widget one-offs.
- **Adornments inside link rows** (counts go as separate `items` entries for now).
- **Nested groups / collapsible sub-menus**.
- **Role-gated `visible: boolean | () => boolean`** predicates on items.

## Examples

### Horizontal: minimal header

A typical top-of-page header — logo on the left, a few navigation links in the middle, an avatar on the right.

```js
bundle.widgets.BundleChrome({
  container: K('content[Header]').element(),
  id: 'header',
  config: {
    orientation: 'horizontal',
    ariaLabel: 'Top navigation',
    top: [
      {
        widget: 'BundleLogo',
        config: { src: 'theme', clickAction: { type: 'home' } },
      },
    ],
    items: [
      { type: 'link', id: 'home',     label: 'Home',     icon: 'home',
        clickAction: { type: 'home' } },
      { type: 'link', id: 'requests', label: 'Requests', icon: 'inbox',
        clickAction: { type: 'internal', path: '/kapps/services' } },
      { type: 'link', id: 'reports',  label: 'Reports',  icon: 'chart-bar',
        clickAction: { type: 'internal', path: '/kapps/reports' } },
    ],
    bottom: [
      {
        widget: 'BundleAvatar',
        config: { clickAction: { type: 'internal', path: '/profile' } },
      },
    ],
  },
});
```

### Horizontal: header with search and overflow menu

A richer header — logo, in-context search trigger, a quick-action menu with nested items, an open-tickets counter, and the user avatar.

```js
bundle.widgets.BundleChrome({
  container: K('content[Header]').element(),
  id: 'header',
  config: {
    orientation: 'horizontal',
    top: [
      { widget: 'BundleLogo', config: { src: 'theme', clickAction: { type: 'home' } } },
    ],
    items: [
      { widget: 'BundleSearch', config: { text: 'Search...' } },
    ],
    bottom: [
      {
        widget: 'BundleCounter',
        id: 'open-tickets',
        config: {
          integration: {
            kappSlug: 'services',
            integrationName: 'My Open Tickets',
            listProperty: 'Submissions',
          },
          thresholds: [
            { upTo: 5,  color: 'success' },
            { upTo: 15, color: 'warning' },
            { color: 'error' },
          ],
          clickAction: { type: 'internal', path: '/kapps/services/inbox' },
        },
      },
      {
        widget: 'BundleMenu',
        id: 'quick-actions',
        config: {
          trigger: { icon: 'plus' },
          items: [
            { icon: 'file-plus',    text: 'New Request',
              clickAction: { type: 'internal', path: '/kapps/services/categories' } },
            { icon: 'calendar-plus', text: 'New Event',
              clickAction: { type: 'internal', path: '/kapps/scheduler/new' } },
            { divider: true },
            { icon: 'settings', text: 'Preferences',
              clickAction: { type: 'internal', path: '/profile' } },
          ],
        },
      },
      {
        widget: 'BundleAvatar',
        config: {
          size: 'md',
          clickAction: { type: 'internal', path: '/profile' },
        },
      },
    ],
  },
});
```

### Horizontal: collapsible header with rail mode

A header that can be collapsed to icon-only via the included rail mode. The internal toggle (chevron at the right edge) lets the user shrink it inline; an external `BundleChromeToggle` could drive it from anywhere else.

```js
bundle.widgets.BundleChrome({
  container: K('content[Header]').element(),
  id: 'header',
  config: {
    orientation: 'horizontal',
    modes: ['expanded', 'rail'],     // include 'rail' explicitly for horizontal
    defaultMode: 'expanded',
    items: [
      { type: 'link', id: 'home',    label: 'Home',    icon: 'home',
        clickAction: { type: 'home' } },
      { type: 'link', id: 'admin',   label: 'Admin',   icon: 'shield',
        clickAction: { type: 'internal', path: '/admin' } },
      { type: 'link', id: 'support', label: 'Support', icon: 'lifebuoy',
        clickAction: { type: 'external', url: 'https://help.example.com' } },
    ],
    bottom: [
      { widget: 'BundleAvatar', config: { clickAction: { type: 'internal', path: '/profile' } } },
    ],
  },
});

// Drive the active item from a router callback or similar.
bundle.widgets.BundleChrome.get('header').setActiveItem('home');
```

### Vertical: minimal sidebar

A simple left-side sidebar with grouped navigation items. All three modes (expanded / rail / hidden) are available by default.

```js
bundle.widgets.BundleChrome({
  container: K('content[Sidebar]').element(),
  id: 'kapp',
  config: {
    orientation: 'vertical',
    side: 'left',
    ariaLabel: 'Kapp navigation',
    items: [
      { type: 'section', label: 'Workspace' },
      { type: 'link', id: 'inbox',   label: 'Inbox',     icon: 'inbox',
        clickAction: { type: 'internal', path: '/inbox' } },
      { type: 'link', id: 'tickets', label: 'My Tickets', icon: 'ticket',
        clickAction: { type: 'internal', path: '/tickets' } },
      { type: 'divider' },
      { type: 'section', label: 'Reports' },
      { type: 'link', id: 'open',    label: 'Open',     icon: 'eye',
        clickAction: { type: 'internal', path: '/reports/open' } },
      { type: 'link', id: 'closed',  label: 'Closed',   icon: 'check',
        clickAction: { type: 'internal', path: '/reports/closed' } },
    ],
  },
});
```

### Vertical: full sidebar with logo, search, and avatar

A richer sidebar — logo at the top, search and link items in the middle, counter and avatar pinned to the bottom. In rail mode, every entry collapses to its icon while preserving navigability.

```js
bundle.widgets.BundleChrome({
  container: K('content[Sidebar]').element(),
  id: 'kapp',
  config: {
    orientation: 'vertical',
    side: 'left',
    defaultMode: 'expanded',
    top: [
      {
        widget: 'BundleLogo',
        config: {
          src: 'theme',
          // In rail mode, the logo automatically falls back to size 'sm';
          // override with a different image via railSrc if you have one.
          railSize: 'sm',
          clickAction: { type: 'home' },
        },
      },
      { widget: 'BundleSearch', config: { text: 'Search' } },
    ],
    items: [
      { type: 'section', label: 'Main' },
      { type: 'link', id: 'home',     label: 'Home',     icon: 'home',
        clickAction: { type: 'home' } },
      { type: 'link', id: 'requests', label: 'Requests', icon: 'inbox',
        clickAction: { type: 'internal', path: '/kapps/services' } },
      { type: 'divider' },
      { type: 'section', label: 'Admin' },
      { type: 'link', id: 'users',    label: 'Users',    icon: 'users',
        clickAction: { type: 'internal', path: '/admin/users' } },
      { type: 'link', id: 'theme',    label: 'Theme',    icon: 'palette',
        clickAction: { type: 'internal', path: '/admin/theme' } },
    ],
    bottom: [
      {
        widget: 'BundleCounter',
        id: 'notifications',
        config: {
          text: 'Notifications',
          layout: 'stacked',
          integration: {
            kappSlug: 'services',
            integrationName: 'Unread Notifications',
            listProperty: 'Submissions',
          },
          clickAction: { type: 'internal', path: '/notifications' },
        },
      },
      {
        widget: 'BundleAvatar',
        config: {
          size: 'md',
          railSize: 'sm',
          clickAction: { type: 'internal', path: '/profile' },
        },
      },
    ],
  },
});
```

### Vertical: right-side overlay nav

Mounts as an overlay on the right edge of the viewport — content is unaffected by layout flow. Useful for secondary navs that should slide in over content.

```js
bundle.widgets.BundleChrome({
  container: K('content[ContextPanel]').element(),
  id: 'context',
  config: {
    orientation: 'vertical',
    side: 'right',
    layout: 'overlay',
    modes: ['expanded', 'hidden'],
    defaultMode: 'hidden',
    items: [
      { type: 'section', label: 'Tools' },
      { type: 'link', id: 'docs',  label: 'Documentation', icon: 'book',
        clickAction: { type: 'external', url: 'https://docs.example.com' } },
      { type: 'link', id: 'chat',  label: 'Chat with us',  icon: 'message-circle',
        clickAction: { type: 'event', name: 'open-chat' } },
    ],
  },
});

// Toggle from anywhere else with a BundleChromeToggle:
//   bundle.widgets.BundleChromeToggle({
//     container: K('content[Help Button]').element(),
//     config: { target: 'context', action: 'toggle', icon: 'help' },
//   });
```

### Driving from JavaScript

Once a `BundleChrome` is mounted, its controller is reachable via the registry. Useful for wiring active-state to your router, or programmatically opening/closing the chrome from form-level event handlers.

```js
// After the chrome has mounted (await the create promise, or use the registry):
const chrome = bundle.widgets.BundleChrome.get('kapp');

// Programmatic state transitions:
chrome.expand();
chrome.setMode('rail');
chrome.toggle();        // expanded ↔ rail (or ↔ hidden if rail not allowed)

// Active-item highlight (host CSS targets [data-active="true"]):
chrome.setActiveItem('home');
chrome.setActiveItem(null);   // clear

// React to mode changes from outside the chrome:
bundle.widgets.BundleChrome.on('kapp', 'change', ({ mode, prev }) => {
  console.log(`kapp nav: ${prev} → ${mode}`);
});
```

## See also

- `BUNDLE_CHROME_TOGGLE.md` — external trigger widget.
- `CHROME_ACTIONS.md` — `clickAction` and `target` vocabulary shared across chrome widgets.
