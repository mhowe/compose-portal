import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';

const TYPES = ['metric', 'chart'];
const CHART_TYPES = ['line', 'bar', 'area', 'donut', 'pie'];
const FORMATS = ['number', 'currency', 'percent'];
const COLOR_KEYS = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'error',
  'info',
  'neutral',
];
const POINT_CLICK_TYPES = ['none', 'internal', 'event'];

// Formats a numeric value for display in the metric value slot. Returns the
// em-dash placeholder '–' for null / non-numeric so a misconfigured value
// stays visually obvious without throwing. Prefix and suffix are NOT baked
// in here — MetricContent renders them as separate spans so they can carry
// their own typography (smaller, top/baseline aligned).
const formatValue = (
  v,
  { format = 'number', precision, currency = 'USD' } = {},
) => {
  if (v == null) return '–';
  const n = Number(v);
  if (!Number.isFinite(n)) return '–';

  const fractionOpts =
    precision != null
      ? { minimumFractionDigits: precision, maximumFractionDigits: precision }
      : { maximumFractionDigits: 2 };

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        ...fractionOpts,
      }).format(n);
    case 'percent':
      return new Intl.NumberFormat(undefined, {
        style: 'percent',
        ...fractionOpts,
      }).format(n);
    default:
      return new Intl.NumberFormat(undefined, fractionOpts).format(n);
  }
};

// Walks thresholds in order; first whose `max` is null/undefined or `>= value`
// wins. Explicit `color` overrides any threshold lookup. Hex colors pass
// through. Returns the resolved color key/hex, or null when nothing applies.
const resolveMetricColor = (value, color, thresholds) => {
  if (typeof color === 'string') {
    if (COLOR_KEYS.includes(color) || color.startsWith('#')) return color;
  }
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  if (!Array.isArray(thresholds) || thresholds.length === 0) return null;
  for (const t of thresholds) {
    if (t.max == null || n <= t.max) return t.color;
  }
  return null;
};

// Color keys map to CSS variables defined by daisyUI so chart colors track
// the active theme. Hex / rgb / var(...) strings pass through unchanged.
const resolveChartColors = colors => {
  if (!Array.isArray(colors)) return undefined;
  const out = colors
    .map(c => {
      if (typeof c !== 'string') return null;
      if (c.startsWith('#') || c.startsWith('var(') || c.startsWith('rgb'))
        return c;
      if (COLOR_KEYS.includes(c)) return `var(--color-${c})`;
      return null;
    })
    .filter(Boolean);
  return out.length > 0 ? out : undefined;
};

// Normalizes the designer's `series` config into the shape ApexCharts wants
// for the given chartType. Donut/pie need a flat number array; line/bar/area
// need `[{ name, data }]`. Single-series shortcuts (a bare number array) are
// auto-wrapped.
const buildApexSeries = (chartType, series) => {
  if (!Array.isArray(series)) return [];
  if (chartType === 'donut' || chartType === 'pie') {
    if (series.every(s => typeof s === 'number')) return series;
    const first = series[0];
    if (first && Array.isArray(first.data)) return first.data;
    return [];
  }
  if (series.every(s => typeof s === 'number')) {
    return [{ name: 'Value', data: series }];
  }
  return series;
};

