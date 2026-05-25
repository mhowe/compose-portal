import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  CHROME_MODES,
  CHROME_MODE_CLASS,
  ClickActionWrapper,
  chromeEmit,
  chromeRegister,
  chromeUnregister,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { Icon } from '../../../atoms/Icon.jsx';

const ORIENTATIONS = ['vertical', 'horizontal'];
const SIDES = ['left', 'right'];
const LAYOUTS = ['push', 'overlay'];
const TOGGLE_POSITIONS = ['top', 'bottom', 'edge-mid'];
const ITEMS_ALIGNS = ['start', 'center', 'end'];

// `-safe` modifiers fall back to flex-start when the items slot overflows,
// keeping the top/leftmost entries reachable in the scroll track instead of
// being clipped past the start edge.
const ITEMS_ALIGN_CLASS = {
  start: 'justify-start',
  center: 'justify-center-safe',
  end: 'justify-end-safe',
};

// Default allowed-mode lists per orientation. Vertical defaults to all three;
// horizontal omits 'rail' because labels-hidden-but-same-height is rarely the
// useful collapse for a header. Authors who want it just include 'rail' in
// their `modes` list explicitly.
const DEFAULT_MODES = {
  vertical: ['expanded', 'rail', 'hidden'],
  horizontal: ['expanded', 'hidden'],
};

// Strip dimensions per orientation × mode. Width on vertical, height on
// horizontal. `hidden` also adds `overflow-hidden` so children don't paint
// past the collapsed bounds during the transition.
const STRIP_CLASS = {
  vertical: {
    expanded: 'w-64',
    rail: 'w-16',
    hidden: 'w-0 overflow-hidden',
  },
  horizontal: {
    expanded: 'h-16',
    rail: 'h-16',
    hidden: 'h-0 overflow-hidden',
  },
};

// Overlay positioning when `layout: 'overlay'`. Applied as fixed positioning
// keyed to the chrome's orientation+side; layout flow is unaffected.
const OVERLAY_CLASS = {
  'vertical-left': 'fixed top-0 left-0 bottom-0 z-40',
  'vertical-right': 'fixed top-0 right-0 bottom-0 z-40',
  horizontal: 'fixed top-0 left-0 right-0 z-40',
};

// Default toggle icons per orientation+side. Authors override via
// `internalToggle.icon`. The icon flips meaning depending on whether we're
// in expanded or non-expanded — same icon, mirrored via CSS transform when
// the chrome is collapsed.
const DEFAULT_TOGGLE_ICON = {
  'vertical-left': 'chevron-left',
  'vertical-right': 'chevron-right',
  horizontal: 'chevron-up',
};

// Resolve the next mode for a `toggle` action. Tries to flip between
// 'expanded' and a collapsed state; prefers 'rail' over 'hidden' when
// 'rail' is allowed. From any non-expanded state, going via toggle returns
// to 'expanded'.
const nextToggleMode = (currentMode, allowedModes) => {
  if (currentMode === 'expanded') {
    if (allowedModes.includes('rail')) return 'rail';
    if (allowedModes.includes('hidden')) return 'hidden';
    return 'expanded';
  }
  return 'expanded';
};

/**
 * One built-in or hosted-widget entry inside a chrome slot. The chrome
 * dispatches by kind: link / section / divider are rendered inline; entries
 * with a `widget` field get an empty slot div that the widget mounts itself
 * into via its standard `bundle.widgets.X({ container, config, id })` call.
 */
