[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleContainer Widget

`BundleContainer` mounts a slot in your form that can render any bundle page (a form, a kapp landing, the embedded space landing, etc.) inside it. The page renders as if it were a top-level route, but it's confined to the container's bounds — the rest of your form stays put.

You can navigate the container's content imperatively (call its API), declaratively (`initialPath` config), or via events (broadcast a `CustomEvent` and any listening container updates). Containers can be **nested** — a form rendered inside one container can drop another container inside itself, with its own routing.

```js
// Initialize the BundleContainer widget
bundle.widgets.BundleContainer({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleContainer.get(id);
```

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render the container into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()` — no `[0]` or jQuery required. Use a content element rather than a field, since this is a presentation widget that displays content rather than collects data.

**`config`** — *Object*  
An object of configurations for the widget.

> **`id`** — *string (required)*  
> A unique identifier for this container. Used as the event-target key (so events can address a specific container) and — when `urlSync` is enabled — as the URL slot key. Must be a non-empty string. **Required.**
>
> **`initialPath`** — *string*  
> The path the container opens at when first rendered (e.g. `'/kapps'`, `'/kapps/services'`, `'/forms/some-form'`). Must start with `/`.
>
> If omitted, set to `null`, or set to `''`, the container mounts **blank** (no routed content visible) until something calls its `navigate()` API or fires a `bundle:container:navigate` event. Useful when the form designer wants to wait for a user action before showing any content.
>
> **`urlSync`** — *boolean*  
> When `true`, the container's current path round-trips through the URL hash as a search param keyed `ctr.<slotPath>` (e.g. `https://your-space/#/your-form?ctr.main=/kapps/services`). Effects:
>
> - F5 / page refresh restores the inner state (URL slot wins over `initialPath` on mount).
> - The browser back button navigates the container.
> - Links are bookmarkable / shareable.
>
> Defaults to `false`. Multiple containers each manage their own slot independently.
>
> The `slotPath` is auto-derived from the container's mount position relative to other BundleContainers — a top-level container with `id: 'main'` gets slot `main`; a nested container with the same id gets slot `main.main`. This prevents URL recursion when a form's container loads the same form (which has the same container id).
>
> **`hideFormChrome`** — *boolean*  
> When `true`, forms loaded inside this container render without their page wrapper — no icon / form name heading, no settings-share link, no gutter, no max-width centering, no bordered content card. The form's fields render directly inside the container so the host page can own all the surrounding layout.
>
> Defaults to `false` (today's behavior — forms render with their full page chrome inside containers).
>
> This is the container-side opt-in. There is also a form-side opt-in: setting a form's `Form Chrome` attribute to `bare` makes that form render without its page wrapper whenever it's loaded into any container, regardless of `hideFormChrome`. The two opt-ins are a union — either source set to bare wins; if you want a specific form to render with full chrome in spite of the container saying bare, today there is no override (`hideFormChrome: true` is authoritative).
>
> ```js
> // Host page owns layout; render the form's fields with no wrapper:
> bundle.widgets.BundleContainer({
>   container: K('content[Page Container]').element(),
>   config: {
>     id: 'main',
>     initialPath: '/kapps/test-kapp---compose-portal/forms/display',
>     hideFormChrome: true,
>   },
>   id: 'main',
> });
> ```

**`id`** — *string*  
A unique id used by the widget machinery for instance tracking. When omitted, falls back to `config.id`.

### API

**`navigate(path, options)`** — *Function*  
Navigates the container to the given path. `path` must be a string starting with `/`. Calling this also un-blanks the container if it was previously blank.

The optional second argument is `{ replace: boolean }`. When `replace: true`, the new path replaces the current entry in the container's history rather than pushing a new one — the browser back button skips it. Useful for things like a redirect-after-submit that shouldn't leave a "back to the form you just submitted" entry behind.

**`getCurrent()`** — *Function*  
Returns the container's current path string. Returns `''` while the container is blank.

### Events

The container both **listens for** an event you can dispatch to drive it, and **emits** an event whenever it navigates so other parts of the page can react.

#### Drive a container — `bundle:container:navigate` (inbound)

When the container is interactive elsewhere on the page, you can drive it by dispatching a `CustomEvent` on `window`:

```js
window.dispatchEvent(
  new CustomEvent('bundle:container:navigate', {
    detail: { id: 'main', path: '/kapps/services' },
  }),
);
```

`detail.id` matches the container's `config.id`. Omit `detail.id` to broadcast to **every** mounted container (every container responds and navigates to the same path). `detail.path` is required and must start with `/`. `detail.replace` is optional — when true, the inner history entry is replaced rather than pushed.

For chrome widgets (`BundleLink`, `BundleAvatar`, `BundleLogo`, `BundleMenu`), prefer the declarative form: pair `clickAction: { type: 'internal', path: '/...' }` with `target: { type: 'container', id: 'main' }` and the widget dispatches this event for you. See [Chrome Widget Actions → target](CHROME_ACTIONS.md#target).

#### Listen for navigation — `bundle:container:navigated` (outbound)

The container fires `bundle:container:navigated` on `window` whenever its inner page changes — whether the change came from your form code, a chrome widget click, the browser back button, or URL sync. The event payload is:

```js
{
  detail: {
    id: 'main',                  // the container's config.id
    path: '/kapps/services',     // where it just went ('' when blank)
    previousPath: '/kapps',      // where it was just before
  }
}
```

The event does **not** fire on the initial mount — only on subsequent navigations. So if a container starts at `/kapps`, you don't get a fake "navigated to /kapps" event when the page first loads. You only hear about real moves.

**What this is useful for:**

- **Refresh a counter when the user moves on.** A counter showing "5 unread messages" is sitting on the page next to a container that holds the inbox. The user clicks a message, reads it (the inbox marks it read in the background), and clicks back to the inbox list. The counter should update. Listen for the navigation, refresh the counter.
- **Update a "you are here" breadcrumb.** A breadcrumb element next to the container needs to track where the user is inside it. Subscribe to navigations and update the breadcrumb's text.
- **Track inner-page views for analytics.** When the container is acting as a sub-app, each inner navigation is essentially a page view. Send it to your analytics tool from the listener.

**Example — refresh a counter when the user navigates away from a list page:**

```js
// You have an "Unread Messages" counter and an "Inbox" container on the same page.
// When the user clicks into a message and reads it, then comes back, the counter
// should update — even though no chrome widget triggered the return navigation.

bundle.widgets.BundleCounter({
  container: K('content[Unread Counter]').element(),
  config: {
    text: 'Unread',
    integration: {
      kappSlug: 'services',
      integrationName: 'Unread Messages',
      listProperty: 'Submissions',
    },
  },
  id: 'unread',
});

bundle.widgets.BundleContainer({
  container: K('content[Inbox]').element(),
  config: { id: 'inbox', initialPath: '/kapps/services/inbox' },
  id: 'inbox',
});

// Refresh the counter every time the inbox container's inner page changes.
// `bundle.utils.onWidgetEvent` is preferred over window.addEventListener
// because it deduplicates listeners — calling it again replaces the prior
// handler instead of stacking up another one.
bundle.utils.onWidgetEvent('bundle:container:navigated', e => {
  if (e.detail.id !== 'inbox') return; // ignore other containers
  bundle.widgets.BundleCounter.get('unread').refresh();
});
```

**What "navigated" means in plain terms.** The container shows whatever bundle page is at its current URL inside the container — the kapp list, an inbox, a form, etc. "Navigated" just means the container's current URL changed: the user moved from the inbox to a specific message, or from the form back to the list, or anything similar. It does **not** fire when the *outer* page (the one hosting the container) moves around.

**What it doesn't do.** This event tells you the container moved, not how. There's no "back" or "forward" or "the user came back from where they went two clicks ago" — just current path and previous path. If you need finer history tracking, keep your own log of paths in your form code.

### Examples

#### Basic — load the kapp landing inline

```js
bundle.widgets.BundleContainer({
  container: K('content[Page]').element(),
  config: {
    id: 'main',
    initialPath: '/kapps/services',
  },
  id: 'main',
});
```

#### Blank container with buttons that navigate it

```js
// Form load:
bundle.widgets.BundleContainer({
  container: K('content[Page]').element(),
  config: { id: 'main' }, // no initialPath → starts blank
  id: 'main',
});

// On a button click:
bundle.widgets.BundleContainer.get('main').navigate('/kapps/services');
```

#### Bookmarkable / refreshable container state

```js
bundle.widgets.BundleContainer({
  container: K('content[Page]').element(),
  config: {
    id: 'main',
    initialPath: '/kapps',
    urlSync: true,
  },
  id: 'main',
});
```

After this is rendered, navigating around inside the container updates the browser URL (e.g. `https://your-space/#/your-form?ctr.main=/kapps/services`). Refreshing the page restores the container to that path.

#### Multiple containers driven by events

```js
// Open both containers:
bundle.widgets.BundleContainer({
  container: K('content[Top]').element(),
  config: { id: 'top', initialPath: '/kapps' },
  id: 'top',
});
bundle.widgets.BundleContainer({
  container: K('content[Bottom]').element(),
  config: { id: 'bottom' },
  id: 'bottom',
});

// Drive the bottom container from anywhere:
window.dispatchEvent(
  new CustomEvent('bundle:container:navigate', {
    detail: { id: 'bottom', path: '/kapps/services' },
  }),
);
```

### Notes

- **Sizing.** The container fills its DOM element. Make sure the content element has a height (e.g. `min-height: 600px`) so the rendered page is visible.
- **Recursion is allowed.** Configuring a container to load the same page it's on works fine — but if that loaded page also contains a container that loads the same page, you'll create an infinite loop. The bundle does not guard against this; it's the form designer's responsibility.
- **Display Mode is ignored inside containers.** A form with `Display Mode = fullscreen` renders normally when loaded inside a container — the container's host page owns chrome.
- **Form page chrome is opt-out.** A form loaded into a container shows its standard page wrapper (icon, form name, settings link for space admins, gutter, max-width container, bordered card) by default. To suppress it, either set `hideFormChrome: true` on the container (affects every form loaded into this container) or set the form's `Form Chrome` attribute to `bare` (affects this form everywhere it's loaded into any container).
- **API addressing collision.** If two containers have the same `id`, both respond to events targeting that id, and `BundleContainer.get(id)` returns whichever was registered most recently. URL slots are auto-namespaced by mount position so they don't collide on the URL — but API and event addressing still does. The widget logs a `console.warn` at registration time when it detects this.