// Builds the ApexCharts options object from the widget config. Kept as a pure
// function so memoization stays straightforward.
const buildApexOptions = ({
  chartType,
  labels,
  colors,
  stacked,
  showLegend,
  showGrid,
  yAxisLabel,
  xAxisLabel,
  pointClickAction,
  pointTarget,
  instanceId,
}) => {
  const events = {};
  // dataPointSelection fires for both bar/line/area and donut/pie. We
  // preventDefault on the underlying event so a wrapping clickAction anchor
  // doesn't also navigate when the user drills into a single point.
  if (pointClickAction && pointClickAction.type !== 'none') {
    events.dataPointSelection = (event, chartContext, info) => {
      if (event && typeof event.preventDefault === 'function')
        event.preventDefault();
      const { seriesIndex, dataPointIndex } = info;
      const seriesArr = chartContext?.w?.config?.series || [];
      const label = Array.isArray(labels) ? labels[dataPointIndex] : undefined;
      let value;
      if (chartType === 'donut' || chartType === 'pie') {
        value = seriesArr[dataPointIndex];
      } else {
        value = seriesArr[seriesIndex]?.data?.[dataPointIndex];
      }
      const detail = {
        widget: 'Chart',
        id: instanceId,
        seriesIndex,
        dataIndex: dataPointIndex,
        label,
        value,
      };
      if (pointClickAction.type === 'event') {
        window.dispatchEvent(
          new CustomEvent(pointClickAction.name, { detail }),
        );
      } else if (pointClickAction.type === 'internal') {
        const path = (pointClickAction.path || '/')
          .replace(/\{\{\s*label\s*\}\}/g, encodeURIComponent(label ?? ''))
          .replace(/\{\{\s*value\s*\}\}/g, encodeURIComponent(value ?? ''));
        const t =
          pointTarget && typeof pointTarget === 'object'
            ? pointTarget
            : { type: typeof pointTarget === 'string' ? pointTarget : 'current' };
        if (t.type === 'new') {
          window.open(`#${path}`, '_blank', 'noopener,noreferrer');
        } else {
          window.location.hash = path;
        }
      }
    };
  }

  const opts = {
    chart: {
      toolbar: { show: false },
      stacked,
      animations: { enabled: true },
      events,
      fontFamily: 'inherit',
    },
    grid: { show: showGrid },
    legend: { show: showLegend },
    colors,
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    tooltip: { theme: 'light' },
  };

  if (chartType === 'area') {
    opts.fill = {
      type: 'gradient',
      gradient: { opacityFrom: 0.4, opacityTo: 0 },
    };
  }

  if (chartType === 'donut' || chartType === 'pie') {
    opts.labels = labels;
  } else {
    // Only attach `title` when there's actually a label — passing
    // `title: undefined` wipes out ApexCharts' default title object and
    // makes its internals crash reading `xaxis.title.text`.
    const xaxis = { categories: labels };
    if (xAxisLabel) xaxis.title = { text: xAxisLabel };
    opts.xaxis = xaxis;
    if (yAxisLabel) {
      opts.yaxis = { title: { text: yAxisLabel } };
    }
  }

  return opts;
};

// Sparkline rendered as a faint horizontally-centered backdrop behind the
// metric value — dashboard-tile style. Pure SVG so metric-only pages still
// don't need the charting library. `vector-effect: non-scaling-stroke` keeps
// the line at a constant 2px even when the SVG is stretched non-uniformly to
// fill its container via `preserveAspectRatio="none"`. The color matches the
// resolved metric color so red / amber / green threshold states carry into
// the trend too.
//
// Width and opacity are both configurable so the same sparkline reads well
// on a narrow card (mobile / sidebar) and on a wide card (one-third of a
// dashboard row). Default `min(60%, 280px)` keeps the trace visually tied
// to the value rather than stretching to the card edges.
const Sparkline = ({
  data,
  color,
  width = 'min(60%, 280px)',
  opacity = 0.25,
}) => {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // Internal coordinate space; the SVG itself stretches to fit its parent.
  const vbWidth = 100;
  const vbHeight = 40;
  const step = vbWidth / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = vbHeight - ((v - min) / range) * vbHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const stroke =
    typeof color === 'string' && color.startsWith('#')
      ? color
      : color && COLOR_KEYS.includes(color)
        ? `var(--color-${color})`
        : 'currentColor';
  const cssWidth = typeof width === 'number' ? `${width}px` : width;
  return (
    <svg
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      preserveAspectRatio="none"
      className="kd-metric-sparkline pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 z-0 h-full"
      style={{ width: cssWidth }}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeOpacity={opacity}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </svg>
  );
};

const DeltaChip = ({ delta, deltaLabel, deltaInverse }) => {
  if (delta == null) return null;
  const n = Number(delta);
  if (!Number.isFinite(n)) return null;
  const direction = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  let colorKey = 'neutral';
  if (direction === 'up') colorKey = deltaInverse ? 'error' : 'success';
  else if (direction === 'down') colorKey = deltaInverse ? 'success' : 'error';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';
  const sign = n > 0 ? '+' : '';
  return (
    <span
      className={clsx(
        'kbadge',
        'kbadge-sm',
        `kbadge-${colorKey}`,
        'kd-metric-delta',
        'relative z-10 gap-1 text-xs',
      )}
    >
      <span aria-hidden="true">{arrow}</span>
      <span>{`${sign}${n}`}</span>
      {deltaLabel ? (
        <span className="kd-metric-delta-label opacity-80">{deltaLabel}</span>
      ) : null}
    </span>
  );
};