const ChromeEntry = ({
  entry,
  entryKey,
  mode,
  orientation,
  isActive,
  registerController,
}) => {
  const slotRef = useRef(null);
  const widgetApiRef = useRef(null);

  // Mount widget references. Looks up the named widget on
  // window.bundle.widgets, calls it with the slot div as container, and
  // stores the resolved controller so the chrome can drive its setMode.
  useEffect(() => {
    if (!entry.widget) return;
    if (!slotRef.current) return;
    const factory = window.bundle?.widgets?.[entry.widget];
    if (typeof factory !== 'function') {
      console.error(
        `BundleChrome: unknown widget "${entry.widget}" — make sure it's registered on window.bundle.widgets.`,
      );
      return;
    }

    let cancelled = false;
    const result = factory({
      container: slotRef.current,
      config: entry.config || {},
      id: entry.id,
    });
    Promise.resolve(result)
      .then(api => {
        if (cancelled) return;
        widgetApiRef.current = api;
        registerController(entryKey, api);
      })
      .catch(err => {
        // Widget factories reject with a string message and have already
        // logged details; surface a contextual hint here.
        console.error(
          `BundleChrome: widget "${entry.widget}" failed to mount:`,
          err,
        );
      });

    return () => {
      cancelled = true;
      registerController(entryKey, null);
      const api = widgetApiRef.current;
      widgetApiRef.current = null;
      // Defer the inner-widget unmount. Each hosted widget owns its own
      // React root (via createRoot in registerWidget); calling unmount
      // synchronously during the chrome's own commit phase trips React's
      // "synchronously unmount a root while React was already rendering"
      // warning. setTimeout(0) lets the current render cycle finish first.
      if (api && typeof api.destroy === 'function') {
        setTimeout(() => {
          try { api.destroy(); } catch { /* ignore */ }
        }, 0);
      }
    };
    // entry.widget / id / config are treated as immutable per chrome render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.widget, entry.id]);

  // Dividers — same in any mode.
  if (entry.type === 'divider') {
    const cls =
      orientation === 'vertical'
        ? 'kd-chrome-divider mx-2 my-1 border-t border-base-300'
        : 'kd-chrome-divider my-2 mx-1 border-l border-base-300';
    return <div role="separator" className={cls} />;
  }

  // Section heading — text in expanded; a thin divider in rail or hidden.
  if (entry.type === 'section') {
    if (mode === 'expanded') {
      return (
        <div
          className={clsx(
            'kd-chrome-section px-3 pt-3 pb-1 text-xs uppercase font-semibold text-base-content/60 select-none',
            orientation === 'horizontal' && 'pt-0 pb-0 self-center',
          )}
        >
          {entry.label}
        </div>
      );
    }
    const cls =
      orientation === 'vertical'
        ? 'kd-chrome-section-collapsed mx-2 my-1 border-t border-base-300'
        : 'kd-chrome-section-collapsed my-2 mx-1 border-l border-base-300';
    return <div role="separator" aria-label={entry.label} className={cls} />;
  }

  // Link — built-in clickable entry, lighter than mounting a BundleLink.
  if (entry.type === 'link') {
    const showLabel = mode === 'expanded';
    const tooltip = entry.tooltip ?? entry.label;
    const isIconOnly = !showLabel && !!entry.icon;
    return (
      <ClickActionWrapper
        clickAction={entry.clickAction}
        target={entry.target}
        label={entry.label}
        widgetName="BundleChrome"
        instanceId={entry.id}
        className={clsx(
          'kbtn kbtn-ghost flex items-center gap-3 justify-start',
          isIconOnly && 'kbtn-square',
          orientation === 'vertical' && 'w-full',
        )}
      >
        <span
          {...(!showLabel && tooltip ? { title: tooltip } : {})}
          data-active={isActive ? 'true' : undefined}
          className="contents"
        >
          {entry.icon && (
            <Icon name={entry.icon} size={20} className="flex-none" />
          )}
          {showLabel && entry.label && (
            <span className="truncate">{entry.label}</span>
          )}
        </span>
      </ClickActionWrapper>
    );
  }

  // Widget reference — render an empty slot; the widget mounts itself into
  // it via the effect above. The chrome wraps it in a sized container and
  // applies the mode CSS class so widgets without setMode can adapt via CSS.
  if (entry.widget) {
    const tooltip = entry.tooltip;
    return (
      <div
        ref={slotRef}
        title={mode !== 'expanded' && tooltip ? tooltip : undefined}
        className={clsx(
          'kd-chrome-widget-slot',
          CHROME_MODE_CLASS[mode],
          orientation === 'vertical' && 'w-full flex justify-center',
          orientation === 'horizontal' && 'flex items-center',
        )}
      />
    );
  }

  // Unknown entry kind — render nothing but log so authors notice.
  console.warn('BundleChrome: unknown entry kind:', entry);
  return null;
};

const ChromeSlot = ({
  entries,
  slotName,
  mode,
  orientation,
  activeItemId,
  itemsAlign,
  registerController,
}) => {
  if (!entries || entries.length === 0) return null;
  const isVertical = orientation === 'vertical';
  const isItemsSlot = slotName === 'items';
  return (
    <div
      className={clsx(
        `kd-chrome-${slotName}`,
        isVertical
          ? 'flex flex-col gap-1 px-2 py-2'
          : 'flex flex-row items-center gap-2 px-2',
        isItemsSlot && (isVertical ? 'flex-1 overflow-y-auto' : 'flex-1'),
        isItemsSlot && ITEMS_ALIGN_CLASS[itemsAlign],
      )}
    >
      {entries.map((entry, i) => {
        const key = entry.id || `${slotName}-${i}`;
        const isActive =
          entry.type === 'link' && entry.id && entry.id === activeItemId;
        return (
          <ChromeEntry
            key={key}
            entryKey={key}
            entry={entry}
            mode={mode}
            orientation={orientation}
            isActive={isActive}
            registerController={registerController}
          />
        );
      })}
    </div>
  );
};

const InternalToggle = ({
  config,
  mode,
  orientation,
  side,
  onToggle,
  allowedModes,
  position,
}) => {
  if (config?.show === false) return null;

  // Hide the toggle entirely when collapsed if there's no `rail` mode —
  // the user reaches it via an external trigger. Otherwise (with rail),
  // the toggle stays visible in the rail strip.
  if (mode === 'hidden' && !allowedModes.includes('rail')) return null;

  const orientationKey =
    orientation === 'vertical' ? `vertical-${side}` : 'horizontal';
  const icon = config?.icon || DEFAULT_TOGGLE_ICON[orientationKey];
  // Mirror the chevron when collapsed, so the same icon points "open" or
  // "closed" intuitively.
  const flipped = mode !== 'expanded';
  const ariaExpanded = mode === 'expanded';

  // For edge-mid, the toggle floats half-outside the chrome on its outer
  // edge (right for vertical-left, left for vertical-right, bottom for
  // horizontal). `edgeOffset` shifts the button along the chrome's main
  // axis as a percent from the start edge (0–100, default 50 = centered).
  let edgeStyle;
  if (position === 'edge-mid') {
    const rawOffset =
      typeof config?.edgeOffset === 'number' ? config.edgeOffset : 50;
    const offset = Math.max(0, Math.min(100, rawOffset));
    if (orientation === 'vertical') {
      edgeStyle = {
        top: `${offset}%`,
        [side === 'left' ? 'right' : 'left']: '-12px',
        transform: 'translateY(-50%)',
      };
    } else {
      edgeStyle = {
        left: `${offset}%`,
        bottom: '-12px',
        transform: 'translateX(-50%)',
      };
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={ariaExpanded}
      aria-label={config?.ariaLabel || 'Toggle navigation'}
      style={edgeStyle}
      className={clsx(
        'kbtn kbtn-ghost kbtn-sm kbtn-square',
        position === 'edge-mid'
          ? 'absolute z-10 bg-base-100 border border-base-300 shadow-sm'
          : 'self-center',
        flipped && 'rotate-180',
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
};

const BundleChromeComponent = forwardRef(({ id, config }, ref) => {
  const apiRef = useRef({});
  const onClickCapture = useInternalLinkInterceptor();

  const orientation = ORIENTATIONS.includes(config.orientation)
    ? config.orientation
    : 'vertical';
  const side =
    orientation === 'vertical'
      ? SIDES.includes(config.side)
        ? config.side
        : 'left'
      : 'left';
  const layout = LAYOUTS.includes(config.layout) ? config.layout : 'push';
  const itemsAlign = ITEMS_ALIGNS.includes(config.itemsAlign)
    ? config.itemsAlign
    : 'center';

  // Allowed-mode list — filter user-supplied list to the canonical three
  // and fall back to per-orientation defaults if nothing usable is given.
  const allowedModes =
    Array.isArray(config.modes) && config.modes.length > 0
      ? config.modes.filter(m => CHROME_MODES.includes(m))
      : DEFAULT_MODES[orientation];
  const safeAllowedModes =
    allowedModes.length > 0 ? allowedModes : DEFAULT_MODES[orientation];

  const initialMode =
    safeAllowedModes.includes(config.defaultMode)
      ? config.defaultMode
      : safeAllowedModes.includes('expanded')
        ? 'expanded'
        : safeAllowedModes[0];

  const [mode, setModeState] = useState(initialMode);
  const [activeItemId, setActiveItemIdState] = useState(null);

  // Refs that mirror the latest state, so the imperative controller's getters
  // can return fresh values without re-creating the controller (and thus
  // re-emitting destroy) on every state change.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const activeItemRef = useRef(activeItemId);
  activeItemRef.current = activeItemId;
  const allowedModesRef = useRef(safeAllowedModes);
  allowedModesRef.current = safeAllowedModes;

  // Map of entry-key -> hosted widget controller. Mutated by ChromeEntry as
  // widgets mount/unmount; iterated when mode changes.
  const controllersRef = useRef(new Map());
  const registerController = useCallback((key, controller) => {
    if (controller) {
      controllersRef.current.set(key, controller);
      // Push the current mode immediately so the widget initialises right.
      try {
        if (typeof controller.setMode === 'function')
          controller.setMode(modeRef.current);
      } catch (e) {
        console.error('BundleChrome: setMode threw on register:', e);
      }
    } else {
      controllersRef.current.delete(key);
    }
  }, []);

  // Push mode changes to hosted widgets, and emit the registry `change` event.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      const prev = prevModeRef.current;
      prevModeRef.current = mode;
      for (const controller of controllersRef.current.values()) {
        try {
          if (typeof controller.setMode === 'function')
            controller.setMode(mode);
        } catch (e) {
          console.error('BundleChrome: setMode threw on transition:', e);
        }
      }
      chromeEmit(id, 'change', { mode, prev });
    }
  }, [mode, id]);

  // Build the imperative controller exactly once per component instance.
  // Method bodies read refs so they always see the latest state, and the
  // controller is exposed on apiRef synchronously during render — that way
  // the widget's promise resolves with a fully-functional api, and the
  // first chromeRegister(id, controller) call below uses the same object
  // any later registry consumer will see.
  const controllerRef = useRef(null);
  if (controllerRef.current === null) {
    const setModeChecked = next => {
      const allowed = allowedModesRef.current;
      if (!allowed.includes(next)) {
        console.warn(
          `BundleChrome[${id}]: mode "${next}" not in allowed modes ${JSON.stringify(allowed)}; ignoring.`,
        );
        return;
      }
      if (next === modeRef.current) return;
      setModeState(next);
    };
    controllerRef.current = {
      id,
      getMode: () => modeRef.current,
      setMode: setModeChecked,
      toggle: () => {
        const next = nextToggleMode(modeRef.current, allowedModesRef.current);
        setModeChecked(next);
      },
      expand: () => setModeChecked('expanded'),
      collapse: () => {
        const allowed = allowedModesRef.current;
        const next = allowed.includes('rail')
          ? 'rail'
          : allowed.includes('hidden')
            ? 'hidden'
            : modeRef.current;
        setModeChecked(next);
      },
      hide: () => {
        if (allowedModesRef.current.includes('hidden'))
          setModeChecked('hidden');
      },
      setActiveItem: nextId => setActiveItemIdState(nextId ?? null),
      getActiveItem: () => activeItemRef.current,
      getOrientation: () => orientation,
      getSide: () => side,
    };
  }
  // Idempotent — same controller object across renders.
  Object.assign(apiRef.current, controllerRef.current);

  // Side-effect: register/unregister the controller in the global chrome
  // registry so external triggers can find it by id. Emit a destroy event
  // on unmount so subscribers can clean up.
  useEffect(() => {
    chromeRegister(id, controllerRef.current);
    return () => {
      chromeUnregister(id);
      chromeEmit(id, 'destroy', { id });
    };
  }, [id]);

  // Esc closes overlay-hidden mode (when overlay is in use and the chrome
  // is currently expanded into the overlay). Bound globally because the
  // expanded overlay may not have focus.
  useEffect(() => {
    if (layout !== 'overlay') return;
    if (mode !== 'expanded') return;
    const handleKey = e => {
      if (e.key === 'Escape') {
        if (allowedModesRef.current.includes('hidden')) setModeState('hidden');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [layout, mode]);

  const orientationKey =
    orientation === 'vertical' ? `vertical-${side}` : 'horizontal';
  const stripClass = STRIP_CLASS[orientation][mode] || STRIP_CLASS[orientation].expanded;
  const overlayClass = layout === 'overlay' ? OVERLAY_CLASS[orientationKey] : '';

  const togglePosition = TOGGLE_POSITIONS.includes(config.internalToggle?.position)
    ? config.internalToggle.position
    : 'bottom';
  const toggleEl = (
    <InternalToggle
      config={config.internalToggle}
      mode={mode}
      orientation={orientation}
      side={side}
      allowedModes={safeAllowedModes}
      position={togglePosition}
      onToggle={() => {
        const next = nextToggleMode(mode, safeAllowedModes);
        setModeState(next);
      }}
    />
  );

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={apiRef.current}>
        <div onClickCapture={onClickCapture} className="contents">
          <nav
            role="navigation"
            aria-label={config.ariaLabel || 'Navigation'}
            data-chrome-id={id}
            data-chrome-mode={mode}
            data-chrome-orientation={orientation}
            data-chrome-side={side}
            className={clsx(
              'kd-chrome bg-base-100 transition-[width,height] duration-200',
              CHROME_MODE_CLASS[mode],
              stripClass,
              overlayClass,
              togglePosition === 'edge-mid' && 'relative',
              orientation === 'vertical' && 'flex flex-col h-full border-base-300',
              orientation === 'vertical' && side === 'left' && 'border-r',
              orientation === 'vertical' && side === 'right' && 'border-l',
              orientation === 'horizontal' && 'flex flex-row items-stretch border-b border-base-300 w-full',
            )}
          >
            {togglePosition === 'top' && toggleEl}
            <ChromeSlot
              entries={config.top || []}
              slotName="top"
              mode={mode}
              orientation={orientation}
              activeItemId={activeItemId}
              registerController={registerController}
            />
            <ChromeSlot
              entries={config.items || []}
              slotName="items"
              mode={mode}
              orientation={orientation}
              activeItemId={activeItemId}
              itemsAlign={itemsAlign}
              registerController={registerController}
            />
            <ChromeSlot
              entries={config.bottom || []}
              slotName="bottom"
              mode={mode}
              orientation={orientation}
              activeItemId={activeItemId}
              registerController={registerController}
            />
            {togglePosition === 'bottom' && toggleEl}
            {togglePosition === 'edge-mid' && toggleEl}
          </nav>
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const ENTRY_KINDS = ['link', 'section', 'divider'];

const validateEntry = (entry, where) => {
  if (!entry || typeof entry !== 'object') {
    console.error(`BundleChrome Widget Error: ${where} must be an object.`);
    return false;
  }
  // Widget reference takes precedence: anything with `widget` is a widget
  // entry regardless of `type`.
  if (typeof entry.widget === 'string') {
    if (entry.config != null && typeof entry.config !== 'object') {
      console.error(
        `BundleChrome Widget Error: ${where}.config must be an object.`,
      );
      return false;
    }
    if (entry.tooltip != null && typeof entry.tooltip !== 'string') {
      console.error(
        `BundleChrome Widget Error: ${where}.tooltip must be a string.`,
      );
      return false;
    }
    return true;
  }
  if (!ENTRY_KINDS.includes(entry.type)) {
    console.error(
      `BundleChrome Widget Error: ${where}.type must be one of ${ENTRY_KINDS.join(', ')} (or include a 'widget' field).`,
    );
    return false;
  }
  if (entry.type === 'divider') return true;
  if (entry.type === 'section') {
    if (typeof entry.label !== 'string' || entry.label.length === 0) {
      console.error(
        `BundleChrome Widget Error: ${where}.label is required for section.`,
      );
      return false;
    }
    return true;
  }
  // link
  if (typeof entry.label !== 'string' || entry.label.length === 0) {
    console.error(
      `BundleChrome Widget Error: ${where}.label is required for a link.`,
    );
    return false;
  }
  if (entry.icon != null && typeof entry.icon !== 'string') {
    console.error(`BundleChrome Widget Error: ${where}.icon must be a string.`);
    return false;
  }
  if (entry.tooltip != null && typeof entry.tooltip !== 'string') {
    console.error(
      `BundleChrome Widget Error: ${where}.tooltip must be a string.`,
    );
    return false;
  }
  if (!validateClickAction(entry.clickAction, `BundleChrome ${where}`))
    return false;
  if (!validateTarget(entry.target, `BundleChrome ${where}`)) return false;
  return true;
};

const validateSlot = (slot, slotName) => {
  if (slot == null) return true;
  if (!Array.isArray(slot)) {
    console.error(
      `BundleChrome Widget Error: ${slotName} must be an array of entries.`,
    );
    return false;
  }
  for (let i = 0; i < slot.length; i++) {
    if (!validateEntry(slot[i], `${slotName}[${i}]`)) return false;
  }
  return true;
};

const validateInternalToggle = toggle => {
  if (toggle == null) return true;
  if (typeof toggle !== 'object') {
    console.error('BundleChrome Widget Error: internalToggle must be an object.');
    return false;
  }
  if (toggle.show != null && typeof toggle.show !== 'boolean') {
    console.error(
      'BundleChrome Widget Error: internalToggle.show must be a boolean.',
    );
    return false;
  }
  if (toggle.icon != null && typeof toggle.icon !== 'string') {
    console.error(
      'BundleChrome Widget Error: internalToggle.icon must be a string.',
    );
    return false;
  }
  if (
    toggle.position != null &&
    !TOGGLE_POSITIONS.includes(toggle.position)
  ) {
    console.error(
      `BundleChrome Widget Error: internalToggle.position must be one of ${TOGGLE_POSITIONS.join(', ')}.`,
    );
    return false;
  }
  if (toggle.edgeOffset != null) {
    if (
      typeof toggle.edgeOffset !== 'number' ||
      toggle.edgeOffset < 0 ||
      toggle.edgeOffset > 100
    ) {
      console.error(
        'BundleChrome Widget Error: internalToggle.edgeOffset must be a number between 0 and 100.',
      );
      return false;
    }
  }
  if (toggle.ariaLabel != null && typeof toggle.ariaLabel !== 'string') {
    console.error(
      'BundleChrome Widget Error: internalToggle.ariaLabel must be a string.',
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  if (
    config.orientation != null &&
    !ORIENTATIONS.includes(config.orientation)
  ) {
    console.error(
      `BundleChrome Widget Error: orientation must be one of ${ORIENTATIONS.join(', ')}.`,
    );
    return false;
  }
  if (config.side != null && !SIDES.includes(config.side)) {
    console.error(
      `BundleChrome Widget Error: side must be one of ${SIDES.join(', ')}.`,
    );
    return false;
  }
  if (config.layout != null && !LAYOUTS.includes(config.layout)) {
    console.error(
      `BundleChrome Widget Error: layout must be one of ${LAYOUTS.join(', ')}.`,
    );
    return false;
  }
  if (config.modes != null) {
    if (!Array.isArray(config.modes)) {
      console.error('BundleChrome Widget Error: modes must be an array.');
      return false;
    }
    const bad = config.modes.filter(m => !CHROME_MODES.includes(m));
    if (bad.length > 0) {
      console.error(
        `BundleChrome Widget Error: modes contains invalid entries (${bad.join(', ')}); allowed: ${CHROME_MODES.join(', ')}.`,
      );
      return false;
    }
  }
  if (config.defaultMode != null && !CHROME_MODES.includes(config.defaultMode)) {
    console.error(
      `BundleChrome Widget Error: defaultMode must be one of ${CHROME_MODES.join(', ')}.`,
    );
    return false;
  }
  if (config.itemsAlign != null && !ITEMS_ALIGNS.includes(config.itemsAlign)) {
    console.error(
      `BundleChrome Widget Error: itemsAlign must be one of ${ITEMS_ALIGNS.join(', ')}.`,
    );
    return false;
  }
  if (config.contentSelector != null && typeof config.contentSelector !== 'string') {
    console.error(
      'BundleChrome Widget Error: contentSelector must be a string.',
    );
    return false;
  }
  if (config.ariaLabel != null && typeof config.ariaLabel !== 'string') {
    console.error('BundleChrome Widget Error: ariaLabel must be a string.');
    return false;
  }
  if (!validateInternalToggle(config.internalToggle)) return false;
  if (!validateSlot(config.top, 'top')) return false;
  if (!validateSlot(config.items, 'items')) return false;
  if (!validateSlot(config.bottom, 'bottom')) return false;
  return true;
};

/**
 * Initializes a BundleChrome widget instance — a configurable nav strip
 * (vertical or horizontal) that hosts links, dividers, section labels, and
 * other registered widgets.
 *
 * See BUNDLE_CHROME.md for the full spec, slot/entry kinds, mode contract,
 * and coordination registry.
 *
 * Minimal usage:
 *   bundle.widgets.BundleChrome({
 *     container: K('content[Header]').element(),
 *     id: 'header',
 *     config: {
 *       orientation: 'horizontal',
 *       items: [
 *         { type: 'link', id: 'home', label: 'Home', icon: 'home',
 *           clickAction: { type: 'home' } },
 *       ],
 *     },
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] Configuration object — see BUNDLE_CHROME.md.
 *   Common fields:
 *     - orientation: 'vertical' (default) | 'horizontal'
 *     - side: 'left' (default) | 'right'  (vertical only)
 *     - modes: subset of ['expanded','rail','hidden']
 *     - defaultMode: starting mode
 *     - layout: 'push' (default) | 'overlay'
 *     - top / items / bottom: arrays of entries (link/section/divider/widget)
 *     - internalToggle: { show, icon, position, ariaLabel }
 *     - ariaLabel: string for the nav landmark
 * @param {string} [id] Required for chrome instances that need to be
 *   addressable by `BundleChromeToggle` or via the registry.
 *   By convention: `'header'` for the bundle-level horizontal chrome,
 *   `'kapp'` for kapp-level vertical chromes.
 */
export const BundleChrome = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleChrome');
  if (resolved && validateConfig(config)) {
    if (!id) {
      console.warn(
        'BundleChrome: no id provided — the chrome will mount but cannot be targeted by BundleChromeToggle or the registry.',
      );
    }
    return registerWidget(BundleChrome, {
      container: resolved,
      Component: BundleChromeComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleChrome widget parameters are invalid. See the console for more details.',
  );
};
