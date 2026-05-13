[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Chart Widget

`Chart` renders either a **single-value metric** card or an **ApexCharts** chart (line / bar / area / donut / pie) into a content element on the form. Both modes share the same outer shape — `title` above, body in the middle, `description` below — and the same `clickAction` / `target` system as the chrome widgets.

```js
// Initialize the Chart widget
bundle.widgets.Chart({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Chart.get(id);
```

### Modes

The widget operates in one of two modes, picked by `config.type`:

- **`'metric'`** _(default)_ — a single-value card. Content is centered; the formatted value is the dominant visual (large + bold), with an optional `prefix` raised to its cap height and an optional `suffix` aligned to its baseline. An optional `trend` sparkline renders as a faint full-card backdrop behind the value. A small `delta` chip and a muted `description` sit below. Threshold-driven color carries from the value into the sparkline trace, so red / amber / green threshold states read at a glance.
- **`'chart'`** — an ApexCharts chart. Supports `line`, `bar`, `area`, `donut`, and `pie`. ApexCharts is lazy-loaded on first chart mount, so pages with metrics only don't pay for the library.

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
An object of configurations for the widget. All fields optional.

> #### Shared (both modes)
>
> **`type`** — *string*  
> `'metric'` _(default)_ or `'chart'`. Picks which body the widget renders.
>
> **`title`** — *string*  
> Rendered above the body. Also used as the default accessibility label when `label` is omitted.
>
> **`description`** — *string*  
> Rendered below the body as a small caption — good place for context like "last 30 days" or "vs SLA target".
>
> **`clickAction`** — *Object*  
> Whole-widget click behavior. Wraps the entire card (title + body + description) as one click target. Defaults to `{ type: 'none' }`. See [Chrome Widget Actions](CHROME_ACTIONS.md#clickaction).
>
> **`target`** — *string or Object*  
> Where the whole-widget click opens. See [Chrome Widget Actions](CHROME_ACTIONS.md#target).
>
> **`label`** — *string*  
> Accessibility label override. Defaults to `title` when not provided.
>
> **`className`** — *string*  
> Extra classes on the outer widget element. **Additive** — added alongside the default `kd-chart-widget` class. Use DaisyUI / `kd-*` semantic classes when you need a different look.
>
> **`titleClassName`** — *string*  
> Extra classes on the title element. Additive.
>
> **`descriptionClassName`** — *string*  
> Extra classes on the description element. Additive.
>
> #### Metric mode (`type: 'metric'`)
>
> **`value`** — *number or string*  
> The displayed value. Accepts a number (`4.7`) or numeric string (`'4.7'`). Non-numeric values render an em-dash (`'–'`) placeholder rather than throwing.
>
> **`format`** — *string*  
> One of `'number'` _(default)_, `'currency'`, `'percent'`. Uses `Intl.NumberFormat` under the hood, so locale-aware formatting comes for free.
>
> - `'percent'` expects a fractional input — `0.95` renders as `95%`. If you have a whole-number percent already, use `format: 'number'` with `suffix: '%'`.
> - `'currency'` defaults to USD; override via `currency`.
>
> **`precision`** — *number*  
> Decimal places. Default behavior — when omitted — keeps up to 2 decimals. Set explicitly when you want a fixed number of decimals (`precision: 1` → always one decimal place even for whole numbers).
>
> **`currency`** — *string*  
> ISO 4217 code (`'USD'`, `'EUR'`, `'GBP'`, …). Default `'USD'`. Only meaningful when `format: 'currency'`.
>
> **`prefix`** — *string*  
> Rendered before the value, smaller, **aligned to the cap height** of the value (currency-symbol style). Useful for unit labels (`prefix: '~'`, `prefix: '£'`). Stays muted regardless of the threshold color so the value remains the focal point.
>
> **`suffix`** — *string*  
> Rendered after the value, smaller, **aligned to the baseline** of the value (score / unit style). Useful for unit labels (`suffix: ' / 5'`, `suffix: ' tickets'`, `suffix: 'ms'`). Stays muted regardless of the threshold color.
>
> **`color`** — *string*  
> Explicit value color — one of `'primary'`, `'secondary'`, `'accent'`, `'success'`, `'warning'`, `'error'`, `'info'`, `'neutral'`, or a hex string (`'#10b981'`). Semantic keys are preferred so the value tracks the active theme. **Wins over `thresholds`** when both are set.
>
> **`thresholds`** — *Array*  
> Rule-driven color. Array of `{ max?, color }` evaluated in order; first entry whose `max` is null/undefined or `>= value` wins. Omit `max` on the last entry to make it the catch-all.
>
> ```js
> thresholds: [
>   { max: 3, color: 'error'   },
>   { max: 4, color: 'warning' },
>   {          color: 'success' },  // > 4
> ]
> ```
>
> `max` is inclusive (`value <= max`). When no thresholds match (or value is unevaluatable), the value renders with the default text color.
>
> **`delta`** — *number*  
> Numeric change vs. a previous period. Renders a small chip below the value with a ▲ / ▼ direction indicator and auto-color (green up / red down). Zero renders a flat marker with neutral color.
>
> **`deltaLabel`** — *string*  
> Caption rendered next to the delta number (e.g. `'vs last month'`).
>
> **`deltaInverse`** — *boolean*  
> Flip the delta color direction. Default `false` (up = good). Set `true` for "lower is better" metrics like error rate, latency, or backlog size — then up = red, down = green.
>
> **`trend`** — *Array of numbers*  
> Optional sparkline trend. When provided (≥ 2 numbers), renders a faint SVG backdrop **behind** the metric value — dashboard-tile style, so the value stays the dominant element while the trend gives quiet historical context. The trace color tracks the resolved value color, so a value in the red threshold draws a red sparkline. Hand-rolled SVG — no chart library load required.
>
> **`trendWidth`** — *number or string*  
> Sparkline backdrop width. Number → pixels (`240`). String → any CSS width value (`'60%'`, `'18rem'`, `'min(60%, 280px)'`). Default **`'min(60%, 280px)'`** — the trace is constrained so it stays visually tied to the value on wide cards (e.g. three metrics across a row), while still stretching to a reasonable width on narrow cards. Set `'100%'` to opt back into full edge-to-edge stretch.
>
> **`trendOpacity`** — *number*  
> Sparkline stroke opacity, 0..1. Default `0.25` — visible enough to read the shape, faint enough that the value still dominates. Raise to ~`0.4` for busy / patterned backgrounds; drop to ~`0.15` for embossed-watermark feel.
>
> **`valueClassName`** — *string*  
> Extra classes on the value element. Additive.
>
> #### Chart mode (`type: 'chart'`)
>
> **`chartType`** — *string*  
> One of `'line'` _(default)_, `'bar'`, `'area'`, `'donut'`, `'pie'`.
>
> **`labels`** — *Array*  
> Category labels for line/bar/area (x-axis ticks) or slice labels for donut/pie. Length should match the data array length.
>
> **`series`** — *Array*  
> The chart data, in one of two shapes:
>
> - **line / bar / area** — either an array of `{ name, data: [n, n, ...] }` for multi-series, or a bare number array for a single unnamed series. The bare-array form is auto-wrapped as `[{ name: 'Value', data: [...] }]`.
> - **donut / pie** — a flat number array (`[44, 55, 13, 43]`). If you pass the object form by mistake, the first series's `data` is used.
>
> **`colors`** — *Array of strings*  
> One color per series. Accepts semantic keys (`'primary'`, `'success'`, …) which resolve to the corresponding daisyUI CSS variable, or any color string ApexCharts understands (hex, `rgb(...)`, `var(...)`). When omitted, ApexCharts uses its default palette.
>
> **`height`** — *number*  
> Chart height in pixels. Default `300`.
>
> **`stacked`** — *boolean*  
> Stack multi-series bars or areas. Default `false`.
>
> **`showLegend`** — *boolean*  
> Default `true`.
>
> **`showGrid`** — *boolean*  
> Default `true`.
>
> **`xAxisLabel`** — *string*  
> X-axis title. Only meaningful for line/bar/area.
>
> **`yAxisLabel`** — *string*  
> Y-axis title. Only meaningful for line/bar/area.
>
> **`pointClickAction`** — *Object*  
> Per-data-point click — independent of the whole-widget `clickAction`. Useful for drill-through ("click the W3 bar to see W3 details"). Restricted to three forms:
>
> - `{ type: 'none' }` — disabled (same as omitting the field).
> - `{ type: 'event', name: 'my-event' }` — dispatches a `CustomEvent` whose `detail` includes `{ widget, id, seriesIndex, dataIndex, label, value }`.
> - `{ type: 'internal', path: '/foo/{{label}}' }` — navigates inline. `{{label}}` and `{{value}}` tokens in `path` are substituted (URL-encoded) before navigation.
>
> When a `pointClickAction` fires, the wrapping `clickAction` is suppressed for that click so a drill-through doesn't also navigate the whole-card destination.
>
> **`pointTarget`** — *string or Object*  
> Where `pointClickAction.type='internal'` opens. `'current'` _(default)_ or `'new'`. Modal and container targets are intentionally not supported here in v1 — drill-throughs should be lightweight.

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking. Required if you want to call API methods on the widget after it mounts.

### API

**`update(patch)`** — *Function*  
Merges `patch` into the widget's config and re-renders. Most general update path — works for any field.

```js
bundle.widgets.Chart.get('csat').update({ value: 4.8, delta: 0.4 });
```

**`setValue(v)`** — *Function*  
Shortcut for metric mode. Updates the `value` and nothing else.

**`setData({series, labels})`** — *Function*  
Shortcut for chart mode. Updates `series` and/or `labels` without touching the rest of the config. ApexCharts animates the transition.

### Examples

#### Metric — single value with thresholds and a sparkline

```js
bundle.widgets.Chart({
  container: K('content[CSAT]').element(),
  config: {
    type: 'metric',
    title: 'Customer Satisfaction',
    value: 4.7,
    precision: 1,
    suffix: ' / 5',
    description: 'Avg over the last 30 days',
    thresholds: [
      { max: 3, color: 'error' },
      { max: 4, color: 'warning' },
      { color: 'success' },
    ],
    trend: [4.2, 4.3, 4.5, 4.6, 4.7],
    delta: 0.3,
    deltaLabel: 'vs last month',
    clickAction: { type: 'internal', path: '/kapps/services/forms/feedback' },
  },
  id: 'csat',
});
```

#### Metric — currency, "lower is better" delta

```js
bundle.widgets.Chart({
  container: K('content[OpenCost]').element(),
  config: {
    type: 'metric',
    title: 'Avg Cost per Ticket',
    value: 12.4,
    format: 'currency',
    precision: 2,
    color: 'neutral',
    delta: -1.1,
    deltaLabel: 'vs last month',
    deltaInverse: true,        // cost going down = good
    description: 'Operations cost / closed ticket',
  },
  id: 'cost-per-ticket',
});
```

#### Chart — multi-series bar with point drill-through

```js
bundle.widgets.Chart({
  container: K('content[Tickets]').element(),
  config: {
    type: 'chart',
    chartType: 'bar',
    title: 'Tickets per week',
    description: 'Last 8 weeks',
    labels: ['W1','W2','W3','W4','W5','W6','W7','W8'],
    series: [
      { name: 'Opened', data: [12, 19, 15, 22, 18, 25, 21, 30] },
      { name: 'Closed', data: [10, 17, 14, 20, 17, 22, 20, 28] },
    ],
    colors: ['primary', 'success'],
    yAxisLabel: 'Tickets',
    pointClickAction: {
      type: 'internal',
      path: '/kapps/services/week/{{label}}',
    },
  },
  id: 'tickets-chart',
});
```

#### Chart — donut

```js
bundle.widgets.Chart({
  container: K('content[StatusMix]').element(),
  config: {
    type: 'chart',
    chartType: 'donut',
    title: 'Tickets by status',
    labels: ['New', 'In Progress', 'Waiting', 'Closed'],
    series: [44, 55, 13, 43],
    colors: ['info', 'warning', 'neutral', 'success'],
    height: 260,
  },
  id: 'status-mix',
});
```

#### Refreshing a metric after a user action

```js
const csat = await bundle.widgets.Chart({
  container: K('content[CSAT]').element(),
  config: {
    type: 'metric',
    title: 'Customer Satisfaction',
    value: 4.7,
  },
  id: 'csat',
});

// After a submission elsewhere on the page changes the underlying data:
csat.setValue(4.8);
```

### Notes

- **Lazy ApexCharts.** The chart library is dynamically imported on first `type: 'chart'` mount. Metric-only pages stay zero-cost. Once loaded, subsequent charts on the same page mount synchronously.
- **Theme-aware colors.** Semantic color keys (`'primary'`, `'success'`, …) resolve to daisyUI CSS variables, so they track the active theme. Hex / `rgb(...)` strings pass through unchanged — use them when you need something off-palette.
- **Percent format is fractional.** `format: 'percent'` expects fractions (`0.95` → `95%`). If your value is already a whole number percent, use `format: 'number'` with `suffix: '%'`.
- **Whole-card vs. point clicks.** When both `clickAction` and `pointClickAction` are configured, a click on a data point fires only the point action — the wrapping card click is suppressed for that event.
- **Point drill-through targets.** v1 only supports `'current'` and `'new'` for `pointTarget`. Modal and container targets are intentionally omitted — they're heavier, and a chart with frequent drill-through is better served by the whole-card `clickAction` going to a richer view.
- **Console errors, not silent failures.** Misconfigurations (wrong types, invalid color keys, missing `path` on `internal` actions) log `console.error` at registration time and the widget rejects its init promise. The visible widget never half-renders into a broken state.

### Future ideas (not implemented)

- **Real-time / polling refresh.** A `refreshInterval` config, or an integration-backed data source like BundleCounter's. Today, designers call `setValue` / `setData` manually from a timer.
- **Duration formatting.** `format: 'duration'` for SLA / response-time metrics. Skipped in v1 because input-unit and output-style choices are too many to pick a sensible default.
- **Threshold-driven chart background.** Same threshold rules as the metric, applied to a chart's background plot area. Useful for "anything in the red zone is bad" visualizations.
- **Comparison / target line.** A `target: 5` config that renders a faint horizontal line on the chart or "X of 5" caption under a metric.
- **Annotations.** Vertical markers on time-series charts (e.g., "release shipped" markers). ApexCharts supports these natively; just not surfaced in the widget API yet.
- **Gauge / radial.** Narrow use case, deferred.
