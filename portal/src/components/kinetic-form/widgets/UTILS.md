[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Utils

Utils are a set of utility functions provided by the portal code. They are accessed via `bundle.utils`.

```js
// How to access a utility function called `utilityFunction`
bundle.utils.utilityFunction(parameters);
```

### Available Utilities

- [Confirmation Modal](#confirmation-modal)
- [Toasts](#toasts)
- [Widget Events](#widget-events)
- [Programmatic Modals](#programmatic-modals)
- [Navigation](#navigation)

---

[Back to Top](#utils)

### Confirmation Modal

A confirmation modal verifies users actions, and trigger a callback based on the user's decision.

_Only one confirmation modal may be rendered at a time._

#### Functions

**`openConfirm(options)`** — *Function*  
Renders a confirmation modal. See [Confirmation Modal Options](#confirmation-modal-options) for details on available options.

**`closeConfirm()`** — *Function*  
Closes the open confirmation modal.

#### Confirmation Modal Options

**`title`** — *string*  
The title to render in the modal.

**`description`** — *string*  
The description to render in the modal.

**`accept()`** — *Function*  
The function to call when the user clicks the accept button.

**`acceptLabel`** — *string*  
The label for the accept button. Defaults to 'Continue'.

**`cancel()`** — *Function*  
The function to call when the user clicks the cancel button.

**`cancelLabel`** — *string*  
The label for the cancel button. Defaults to 'Cancel'.

#### Examples

```js
// Open a confirmation modal
bundle.utils.openConfirm({
  title: 'Are you sure?',
  description: 'This action cannot be undone.',
  accept: function () {
    // TODO: do something if the user confirms their decision
  },
  acceptLabel: 'Yes',
  cancel: function () {
    // TODO: do something if the user cancels the action
  },
  cancelLabel: 'No',
});

// Close the confirmation modal
bundle.utils.closeConfirm();
```

---

[Back to Top](#utils)

### Toasts

Toasts render alert messages to the user, which are displayed at the top middle of the screen for a few seconds.

#### Functions

**`toastSuccess(options)`** — *Function*  
Renders a success toast on the page. See [Toast Options](#toast-options) for details on available options.

**`toastError(options)`** — *Function*  
Renders an error toast on the page. See [Toast Options](#toast-options) for details on available options.

**`clearToasts()`** — *Function*  
Closes all currently open toasts.

#### Toast Options

**`title`** — *string*  
The title to render in the toast.

**`description`** — *string*  
The description to render in the toast.

**`duration`** — *number*  
The duration that the toast should be visible, in milliseconds. Success toasts default to 2 seconds, and error toasts default to 5 seconds.

**`id`** — *string*  
An optional id if the toast should appear in a specific context, such as inside a modal. The id must match an existing toast context.

#### Examples

```js
// Show a success toast that remains open for 3.5 seconds
bundle.utils.toastSuccess({
  title: 'Your action was successful',
  duration: 3500,
});

// Show an error toast
bundle.utils.toastError({
  title: 'There was an error performing your action',
  description: 'You do not have the proper permissions',
});

// Clear all toasts
bundle.utils.clearToasts();
```

---

[Back to Top](#utils)

### Widget Events

Two different listening helpers live here, for two different situations. Picking the right one matters — using the wrong one is what causes "my listener stopped firing after I navigated somewhere" bugs. The quick rule:

- **Your form OWNS the event name** (you defined it via `clickAction: { type: 'event', name: '<name>' }` on a chrome widget) → use [`onWidgetEvent`](#owned-events--onwidgetevent).
- **The bundle dispatches the event and your form is just one of possibly many listeners** (e.g. `bundle:container:navigated`) → use [`subscribeWidgetEvent`](#broadcast-events--subscribewidgetevent).

---

#### Owned events — `onWidgetEvent`

Several chrome widgets ([BundleLogo](BUNDLE_LOGO.md), [BundleLink](BUNDLE_LINK.md), [BundleAvatar](BUNDLE_AVATAR.md), [BundleSearch](BUNDLE_SEARCH.md)) can be configured with `clickAction: { type: 'event', name: '<name>' }`. When the widget is clicked, it dispatches a `CustomEvent` with that name on `window`. Your form is both the publisher (the widget you placed) and the subscriber (the handler you wrote), so it owns that event name end-to-end. `onWidgetEvent` is built for this case.

##### Functions

**`onWidgetEvent(name, handler)`** — *Function*  
Registers a handler for the given event name. **Replaces** any prior handler registered under the same name — safe to call on every form load without piling up listeners. Returns a cleanup function.

**`offWidgetEvent(name)`** — *Function*  
Removes the handler registered for an event name. No-op when nothing is registered.

##### Pick a unique event name

`onWidgetEvent` dedupes by event name alone — only **one** handler is active per event name across the entire app. If two different forms register handlers for the same name, the later registration wins and the earlier form's handler stops working with no warning.

So when you choose the `name` for your `clickAction: { type: 'event', name: '<name>' }`, pick something specific to your form's purpose — `'kapps-landing-help-clicked'`, not `'click'` or `'submit'`. If you ever find yourself wanting the same event name to drive logic in multiple forms, that's the signal to use `subscribeWidgetEvent` (below) instead.

##### Why not `window.addEventListener` for this case?

Form bundle scripts re-run on every form mount. Naive use of `window.addEventListener` adds a *new* listener each time, so after N mounts your handler fires N times per click. `onWidgetEvent` maintains one handler per event name — calling it again replaces the prior handler, which is exactly what you want when your form owns the event.

##### Event detail payload

Every widget-dispatched event has a `detail` object with:

| Field    | Type     | Description                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `widget` | `string` | The widget's name, e.g. `'BundleLogo'`. Useful when the same event name is dispatched by multiple widgets. |
| `id`     | `string` | The widget instance's id (the `id` you passed when initializing). Useful to disambiguate instances.        |
| `config` | `object` | The exact `clickAction` config that fired the event.                                                       |

##### Examples

```js
// Listen for a logo click event
bundle.utils.onWidgetEvent('kapps-landing-logo-clicked', e => {
  console.log('Logo clicked:', e.detail);
  // e.detail = { widget: 'BundleLogo', id: 'main-logo', config: { type: 'event', name: 'kapps-landing-logo-clicked' } }
});

// Stop listening
bundle.utils.offWidgetEvent('kapps-landing-logo-clicked');
```

---

#### Broadcast events — `subscribeWidgetEvent`

For events the **bundle itself** dispatches — chiefly [`bundle:container:navigated`](BUNDLE_CONTAINER.md#listen-for-navigation--bundlecontainernavigated-outbound) — multiple forms in your space may legitimately want to listen. A kapps-landing form might show/hide a section based on whether a container is blank; an analytics helper might log every navigation; a nested admin form might react to its own container's path changing. They all want the same event, and they shouldn't clobber each other.

`subscribeWidgetEvent` is built for this. It dedupes by `(event name + your label)` — so a given form's listener replaces cleanly on re-mount, but different forms with different labels coexist.

##### Functions

**`subscribeWidgetEvent(name, label, handler)`** — *Function*  
Subscribes a handler to a broadcast event with a per-listener label. Re-registering with the same `(name, label)` pair replaces the prior handler; different labels add separate handlers. Returns a cleanup function.

**`unsubscribeWidgetEvent(name, label)`** — *Function*  
Removes a handler registered for `(name, label)`. No-op when nothing is registered.

##### Pick a unique label

Your `label` is the second argument and identifies **this specific listener**. Two different listeners that pass the same `(name, label)` will clobber each other — the later one wins and the earlier one silently stops firing. That's the exact bug you came here to avoid.

A good label is:

- **Descriptive of the form AND its purpose** — `'kapps-landing-section-toggle'`, not `'main'` or `'handler'`.
- **Unique across your space** — if another form (or another developer, or an AI-generated form) could plausibly pick the same label by coincidence, pick a more specific one.
- **Stable across re-mounts of the same form** — use the same label every time your form's bundle script runs, so re-mounting cleanly replaces your prior listener instead of piling on a new one.

If you have two listeners in the same form for the same event (e.g. one toggles a section and one logs to analytics), give them different labels: `'kapps-landing-section-toggle'` and `'kapps-landing-analytics'`.

##### Example — show/hide a section based on container state

```js
// Inside the form that hosts a BundleContainer:
bundle.utils.subscribeWidgetEvent(
  'bundle:container:navigated',
  'kapps-landing-section-toggle',
  e => {
    if (e.detail.id !== 'kapp-container-url') return;
    if (e.detail.path === '') {
      K('section[Layout Container]').show();
    } else {
      K('section[Layout Container]').hide();
    }
  },
);
```

A separate admin form, nested deeper, can listen for the SAME event with a different label and the two listeners do not interfere:

```js
// Inside an admin form rendered by a nested container:
bundle.utils.subscribeWidgetEvent(
  'bundle:container:navigated',
  'admin-form-breadcrumb-update',
  e => {
    if (e.detail.id !== 'admin-content') return;
    updateBreadcrumb(e.detail.path);
  },
);
```

---

[Back to Top](#utils)

### Programmatic Modals

The chrome widgets accept `target: 'modal'` to open a click in a modal dialog. For full programmatic control — opening a modal from inside an event handler, after a timer, or in response to a server result — use these helpers directly.

The modal stack is global and stacked: a modal opened from inside another modal layers on top, rather than replacing it. So a form rendered in one modal can open another modal without coordinating with the embedding context.

#### Functions

**`openModal(config)`** — *Function*  
Opens a modal with the given configuration. Returns a close function that dismisses **this specific** modal.

**`closeModal(id?)`** — *Function*  
Closes a modal. With no argument, closes the topmost modal on the stack. With an id, closes that specific modal (no-op if not on the stack).

**`closeAllModals()`** — *Function*  
Closes every open modal. Useful for hard resets (e.g., after auth timeout).

#### Modal Config Options

**`type`** — *string (required)*  
One of:

- `'internal'` — render a bundle path in the modal. Requires `path`.
- `'home'` — render the user's resolved home (runs the landing resolver) in the modal. No additional fields.
- `'external'` — render an external URL via iframe in the modal. Requires `url`. **Note:** sites that send `X-Frame-Options: DENY` will appear blank.

**`path`** — *string*  
For `type: 'internal'`. Bundle path starting with `/` (e.g. `'/forms/help'`, `'/kapps/services'`).

**`url`** — *string*  
For `type: 'external'`. Full URL to embed.

**`size`** — *string*  
One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`, `'full'`.

**`title`** — *string*  
Optional title displayed in the modal header.

**`closeOn`** — *string[]*  
Subset of `['esc', 'backdrop', 'button']`. Default is all three. Pass `['esc', 'button']` to disable backdrop-click close (useful for forms where a stray click would lose work). Pass `[]` for fully programmatic-only close.

#### Examples

```js
// Open a help form in a large modal
const close = bundle.utils.openModal({
  type: 'internal',
  path: '/forms/help',
  size: 'lg',
  title: 'Help',
});

// Close it later (from a timer, callback, etc.)
setTimeout(close, 30000);

// Open and listen for an event from inside the modal that triggers close
const close2 = bundle.utils.openModal({
  type: 'internal',
  path: '/forms/submit',
  size: 'md',
});
bundle.utils.onWidgetEvent('form-submitted', () => close2());

// Open a modal where backdrop click won't close (force explicit dismiss)
bundle.utils.openModal({
  type: 'internal',
  path: '/forms/payment',
  size: 'lg',
  title: 'Payment',
  closeOn: ['esc', 'button'],
});

// Close the topmost modal from anywhere
bundle.utils.closeModal();

// Close everything (e.g., on logout)
bundle.utils.closeAllModals();
```

---

[Back to Top](#utils)

### Navigation

Navigates to another bundle page without reloading the app. Prefer this over `window.location.href` for any path inside the bundle — the React tree stays mounted (no re-fetch of space / profile / kapps), and the destination's back arrow can return to wherever the user came from automatically.

#### Functions

**`navigate(to, options?)`** — *Function*  
Routes to `to` (a bundle path starting with `/`). By default, captures the user's current path and attaches it as `backPath` state so the destination's back arrow returns there.

#### Navigate Options

**`to`** — *string (required)*  
Bundle path beginning with `/` — e.g. `'/settings/space'`, `'/kapps/services'`, `'/forms/help'`. Don't include the `#` — that's the HashRouter's concern, not yours.

**`backTo`** — *string | null | false*  
Override the destination's back target.

- Omitted *(default)* — captures the current `pathname + search` at call time. The destination's back arrow returns here.
- `string` — use this path verbatim as the back target.
- `null` or `false` — don't attach any `backPath`. The destination's hardcoded `backTo` prop wins.

**`replace`** — *boolean*  
When `true`, replaces the current history entry instead of pushing a new one. Browser back will skip this navigation. Useful for redirects-after-action where you don't want the user to navigate "back" to a stale form state.

**`state`** — *object*  
Extra state to merge into the destination's `location.state`. Rarely needed — most pages don't read state beyond `backPath`.

#### When to use `navigate` vs `window.location.href`

| Situation | Use |
| --- | --- |
| Any in-bundle path (`/kapps/...`, `/settings/...`, `/forms/...`, `/profile`) | `bundle.utils.navigate(path)` |
| External URL (`https://...`) | `window.open(url, '_blank')` or `<a target="_blank">` — not `navigate` |
| Force a full app reboot (e.g. after changing a space attribute that affects setup or landing resolution) | `window.location.reload()` or `window.location.href = '/'` |
| Switching to a different space/bundle | `window.location.href = absoluteUrl` |

The cost of `window.location.href` for an in-bundle path is real: the browser tears down the page, React unmounts, redux is rebuilt, and space / profile / kapp data are re-fetched before the next page paints. SPA navigation skips all of that.

#### How the back arrow knows where to go

The portal's `PageHeading` component reads `location.state.backPath` first. If present, the back arrow links there. If absent, it falls back to the page's own hardcoded `backTo` prop (which often points at `/`, `/kapps`, or another general landing). So `navigate` defaulting to "current page as backPath" gives form authors the right behavior without thinking about it.

#### Examples

```js
// Simplest — go to space settings, back arrow returns to the current page
bundle.utils.navigate('/settings/space');

// Override the back target — back arrow goes to a specific kapp
bundle.utils.navigate('/settings/space', { backTo: '/kapps/services' });

// Suppress the back hint — let the destination's own backTo apply
bundle.utils.navigate('/profile', { backTo: null });

// Replace current entry — browser back skips this navigation
bundle.utils.navigate('/kapps/services', { replace: true });

// Combine — most options can be mixed
bundle.utils.navigate('/forms/contact', {
  backTo: '/kapps/services',
  replace: true,
});
```

