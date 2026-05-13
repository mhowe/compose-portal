[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## BundleBanner Widget

`BundleBanner` renders a full-width informational bar — typically as an environment indicator (Dev / Staging / etc.) at the top or bottom of a page, or as a hard-coded label like a security classification. The widget itself is position-agnostic; the form designer places a content element wherever the bar should appear and the banner fills it.

```js
// Initialize the BundleBanner widget
bundle.widgets.BundleBanner({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.BundleBanner.get(id);
```

### Render modes

The widget has two distinct modes, picked by whether `attributeName` is set:

- **Dynamic mode** — read a space attribute, look its value up in `mapping`, and use the matched bucket as the color. If the value falls in the `hide` bucket *or* matches no bucket, the widget renders nothing. Production-by-default-hides comes from this rule plus the default mapping.
- **Static mode** — no `attributeName`, always render, color comes from the `color` config (defaults to `neutral`). Use this for hard-coded indicators that aren't tied to environment.

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
An object of configurations for the widget. All fields optional.

> **`attributeName`** — *string*  
> Name of the space attribute whose value drives color and visibility. Setting this puts the widget in **dynamic mode**. When omitted, the widget enters **static mode**.
>
> **`template`** — *string*  
> Display string. Defaults to `'{{value}}'`. Only `{{value}}` is interpolated (replaced with the resolved attribute value, or empty string in static mode). For richer text, compose the string in your bundle script and pass it here.
>
> **`color`** — *string*  
> One of `'error'`, `'warning'`, `'success'`, `'info'`, `'neutral'`. Used in **static mode only** — ignored when `attributeName` is set (mapping decides). Defaults to `'neutral'` in static mode.
>
> **`className`** — *string*  
> Extra classes applied to the inner text element. Use DaisyUI / `kd-*` semantic classes, not raw Tailwind utility chains.
>
> **`barClassName`** — *string*  
> Extra classes applied to the parent bar element (where the background color lives). Use this to override default padding, height, border, etc., independently of the text.
>
> **`mapping`** — *Object*  
> Override of the default value→bucket mapping. **Extends** the defaults — buckets you don't mention keep their default words.
>
> Default mapping:
>
> | Bucket    | Words                                                                              |
> | --------- | ---------------------------------------------------------------------------------- |
> | `error`   | `dev`, `development`, `devel`, `sandbox`, `local`                                  |
> | `warning` | `test`, `testing`, `tst`, `uat`, `staging`, `stage`, `qa`, `demo`                  |
> | `success` | _(empty)_                                                                          |
> | `info`    | _(empty)_                                                                          |
> | `neutral` | _(empty)_                                                                          |
> | `hide`    | `prod`, `production`, `live`, `prd`                                                |
>
> Match is case-insensitive after trimming. A value that matches no bucket is treated the same as one matched into `hide` — the banner does not render.

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API.

### Examples

#### Dynamic — environment banner from a space attribute

The default mapping covers most environment names. With just `attributeName` set, the widget renders nothing on production, an `error`-colored bar on dev/sandbox/local, and a `warning`-colored bar on test/UAT/staging.

```js
bundle.widgets.BundleBanner({
  container: K('content[Env Banner]').element(),
  config: {
    attributeName: 'Environment',
    template: 'Environment: {{value}}',
  },
  id: 'env-banner',
});
```

#### Dynamic — extending the default mapping with customer-specific words

The customer's space uses `Acme-Dev` and `Acme-UAT` as environment names. Add them to the appropriate buckets — defaults remain in place.

```js
bundle.widgets.BundleBanner({
  container: K('content[Env Banner]').element(),
  config: {
    attributeName: 'Environment',
    template: 'You are on {{value}}',
    mapping: {
      error: ['acme-dev'],
      warning: ['acme-uat'],
      hide: ['acme-prod'],
    },
  },
  id: 'env-banner',
});
```

#### Static — fixed classification banner

No `attributeName`, no mapping concern — always shows, color comes from `color`.

```js
bundle.widgets.BundleBanner({
  container: K('content[Classification]').element(),
  config: {
    template: 'CLASSIFIED',
    color: 'error',
    className: 'font-bold uppercase tracking-widest',
  },
  id: 'classification',
});
```

#### Static — composing the template form-side from multiple attributes

Template only interpolates `{{value}}`, so for richer text the form designer composes the string and passes it in.

```js
const env = bundle.config.space?.attributesMap?.Environment?.[0] || 'Unknown';
const customer = bundle.config.space?.name || '';

bundle.widgets.BundleBanner({
  container: K('content[Env Banner]').element(),
  config: {
    template: `${customer} — ${env}`,
    color: env.toLowerCase().includes('prod') ? 'success' : 'warning',
  },
  id: 'env-banner',
});
```

> Form designers who want this dynamic-but-with-richer-text pattern should consider whether they actually need static mode. The dynamic mode handles visibility automatically; static mode trades that for full string control.

### Notes

- **Position is the form designer's job.** The widget fills its parent container's width. To pin a banner to the top or bottom of every page, place a content element in your layout chrome and mount the widget there. The widget itself does not apply any positioning (sticky / fixed / absolute).
- **Hide-on-no-match is a feature, not a bug.** Production hiding is the headline use case. If a customer's environment value isn't in any bucket, the widget hides silently — better than rendering an unspecified-color bar in an unfamiliar environment. Add the value to the appropriate bucket via `mapping`.
- **Visibility reacts to attribute changes.** The widget subscribes to the space record in Redux, so editing `Environment` in space settings re-renders the banner immediately without a page reload.
- **Color via `color` is ignored in dynamic mode.** Mapping is the single source of truth for color when `attributeName` is set. To force a specific color in dynamic mode, override `mapping` so the relevant value falls in the desired bucket.
- **Accessibility.** The banner renders with `role="status"` and `aria-live="polite"` so screen readers announce environment changes.
