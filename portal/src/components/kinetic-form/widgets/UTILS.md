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

---

[Back to Top](#utils)

### Confirmation Modal

A confirmation modal verifies users actions, and trigger a callback based on the user's decision.

_Only one confirmation modal may be rendered at a time._

#### Functions

![name=openConfirm](https://img.shields.io/badge/openConfirm%28options%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Renders a confirmation modal. See [Confirmation Modal Options](#confirmation-modal-options) for details on available options.

![name=closeConfirm](https://img.shields.io/badge/closeConfirm%28%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Closes the open confirmation modal.

#### Confirmation Modal Options

![name=title](https://img.shields.io/badge/title-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
The title to render in the modal.

![name=description](https://img.shields.io/badge/description-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
The description to render in the modal.

![name=accept](https://img.shields.io/badge/accept%28%29-gray)
![type=function](https://img.shields.io/badge/Function-e66e22)  
The function to call when the user clicks the accept button.

![name=acceptLabel](https://img.shields.io/badge/acceptLabel-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
The label for the accept button. Defaults to 'Continue'.

![name=cancel](https://img.shields.io/badge/cancel%28%29-gray)
![type=function](https://img.shields.io/badge/Function-e66e22)  
The function to call when the user clicks the cancel button.

![name=cancelLabel](https://img.shields.io/badge/cancelLabel-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
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

![name=toastSuccess](https://img.shields.io/badge/toastSuccess%28options%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Renders a success toast on the page. See [Toast Options](#toast-options) for details on available options.

![name=toastError](https://img.shields.io/badge/toastError%28options%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Renders an error toast on the page. See [Toast Options](#toast-options) for details on available options.

![name=clearToasts](https://img.shields.io/badge/clearToasts%28%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Closes all currently open toasts.

#### Toast Options

![name=title](https://img.shields.io/badge/title-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
The title to render in the toast.

![name=description](https://img.shields.io/badge/description-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
The description to render in the toast.

![name=duration](https://img.shields.io/badge/duration-gray)
![type=number](https://img.shields.io/badge/number-e66e22)  
The duration that the toast should be visible, in milliseconds. Success toasts default to 2 seconds, and error toasts default to 5 seconds.

![name=id](https://img.shields.io/badge/id-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
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

Several chrome widgets ([BundleLogo](BUNDLE_LOGO.md), [BundleLink](BUNDLE_LINK.md), [BundleAvatar](BUNDLE_AVATAR.md), [BundleSearch](BUNDLE_SEARCH.md)) can be configured with `clickAction: { type: 'event', name: '<name>' }`. When the widget is clicked, it dispatches a `CustomEvent` with that name on `window`. These helpers let your form-side code listen for those events safely across re-renders.

#### Functions

![name=onWidgetEvent](https://img.shields.io/badge/onWidgetEvent%28name,%20handler%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Registers a handler for the given event name. **Replaces** any prior handler registered under the same name — safe to call on every form load without piling up listeners. Returns a cleanup function.

![name=offWidgetEvent](https://img.shields.io/badge/offWidgetEvent%28name%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Removes the handler registered for an event name. No-op when nothing is registered.

#### Why use `onWidgetEvent` instead of `window.addEventListener`?

Form bundle scripts re-run on every form mount. Naive use of `window.addEventListener` adds a *new* listener each time, so after N mounts your handler fires N times per click. `onWidgetEvent` maintains one handler per event name — calling it again replaces the prior handler.

#### Event detail payload

Every widget-dispatched event has a `detail` object with:

| Field    | Type     | Description                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `widget` | `string` | The widget's name, e.g. `'BundleLogo'`. Useful when the same event name is dispatched by multiple widgets. |
| `id`     | `string` | The widget instance's id (the `id` you passed when initializing). Useful to disambiguate instances.        |
| `config` | `object` | The exact `clickAction` config that fired the event.                                                       |

#### Examples

```js
// Listen for a logo click event
bundle.utils.onWidgetEvent('logo-clicked', e => {
  console.log('Logo clicked:', e.detail);
  // e.detail = { widget: 'BundleLogo', id: 'main-logo', config: { type: 'event', name: 'logo-clicked' } }
});

// Stop listening
bundle.utils.offWidgetEvent('logo-clicked');
```

---

[Back to Top](#utils)

### Programmatic Modals

The chrome widgets accept `target: 'modal'` to open a click in a modal dialog. For full programmatic control — opening a modal from inside an event handler, after a timer, or in response to a server result — use these helpers directly.

The modal stack is global and stacked: a modal opened from inside another modal layers on top, rather than replacing it. So a form rendered in one modal can open another modal without coordinating with the embedding context.

#### Functions

![name=openModal](https://img.shields.io/badge/openModal%28config%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Opens a modal with the given configuration. Returns a close function that dismisses **this specific** modal.

![name=closeModal](https://img.shields.io/badge/closeModal%28id%3F%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Closes a modal. With no argument, closes the topmost modal on the stack. With an id, closes that specific modal (no-op if not on the stack).

![name=closeAllModals](https://img.shields.io/badge/closeAllModals%28%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Closes every open modal. Useful for hard resets (e.g., after auth timeout).

#### Modal Config Options

![name=type](https://img.shields.io/badge/type-gray)
![type=string](https://img.shields.io/badge/string_(required)-e66e22)  
One of:

- `'internal'` — render a bundle path in the modal. Requires `path`.
- `'home'` — render the user's resolved home (runs the landing resolver) in the modal. No additional fields.
- `'external'` — render an external URL via iframe in the modal. Requires `url`. **Note:** sites that send `X-Frame-Options: DENY` will appear blank.

![name=path](https://img.shields.io/badge/path-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
For `type: 'internal'`. Bundle path starting with `/` (e.g. `'/forms/help'`, `'/kapps/services'`).

![name=url](https://img.shields.io/badge/url-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
For `type: 'external'`. Full URL to embed.

![name=size](https://img.shields.io/badge/size-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`, `'full'`.

![name=title](https://img.shields.io/badge/title-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Optional title displayed in the modal header.

![name=closeOn](https://img.shields.io/badge/closeOn-gray)
![type=array](https://img.shields.io/badge/string[]-e66e22)  
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
