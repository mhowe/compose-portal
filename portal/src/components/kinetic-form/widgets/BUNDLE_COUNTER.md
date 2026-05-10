[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleCounter Widget

`BundleCounter` renders a label-with-badge pair — text plus a count badge whose color can change with the value. Useful for inbox counts, notification dots, queue sizes, member counts, etc.

```js
// Initialize the BundleCounter widget
bundle.widgets.BundleCounter({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleCounter.get(id);
```

### Data sources

The widget supports two data sources, chosen by which fields are configured:

- **Integration** — same shape as `BundleMenu`'s integration. The widget fetches and uses the array length at `listProperty` as the count.
- **Static `count`** — number or numeric string passed directly.

**Precedence:** when both `integration` and `count` are configured, integration wins. The widget never silently falls back from one to the other.

**Bad data is non-fatal.** When the count can't be evaluated, the badge displays `'-'` and a `console.warn` (not error) is logged. Triggers:

- Non-numeric `count` value (e.g. `count: 'abc'`).
- Integration error (request failure, custom `errorProperty` matched, or `listProperty` doesn't resolve to an array).
- Neither `integration` nor `count` configured.

Loading state also displays `'-'` but without a warning.

### Parameters

![name=container](https://img.shields.io/badge/container-gray)
![type=HTMLElement](https://img.shields.io/badge/HTMLElement_or_array--like-e66e22)  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

<details>
<summary>
  <img alt="name=config" src="https://img.shields.io/badge/config-gray">
  <img alt="type=Object" src="https://img.shields.io/badge/Object-e66e22">
  <br>
  An object of configurations for the widget. All fields optional.
</summary>
<br>
<blockquote>

![name=integration](https://img.shields.io/badge/integration-gray)
![type=Object](https://img.shields.io/badge/Object-e66e22)  
Integration descriptor. The widget fetches the integration on mount and uses the array at `listProperty` for the count. Required fields when set: `kappSlug`, `integrationName`, `listProperty`. Optional: `formSlug`, `parameters`, `errorProperty`, `onError`, `onSuccess`. See [BundleMenu](BUNDLE_MENU.md) for the full field reference — the integration shape is shared, just without the `itemMap` / `transform` / `loadingMessage` / `errorMessage` extras (which only make sense for menu items).

![name=count](https://img.shields.io/badge/count-gray)
![type=number_or_string](https://img.shields.io/badge/number_or_string-e66e22)  
Static count value. Accepts a number (`42`) or a numeric string (`'42'`). Ignored when `integration` is set. Non-numeric strings produce a `'-'` badge plus a `console.warn`.

![name=text](https://img.shields.io/badge/text-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Optional label rendered alongside the badge. When omitted, only the badge renders (useful for notification dots).

![name=badgePosition](https://img.shields.io/badge/badgePosition-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
One of `'left'`, `'right'` _(default)_, `'between'`. `'left'` and `'right'` keep the widget tight (inline-flex). `'between'` stretches to fill the parent and pushes text and badge to opposite ends — useful in side-nav rows.

![name=size](https://img.shields.io/badge/size-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
One of `'sm'`, `'md'` _(default)_, `'lg'`, `'xl'`. Drives font size, gap, and badge size as a coherent set. No granular per-region sizing — the whole widget scales together.

![name=layout](https://img.shields.io/badge/layout-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
One of `'inline'` _(default)_ or `'stacked'`. Picks how the widget wears its default ghost-button styling.

- **`'inline'`** — uses `kbtn kbtn-ghost kbtn-{size}`, so a counter in a horizontal chrome row is the same height as a BundleLink / BundleMenu trigger at the same size. Best for headers and toolbars.
- **`'stacked'`** — drops the `kbtn-{size}` suffix. All sizes share the same horizontal padding, so when you stack multiple counters vertically (e.g. in a side-nav) their left and right edges align even if the sizes differ. Heights and font still differ by `size`; only horizontal padding is normalized.

> **When to reach for `'stacked'`.** This is most appreciated when you have a vertical list of counters at **different** sizes — e.g. a side-nav where "Approvals" is `xl`, "Inbox" is `lg`, and a few minor items are `md` or `sm`. With the default `'inline'` layout, each size brings different left/right padding, so the column's left edge zig-zags. `'stacked'` normalizes the horizontal padding so every row's left and right edges line up cleanly. **If every counter in the stack is the same size, you can leave the default `'inline'`** — the per-size padding only becomes visible when sizes mix.

![name=thresholds](https://img.shields.io/badge/thresholds-gray)
![type=Array](https://img.shields.io/badge/Array-e66e22)  
Optional color-coding ramp. Array of `{ upTo?, color }` evaluated in order; the first entry whose `upTo` is null/undefined or `>= count` wins. `color` is one of `'error'`, `'warning'`, `'success'`, `'info'`, `'neutral'`. Omit `upTo` on the last entry to make it the catch-all. Default badge color (no thresholds set, or count unevaluatable): `'neutral'`.

```js
thresholds: [
  { upTo: 10, color: 'neutral' },
  { upTo: 20, color: 'warning' },
  { color: 'error' },          // > 20
]
```

`upTo` is inclusive (`count <= upTo`). Negative thresholds and negative counts work the same way.

![name=className](https://img.shields.io/badge/className-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
**Override** the default ghost-button styling on the parent. By default the parent renders as `kbtn kbtn-ghost kbtn-{size}` so a counter dropped into a header lines up with `BundleLink` and `BundleMenu` triggers automatically. Setting `className` **fully replaces** that default — same convention used by other chrome widgets. Use DaisyUI / `kd-*` semantic classes when you need a different look (e.g. `'kbtn kbtn-primary kbtn-lg'` for a primary-colored counter).

![name=textClassName](https://img.shields.io/badge/textClassName-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Extra classes on the text element. **Additive** — added alongside any default text styling.

![name=badgeClassName](https://img.shields.io/badge/badgeClassName-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Extra classes on the badge. **Additive** — added alongside the `kbadge` / size / color classes the widget already applies.

![name=clickAction](https://img.shields.io/badge/clickAction-gray)
![type=Object](https://img.shields.io/badge/Object-e66e22)  
What happens when the widget is clicked. Wraps the whole widget (text + badge as one click target). Defaults to `{ type: 'none' }`. See [Chrome Widget Actions](CHROME_ACTIONS.md#clickaction).

![name=target](https://img.shields.io/badge/target-gray)
![type=string_or_Object](https://img.shields.io/badge/string_or_Object-e66e22)  
Where the click opens. See [Chrome Widget Actions](CHROME_ACTIONS.md#target).

![name=label](https://img.shields.io/badge/label-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Accessibility label override. Defaults to `text` when not provided.

</blockquote>
</details>

![name=id](https://img.shields.io/badge/id-gray)
![type=string](https://img.shields.io/badge/string-e66e22)  
Optional id used by the widget machinery for instance tracking. Also used in console warnings to identify which counter logged a message.

### API

![name=refresh](https://img.shields.io/badge/refresh%28%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Re-runs the integration fetch. Useful for refreshing after a user action that mutates the underlying data (e.g. after they mark a ticket closed). No-op in static mode.

![name=getCount](https://img.shields.io/badge/getCount%28%29-gray)
![type=Function](https://img.shields.io/badge/Function-e66e22)  
Returns the current numeric count (or `null` if unevaluatable / loading). Read-through, always returns the freshest value.

### Examples

#### Integration-driven inbox counter with thresholds and click navigation

```js
bundle.widgets.BundleCounter({
  container: K('content[Inbox]').element(),
  config: {
    text: 'Inbox',
    integration: {
      kappSlug: 'services',
      integrationName: 'My Open Tickets',
      listProperty: 'Submissions',
    },
    thresholds: [
      { upTo: 10, color: 'neutral' },
      { upTo: 20, color: 'warning' },
      { color: 'error' },
    ],
    clickAction: { type: 'internal', path: '/kapps/services/inbox' },
  },
  id: 'inbox',
});
```

#### Static count, badge-only (no label) — notification dot

```js
bundle.widgets.BundleCounter({
  container: K('content[Notifications]').element(),
  config: {
    count: 7,
    badgePosition: 'left',
  },
  id: 'notifications',
});
```

#### Side-nav row with `between` layout

```js
bundle.widgets.BundleCounter({
  container: K('content[Approvals Row]').element(),
  config: {
    text: 'Approvals Awaiting You',
    integration: {
      kappSlug: 'services',
      integrationName: 'My Approvals',
      listProperty: 'Submissions',
    },
    badgePosition: 'between',
    size: 'lg',
    thresholds: [{ upTo: 0, color: 'neutral' }, { color: 'warning' }],
    clickAction: { type: 'internal', path: '/kapps/services/approvals' },
    target: { type: 'container', id: 'main-container' },
  },
  id: 'approvals',
});
```

#### Refreshing after a user action

```js
const counter = await bundle.widgets.BundleCounter({
  container: K('content[Pending]').element(),
  config: {
    text: 'Pending',
    integration: {
      kappSlug: 'services',
      integrationName: 'Pending Items',
      listProperty: 'Submissions',
    },
  },
  id: 'pending',
});

// After the user dismisses an item elsewhere on the page:
bundle.widgets.BundleCounter.get('pending').refresh();
```

### Notes

- **`layout: 'stacked'` is most useful for mixed-size vertical lists.** Default `'inline'` is fine when every counter in your stack is the same size. The padding difference between sizes only becomes visible when sizes mix in the same column — that's the case `'stacked'` exists for.
- **Empty list = `0`, not `'-'`.** A successful integration that returns an empty array shows `0` and emits no warning. The `'-'` badge is reserved for "couldn't evaluate".
- **Loading state.** While the integration is in flight, the badge shows `'-'` (no warning). Avoids a flash of `0` before the real number lands.
- **Negative counts and thresholds work.** `upTo` ranges evaluate the same way regardless of sign, so `[{ upTo: -1, color: 'error' }, { upTo: 0, color: 'neutral' }, { color: 'success' }]` is valid for "negative is bad, zero is fine, positive is good".
- **Console warnings, not errors.** Misconfigurations (non-numeric `count`, missing data sources, integration errors) log via `console.warn`. Fatal-shaped misconfigurations (wrong types in `thresholds`, malformed `integration` shape) still log via `console.error` at registration time, before the widget mounts.

### Future ideas (not implemented)

- **Number formatting.** A `format` config (`'plain'` _(default)_ / `'localized'` for `1,500` / `'compact'` for `1.5K`) — useful when counts get into the thousands and visual noise becomes a problem. Compose form-side for now if you need it (`config: { count: yourValue.toLocaleString() }` won't work since the widget validates count as numeric — pass via `text` instead, with `count: 0` as a placeholder).
- **`setCount(n)` API method.** For static-mode widgets that want to update programmatically without re-mounting. Today, destroy + re-init is the path.
- **Polling refresh.** A `refreshInterval` config to auto-refresh the integration. Today, designers can call `refresh()` manually from a timer in their bundle script.

### Behavior inside `BundleChrome`

When mounted as a hosted widget inside a [`BundleChrome`](BUNDLE_CHROME.md), the counter hides its `text` label in **rail** mode and renders only the badge — the count alone reads well at icon scale. The existing `layout: 'stacked'` config still applies for vertical alignment in stacked rail strips.

- `tooltip` (optional): shown by the chrome when the entry is in icon-only state. Defaults to `text`, then `label`.