const MetricContent = ({ config }) => {
  const {
    value,
    format,
    precision,
    currency,
    prefix,
    suffix,
    color,
    thresholds,
    delta,
    deltaLabel,
    deltaInverse,
    trend,
    trendWidth,
    trendOpacity,
    valueClassName,
  } = config;

  const resolvedColor = useMemo(
    () => resolveMetricColor(value, color, thresholds),
    [value, color, thresholds],
  );

  const formatted = formatValue(value, { format, precision, currency });

  // Color is applied as a daisyUI text-* utility for known keys, or as an
  // inline style for hex strings. Either way the value is the dominant
  // visual element — prefix/suffix stay muted regardless of threshold color
  // so the hierarchy reads cleanly.
  const valueColorStyle =
    typeof resolvedColor === 'string' && resolvedColor.startsWith('#')
      ? { color: resolvedColor }
      : undefined;
  const valueColorClass =
    typeof resolvedColor === 'string' && COLOR_KEYS.includes(resolvedColor)
      ? `text-${resolvedColor}`
      : undefined;

  return (
    <div className="kd-metric-body relative flex flex-col items-center gap-2 py-3">
      {Array.isArray(trend) && trend.length >= 2 ? (
        <Sparkline
          data={trend}
          color={resolvedColor}
          width={trendWidth}
          opacity={trendOpacity}
        />
      ) : null}
      <div className="kd-metric-value-stack relative z-10 inline-flex items-baseline">
        {prefix ? (
          <span className="kd-metric-prefix self-start mt-1 text-xl font-medium opacity-60">
            {prefix}
          </span>
        ) : null}
        <span
          className={clsx(
            'kd-metric-value text-5xl font-bold leading-none',
            valueColorClass,
            valueClassName,
          )}
          style={valueColorStyle}
        >
          {formatted}
        </span>
        {suffix ? (
          <span className="kd-metric-suffix ml-0.5 text-xl font-medium opacity-60">
            {suffix}
          </span>
        ) : null}
      </div>
      {delta != null ? (
        <DeltaChip
          delta={delta}
          deltaLabel={deltaLabel}
          deltaInverse={deltaInverse}
        />
      ) : null}
    </div>
  );
};

const ChartContent = ({ id, config }) => {
  // ApexCharts is loaded on demand so metric-only pages don't pay for it.
  // The module is cached after the first import, so subsequent charts on the
  // same page mount synchronously.
  const [ApexChart, setApexChart] = useState(null);
  useEffect(() => {
    let cancelled = false;
    import('react-apexcharts').then(m => {
      if (!cancelled) setApexChart(() => m.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    chartType = 'line',
    labels,
    series,
    colors,
    height = 300,
    stacked = false,
    showLegend = true,
    showGrid = true,
    yAxisLabel,
    xAxisLabel,
    pointClickAction,
    pointTarget,
  } = config;

  const resolvedColors = useMemo(() => resolveChartColors(colors), [colors]);
  const apexSeries = useMemo(
    () => buildApexSeries(chartType, series),
    [chartType, series],
  );
  const apexOptions = useMemo(
    () =>
      buildApexOptions({
        chartType,
        labels,
        colors: resolvedColors,
        stacked,
        showLegend,
        showGrid,
        yAxisLabel,
        xAxisLabel,
        pointClickAction,
        pointTarget,
        instanceId: id,
      }),
    [
      chartType,
      labels,
      resolvedColors,
      stacked,
      showLegend,
      showGrid,
      yAxisLabel,
      xAxisLabel,
      pointClickAction,
      pointTarget,
      id,
    ],
  );

  return (
    <div className="kd-chart-body" style={{ minHeight: height }}>
      {ApexChart ? (
        <ApexChart
          type={chartType}
          options={apexOptions}
          series={apexSeries}
          height={height}
        />
      ) : (
        <div className="kd-chart-loading" style={{ height }}>
          Loading chart…
        </div>
      )}
    </div>
  );
};

const ChartComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [currentConfig, setCurrentConfig] = useState(config);

  // Re-sync if the host hands us a new config (rare in practice — most
  // updates come through the imperative API below).
  useEffect(() => {
    setCurrentConfig(config);
  }, [config]);

  api.current.update = patch =>
    setCurrentConfig(prev => ({ ...prev, ...(patch || {}) }));
  api.current.setValue = v =>
    setCurrentConfig(prev => ({ ...prev, value: v }));
  api.current.setData = ({ series, labels } = {}) =>
    setCurrentConfig(prev => ({
      ...prev,
      ...(series !== undefined ? { series } : {}),
      ...(labels !== undefined ? { labels } : {}),
    }));

  const {
    type = 'metric',
    title,
    description,
    clickAction,
    target,
    label,
    className,
    titleClassName,
    descriptionClassName,
  } = currentConfig;

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture}>
          <ClickActionWrapper
            clickAction={clickAction}
            target={target}
            label={label || title}
            widgetName="Chart"
            instanceId={id}
            className={clsx(
              'kd-chart-widget block w-full text-center',
              className,
            )}
          >
            {title ? (
              <div
                className={clsx(
                  'kd-chart-title text-sm font-medium text-base-content/70',
                  titleClassName,
                )}
              >
                {title}
              </div>
            ) : null}
            {type === 'chart' ? (
              <ChartContent id={id} config={currentConfig} />
            ) : (
              <MetricContent config={currentConfig} />
            )}
            {description ? (
              <div
                className={clsx(
                  'kd-chart-description text-xs text-base-content/60',
                  descriptionClassName,
                )}
              >
                {description}
              </div>
            ) : null}
          </ClickActionWrapper>
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateThresholds = thresholds => {
  if (thresholds == null) return true;
  if (!Array.isArray(thresholds)) {
    console.error('Chart Widget Error: thresholds must be an array.');
    return false;
  }
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i];
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      console.error(`Chart Widget Error: thresholds[${i}] must be an object.`);
      return false;
    }
    if (typeof t.color !== 'string') {
      console.error(
        `Chart Widget Error: thresholds[${i}].color must be a string.`,
      );
      return false;
    }
    if (!COLOR_KEYS.includes(t.color) && !t.color.startsWith('#')) {
      console.error(
        `Chart Widget Error: thresholds[${i}].color must be one of ${COLOR_KEYS.join(', ')} or a hex color.`,
      );
      return false;
    }
    if (t.max != null && typeof t.max !== 'number') {
      console.error(
        `Chart Widget Error: thresholds[${i}].max must be a number when provided.`,
      );
      return false;
    }
  }
  return true;
};

