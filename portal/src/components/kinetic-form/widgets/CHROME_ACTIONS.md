[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Chrome Widget Actions

The "Bundle\*" chrome widgets (`BundleLogo`, `BundleLink`, `BundleAvatar`, `BundleSearch`) share a consistent way of describing **what happens when the user clicks** and **where the result opens**. This page documents that shared system in one place; individual widget docs link here rather than repeating it.

### Table of Contents

- [clickAction](#clickaction)
- [target](#target)
- [Listening for `event` clickActions](#listening-for-event-clickactions)
- [Programmatic Modals](#programmatic-modals)

---

### clickAction

Every chrome widget that's clickable accepts a `clickAction` config that describes what the click does. The shape is a small discriminated union — pick the `type`, fill in any extra fields it needs.

```js
clickAction: { type: 'home' }
```

| `type`         | Behavior                                                                                                                                                                                                  | Required fields                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `'none'`       | The widget renders but is non-interactive. Default for every widget.                                                                                                                                       | none                                       |
| `'home'`       | Navigate the application to `/`. The bundle's landing resolver runs, sending the user to their personalized home (their `Default Kapp Slug` profile attribute, falling back to the space default).         | none                                       |
| `'internal'`   | Navigate the application to a specific bundle path.                                                                                                                                                       | `path` (string starting with `/`)          |
| `'external'`   | Open an external URL.                                                                                                                                                                                     | `url` (string)                             |
| `'event'`      | Dispatch a `CustomEvent` on `window` so form-side code can decide what to do. The widget itself does no navigation.                                                                                       | `name` (event name string)                 |
| `'openSearch'` | Open the bundle's built-in search modal. The `mode` controls whether the modal shows just a search input (`'searchOnly'`, default) or also categories and popular forms (`'full'`).                        | none (`mode` optional)                     |

#### Examples

```js
// Non-interactive (decorative logo, member badge, etc.)
{ type: 'none' }

// Navigate to the user's home
{ type: 'home' }

// Navigate to a specific bundle page
{ type: 'internal', path: '/kapps/services' }

// Navigate to an external site
{ type: 'external', url: 'https://kineticdata.com' }

// Fire a custom event your form handles
{ type: 'event', name: 'logo-clicked' }

// Open the bundle's search modal in 'full' mode
{ type: 'openSearch', mode: 'full' }
```

---

### target

The `target` config controls **where** the click opens. Every chrome widget that accepts a `clickAction` also accepts a `target`.

`target` accepts a simple string or an object form. Both are equivalent — strings are sugar that apply default options.

| Value                                  | Behavior                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `'current'` _(default)_                | Open in the current tab/page. Equivalent to `{ type: 'current' }`.                                     |
| `'new'`                                | Open in a new browser tab. Equivalent to `{ type: 'new' }`.                                            |
| `'modal'`                              | Open inside a modal dialog overlaying the current page. Equivalent to `{ type: 'modal' }` with defaults. |
| `{ type: 'modal', size, title, closeOn }` | Open in a modal with options.                                                                       |
| `{ type: 'container', id, replace }`   | Render inline inside a named [`BundleContainer`](BUNDLE_CONTAINER.md). Pair with `clickAction.type: 'internal'` or `'home'`. |

#### Modal options

| Field      | Type       | Description                                                                                                                                                                                            |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`     | `string`   | One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`, `'full'`. `'full'` renders an almost-full-viewport modal; useful for embedding entire kapp pages.                                                     |
| `title`    | `string`   | Optional title displayed in the modal header.                                                                                                                                                            |
| `closeOn`  | `array`    | Subset of `['esc', 'backdrop', 'button']`. Default is all three. Pass `['esc', 'button']` to disable backdrop-click close (useful for modals containing forms where a stray click would lose work). Pass `[]` for fully programmatic-only close. |
| `onClose`  | `function` | Optional callback fired exactly once when the modal closes — by **any** mechanism (esc, backdrop, button, programmatic close, or `closeAllModals`). Use it to refresh widgets or other UI that may have changed while the modal was open. Errors thrown inside `onClose` are caught and logged; one broken callback can't crash the modal stack. |

#### Container options

| Field     | Type      | Description                                                                                                                                                                              |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | `string`  | Required. The `config.id` of the [`BundleContainer`](BUNDLE_CONTAINER.md) instance to navigate. Containers with this id receive the click; if no container with this id is mounted, the click is a no-op. |
| `replace` | `boolean` | Optional. When `true`, the new path replaces the current entry in the container's history rather than pushing a new one — back button skips it. Default `false`.                       |

#### Notes

- `target` is **ignored** when `clickAction.type` is `'event'` — your event handler owns the destination.
- `target` is also effectively ignored when `clickAction.type` is `'openSearch'` — search opens its own dedicated modal.
- For `target: 'modal'` with `clickAction: 'external'`, the URL is rendered inside an `<iframe>`. Sites that send `X-Frame-Options: DENY` (which most major sites do) will appear blank — this is a browser limitation, not a bug.
- For `target: { type: 'container', ... }`, only `clickAction.type: 'internal'` and `'home'` route to the container. Pairing with `'external'` falls back to a normal anchor (containers render bundle pages, not arbitrary URLs).
- Modals stack rather than replace. A modal opened from inside another modal layers on top, so you can compose forms without coordinating with the embedding context.

#### Examples

```js
// Default — open in the current tab
target: 'current'

// Open in a new tab
target: 'new'

// Open in a modal with default size and close behavior
target: 'modal'

// Open in a large modal with a title
target: { type: 'modal', size: 'lg', title: 'Documentation' }

// Open in a modal where the backdrop click won't close (forces explicit close)
target: { type: 'modal', size: 'md', closeOn: ['esc', 'button'] }

// Open a modal and refresh a counter widget when it closes
target: {
  type: 'modal',
  size: 'lg',
  title: 'Unread Messages',
  onClose: () => bundle.widgets.BundleCounter.get('unread').refresh(),
}

// Render inline inside a named BundleContainer
target: { type: 'container', id: 'main' }

// Same, but replace the container's history entry instead of pushing
target: { type: 'container', id: 'main', replace: true }
```

#### Refreshing on close — common pattern

When a modal contains UI that mutates state visible elsewhere on the page (mark-as-read, approve / reject, edit a record), pair `target: 'modal'` with `onClose` to keep the rest of the page consistent without a full reload:

```js
// On the chrome widget that opens the modal:
bundle.widgets.BundleLink({
  container: K('content[Inbox Link]').element(),
  config: {
    text: 'Inbox',
    clickAction: { type: 'internal', path: '/kapps/services/inbox' },
    target: {
      type: 'modal',
      size: 'lg',
      title: 'Inbox',
      // The user might mark messages as read while the modal is open.
      // Refresh the counter when they close it so the badge stays honest.
      onClose: () => bundle.widgets.BundleCounter.get('unread').refresh(),
    },
  },
  id: 'inbox-link',
});
```

`onClose` fires regardless of how the user closed the modal — esc, backdrop, the X button, or your form code calling `bundle.utils.closeModal()`. So your refresh always runs.

---

### Listening for `event` clickActions

When a chrome widget has `clickAction: { type: 'event', name: 'foo' }`, clicking it dispatches a `CustomEvent` on `window`. Listen for it from your form bundle script using `bundle.utils.onWidgetEvent`:

```js
bundle.utils.onWidgetEvent('logo-clicked', e => {
  console.log('Logo clicked:', e.detail);
  // e.detail = { widget: 'BundleLogo', id: '<widget instance id>', config: <clickAction>, data: <data payload> }
});
```

The `event.detail` payload always contains:

| Field    | Type     | Description                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `widget` | `string` | The widget's name, e.g. `'BundleLogo'`. Useful when the same event name is dispatched by multiple widgets. |
| `id`     | `string` | The widget instance's id (whatever you passed to `id` when initializing). Useful to disambiguate instances. |
| `config` | `object` | The exact `clickAction` config that fired the event.                                                       |
| `data`   | `object` | Lifted from `clickAction.data` (empty `{}` when unset). The standard place for the consuming widget to attach event-specific payload — e.g., per-row identifiers from a list widget. Designers can also write a `data` block directly into a clickAction config; consuming widgets template-interpolate it like the rest of the clickAction.                                |

#### Attaching `data` to an event

`clickAction.data` is a plain object of fields that will appear on the dispatched event's `detail.data`. Widgets that template-interpolate clickAction values (like `Activity`) interpolate the `data` block too, so `{{row.id}}` and friends work per-instance:

```js
clickAction: {
  type: 'event',
  name: 'row-clicked',
  data: {
    requestId: '{{row.id}}',
    formSlug: '{{form.slug}}',
  },
}
```

Some widgets pre-populate sensible defaults — e.g., the `Activity` widget auto-injects `{ datasource, id }` for row clicks so handlers can always route off those. See each widget's docs for what it adds.

**Why `bundle.utils.onWidgetEvent` instead of `window.addEventListener`?** Your form's bundle script re-runs on every form mount. `window.addEventListener` adds a *new* listener each time, so after N mounts your handler fires N times per click. `bundle.utils.onWidgetEvent` maintains one handler per event name — calling it again replaces the prior handler. Safe to call on every form load.

See the [Utils documentation](UTILS.md) for full details.

---

### Programmatic Modals

`target: 'modal'` is the declarative way to open a modal. For more control — or to open a modal from inside an event handler — call `bundle.utils.openModal(config)`:

```js
const close = bundle.utils.openModal({
  type: 'internal',
  path: '/forms/help',
  size: 'lg',
  title: 'Help',
  closeOn: ['esc', 'button'],
});

// Later, programmatically close:
close();
```

The modal config supports the same `size`, `title`, and `closeOn` options as `target: 'modal'`. The function returns a close function that dismisses **this specific** modal.

You can also call `bundle.utils.closeModal()` to close the topmost modal regardless of who opened it, or `bundle.utils.closeModal(id)` if you stored the id. See the [Utils documentation](UTILS.md) for details.

---

[Back to Top](#chrome-widget-actions)