const validatePointClickAction = pointClickAction => {
  if (pointClickAction == null) return true;
  if (typeof pointClickAction !== 'object') {
    console.error('Chart Widget Error: pointClickAction must be an object.');
    return false;
  }
  if (!POINT_CLICK_TYPES.includes(pointClickAction.type)) {
    console.error(
      `Chart Widget Error: pointClickAction.type must be one of ${POINT_CLICK_TYPES.join(', ')}.`,
    );
    return false;
  }
  if (
    pointClickAction.type === 'event' &&
    (typeof pointClickAction.name !== 'string' ||
      pointClickAction.name.length === 0)
  ) {
    console.error(
      "Chart Widget Error: pointClickAction.name is required for type='event'.",
    );
    return false;
  }
  if (
    pointClickAction.type === 'internal' &&
    (typeof pointClickAction.path !== 'string' ||
      !pointClickAction.path.startsWith('/'))
  ) {
    console.error(
      "Chart Widget Error: pointClickAction.path is required for type='internal' and must start with '/'.",
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  const type = config.type ?? 'metric';
  if (!TYPES.includes(type)) {
    console.error(
      `Chart Widget Error: type must be one of ${TYPES.join(', ')}.`,
    );
    return false;
  }
  if (config.title != null && typeof config.title !== 'string') {
    console.error('Chart Widget Error: title must be a string.');
    return false;
  }
  if (config.description != null && typeof config.description !== 'string') {
    console.error('Chart Widget Error: description must be a string.');
    return false;
  }
  if (config.color != null) {
    if (typeof config.color !== 'string') {
      console.error('Chart Widget Error: color must be a string.');
      return false;
    }
    if (!COLOR_KEYS.includes(config.color) && !config.color.startsWith('#')) {
      console.error(
        `Chart Widget Error: color must be one of ${COLOR_KEYS.join(', ')} or a hex color.`,
      );
      return false;
    }
  }
  if (!validateThresholds(config.thresholds)) return false;
  if (!validateClickAction(config.clickAction, 'Chart')) return false;
  if (!validateTarget(config.target, 'Chart')) return false;
  if (config.className != null && typeof config.className !== 'string') {
    console.error('Chart Widget Error: className must be a string.');
    return false;
  }
  if (config.label != null && typeof config.label !== 'string') {
    console.error('Chart Widget Error: label must be a string.');
    return false;
  }

  if (type === 'metric') {
    if (
      config.value != null &&
      typeof config.value !== 'number' &&
      typeof config.value !== 'string'
    ) {
      console.error(
        "Chart Widget Error: value must be a number or numeric string for type='metric'.",
      );
      return false;
    }
    if (config.format != null && !FORMATS.includes(config.format)) {
      console.error(
        `Chart Widget Error: format must be one of ${FORMATS.join(', ')}.`,
      );
      return false;
    }
    if (config.precision != null && typeof config.precision !== 'number') {
      console.error('Chart Widget Error: precision must be a number.');
      return false;
    }
    if (config.delta != null && typeof config.delta !== 'number') {
      console.error('Chart Widget Error: delta must be a number.');
      return false;
    }
    if (config.trend != null) {
      if (
        !Array.isArray(config.trend) ||
        !config.trend.every(n => typeof n === 'number')
      ) {
        console.error('Chart Widget Error: trend must be an array of numbers.');
        return false;
      }
    }
    if (
      config.trendWidth != null &&
      typeof config.trendWidth !== 'number' &&
      typeof config.trendWidth !== 'string'
    ) {
      console.error(
        'Chart Widget Error: trendWidth must be a number (pixels) or a CSS width string (e.g. "60%", "240px", "min(60%, 280px)").',
      );
      return false;
    }
    if (config.trendOpacity != null) {
      if (
        typeof config.trendOpacity !== 'number' ||
        config.trendOpacity < 0 ||
        config.trendOpacity > 1
      ) {
        console.error(
          'Chart Widget Error: trendOpacity must be a number between 0 and 1.',
        );
        return false;
      }
    }
  }

  if (type === 'chart') {
    if (config.chartType != null && !CHART_TYPES.includes(config.chartType)) {
      console.error(
        `Chart Widget Error: chartType must be one of ${CHART_TYPES.join(', ')}.`,
      );
      return false;
    }
    if (config.series != null && !Array.isArray(config.series)) {
      console.error('Chart Widget Error: series must be an array.');
      return false;
    }
    if (config.labels != null && !Array.isArray(config.labels)) {
      console.error('Chart Widget Error: labels must be an array.');
      return false;
    }
    if (config.colors != null && !Array.isArray(config.colors)) {
      console.error('Chart Widget Error: colors must be an array.');
      return false;
    }
    if (config.height != null && typeof config.height !== 'number') {
      console.error('Chart Widget Error: height must be a number.');
      return false;
    }
    if (!validatePointClickAction(config.pointClickAction)) return false;
  }

  return true;
};

/**
 * Initializes a Chart widget instance.
 *
 * Renders either a single-value **metric** card or an **ApexCharts** chart
 * (line / bar / area / donut / pie) into the supplied container. Both modes
 * share the same outer shape — `title` above, body in the middle,
 * `description` below — and the same `clickAction` / `target` system as the
 * other widgets.
 *
 * Examples:
 *
 *   // Metric — single value with threshold colors and a sparkline trend.
 *   bundle.widgets.Chart({
 *     container: K('content[CSAT]').element(),
 *     config: {
 *       type: 'metric',
 *       title: 'Customer Satisfaction',
 *       value: 4.7,
 *       precision: 1,
 *       description: 'Avg over the last 30 days',
 *       thresholds: [
 *         { max: 3, color: 'error' },
 *         { max: 4, color: 'warning' },
 *         { color: 'success' },
 *       ],
 *       trend: [4.2, 4.3, 4.5, 4.6, 4.7],
 *       delta: 0.3,
 *       deltaLabel: 'vs last month',
 *       clickAction: { type: 'internal', path: '/kapps/services/forms/feedback' },
 *     },
 *     id: 'csat',
 *   });
 *
 *   // Chart — multi-series bar with point drill-through.
 *   bundle.widgets.Chart({
 *     container: K('content[TicketsChart]').element(),
 *     config: {
 *       type: 'chart',
 *       chartType: 'bar',
 *       title: 'Tickets per week',
 *       labels: ['W1','W2','W3','W4','W5','W6','W7','W8'],
 *       series: [
 *         { name: 'Opened', data: [12,19,15,22,18,25,21,30] },
 *         { name: 'Closed', data: [10,17,14,20,17,22,20,28] },
 *       ],
 *       colors: ['primary', 'success'],
 *       pointClickAction: { type: 'internal', path: '/kapps/services/week/{{label}}' },
 *     },
 *     id: 'tickets-chart',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] Configuration object.
 * @param {string} [config.type] 'metric' (default) | 'chart'.
 * @param {string} [config.title] Title rendered above the body.
 * @param {string} [config.description] Caption rendered below the body.
 * @param {number|string} [config.value] (metric) The displayed value.
 * @param {string} [config.format] (metric) 'number' (default) | 'currency' |
 *   'percent'. Percent expects a fractional input (0.95 → '95%').
 * @param {number} [config.precision] (metric) Decimal places.
 * @param {string} [config.currency] (metric) ISO 4217 code; default 'USD'.
 *   Only used when `format: 'currency'`.
 * @param {string} [config.prefix] (metric) Prepended to the formatted value.
 * @param {string} [config.suffix] (metric) Appended to the formatted value.
 * @param {string} [config.color] (metric) Explicit color — one of
 *   `primary|secondary|accent|success|warning|error|info|neutral` or a hex
 *   string. Wins over `thresholds`.
 * @param {Array} [config.thresholds] (metric) `[{ max?, color }]` evaluated
 *   in order; first whose `max` is null or `>= value` wins.
 * @param {number} [config.delta] (metric) Numeric change — renders a chip
 *   with ▲ / ▼ direction and auto-colored (green up / red down). Use
 *   `deltaInverse: true` for "lower is better" metrics.
 * @param {string} [config.deltaLabel] (metric) Caption next to the delta.
 * @param {boolean} [config.deltaInverse] (metric) Flip delta color direction.
 * @param {Array<number>} [config.trend] (metric) Sparkline data points.
 * @param {number|string} [config.trendWidth] (metric) Sparkline backdrop
 *   width. Number → pixels. String → any CSS width value (`'60%'`,
 *   `'240px'`, `'min(60%, 280px)'`). Default `'min(60%, 280px)'` — keeps the
 *   trace visually tied to the value rather than stretching edge to edge
 *   on wide cards.
 * @param {number} [config.trendOpacity] (metric) Sparkline stroke opacity,
 *   0..1. Default `0.25`.
 * @param {string} [config.chartType] (chart) 'line' (default) | 'bar' |
 *   'area' | 'donut' | 'pie'.
 * @param {Array} [config.labels] (chart) Category labels (line/bar/area) or
 *   slice labels (donut/pie).
 * @param {Array} [config.series] (chart) `[{ name, data }]` for line/bar/area
 *   or `[n, n, ...]` for donut/pie. A flat number array on line/bar/area is
 *   auto-wrapped as a single series.
 * @param {Array<string>} [config.colors] (chart) One color per series — daisy
 *   keys (`'primary'`) or hex strings.
 * @param {number} [config.height] (chart) Pixel height; default 300.
 * @param {boolean} [config.stacked] (chart) Stack multi-series bars/areas.
 * @param {boolean} [config.showLegend] (chart) Default true.
 * @param {boolean} [config.showGrid] (chart) Default true.
 * @param {string} [config.xAxisLabel] (chart) Axis title.
 * @param {string} [config.yAxisLabel] (chart) Axis title.
 * @param {Object} [config.pointClickAction] (chart) Per-data-point click. One
 *   of `{ type: 'none' }`, `{ type: 'event', name }`, or
 *   `{ type: 'internal', path }`. `path` supports `{{label}}` and `{{value}}`
 *   tokens. Suppresses the wrapping `clickAction` for that click.
 * @param {string|Object} [config.pointTarget] (chart) Target for
 *   `pointClickAction.type='internal'`. 'current' (default) | 'new'.
 * @param {Object} [config.clickAction] Whole-widget click. Standard chrome
 *   shape — see CHROME_ACTIONS.md.
 * @param {string|Object} [config.target] Where the click opens. See
 *   CHROME_ACTIONS.md.
 * @param {string} [config.label] Accessibility label. Defaults to `title`.
 * @param {string} [config.className] Extra classes on the outer widget
 *   element. Additive.
 * @param {string} [config.titleClassName] Extra classes on the title.
 * @param {string} [config.descriptionClassName] Extra classes on the
 *   description.
 * @param {string} [config.valueClassName] (metric) Extra classes on the
 *   value element.
 * @param {string} [id] Optional id for instance tracking.
 */
export const Chart = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Chart');
  if (resolved && validateConfig(config)) {
    return registerWidget(Chart, {
      container: resolved,
      Component: ChartComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The Chart widget parameters are invalid. See the console for more details.',
  );
};
