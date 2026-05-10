import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { Popover, usePopover } from '@ark-ui/react/popover';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { Icon } from '../../../atoms/Icon.jsx';
import {
  mapRowToItem,
  useIntegration,
  validateIntegrationBase,
} from './integration.js';

const LAYOUTS = ['popover', 'inline'];
const SIZES = ['sm', 'md', 'lg', 'xl'];

const TRIGGER_SIZE_CLASSES = {
  sm: 'kbtn kbtn-ghost kbtn-sm',
  md: 'kbtn kbtn-ghost',
  lg: 'kbtn kbtn-ghost kbtn-lg',
  xl: 'kbtn kbtn-ghost kbtn-xl',
};
const TRIGGER_ICON_SIZES = { sm: 16, md: 20, lg: 24, xl: 28 };

// Menu item — handles four shapes: divider, header (section title), regular
// (clickable item), and nested (item with children that render expanded
// inline beneath it). For `popover` layout, clicking any clickable item
// closes the popover; `onItemClick` is the close hook passed from above.
const MenuItem = ({ idPrefix, item, depth, onItemClick }) => {
  if (item.hidden) return null;

  if (item.divider) {
    return (
      <li role="separator">
        <hr className="my-1 border-base-300" />
      </li>
    );
  }

  if (item.header) {
    return (
      <li className="px-3 pt-3 pb-1 text-xs uppercase font-semibold text-base-content/60 select-none">
        {item.text}
      </li>
    );
  }

  const hasChildren =
    Array.isArray(item.children) && item.children.length > 0;
  const isClickable =
    item.clickAction && item.clickAction.type !== 'none';

  return (
    <li onClick={isClickable ? onItemClick : undefined}>
      <ClickActionWrapper
        clickAction={item.clickAction || { type: 'none' }}
        target={item.target}
        label={item.label || item.text}
        widgetName="BundleMenu"
        instanceId={idPrefix}
        className={clsx(
          'flex items-center gap-3 px-3 py-2 w-full rounded-md text-left',
          isClickable && 'hover:bg-base-200 cursor-pointer',
          // Indent nested items via padding-left increments
          depth > 0 && {
            'pl-6': depth === 1,
            'pl-9': depth === 2,
            'pl-12': depth >= 3,
          },
        )}
      >
        {item.icon && (
          <Icon name={item.icon} size={18} className="flex-none" />
        )}
        <span className="flex-c-st gap-0 min-w-0">
          <span className="truncate">{item.text}</span>
          {item.description && (
            <small className="text-base-content/60 truncate">
              {item.description}
            </small>
          )}
        </span>
      </ClickActionWrapper>
      {hasChildren && (
        <ul className="contents">
          {item.children.map((child, i) => (
            <MenuItem
              key={`${idPrefix}-c${i}`}
              idPrefix={`${idPrefix}-c${i}`}
              item={child}
              depth={depth + 1}
              onItemClick={onItemClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

// Plain ul (no DaisyUI `kmenu` class) — kmenu applies hover/cursor styling
// to every li child via descendant selector, which would override our
// per-item styling and force pointer/highlight onto headers and dividers.
// All visual styling is controlled per-item in MenuItem instead.
const ItemList = ({ idPrefix, items, onItemClick }) => (
  <ul className="flex flex-col w-full p-0 m-0 list-none">
    {items.map((item, i) => (
      <MenuItem
        key={`${idPrefix}-${i}`}
        idPrefix={`${idPrefix}-${i}`}
        item={item}
        depth={0}
        onItemClick={onItemClick}
      />
    ))}
  </ul>
);

// Popover layout — icon/text trigger button, dropdown content with items.
const PopoverMenu = ({ id, items, trigger, mode = 'expanded' }) => {
  const popover = usePopover();
  const close = () => popover.setOpen(false);

  const triggerSize = SIZES.includes(trigger.size) ? trigger.size : 'md';
  // In rail mode, hide the trigger text — the popover collapses to an
  // icon-only button. Same trigger config, just rendered tighter.
  const hideTriggerText = mode === 'rail';
  const hasText = !!trigger.text && !hideTriggerText;

  // Resolve the trigger icon:
  //   - explicit string → use it
  //   - explicitly null or '' → no icon (but rail mode forces a fallback)
  //   - undefined + text present → no icon (text-only trigger)
  //   - undefined + no text → default to 'menu-2' (the hamburger fallback)
  let resolvedIcon;
  if (trigger.icon === null || trigger.icon === '') {
    resolvedIcon = null;
  } else if (typeof trigger.icon === 'string') {
    resolvedIcon = trigger.icon;
  } else {
    resolvedIcon = hasText ? null : 'menu-2';
  }
  // Rail mode requires *some* visible affordance; if neither an icon nor
  // visible text is present, fall back to the hamburger.
  if (mode === 'rail' && !resolvedIcon) {
    resolvedIcon = 'menu-2';
  }

  const computedTriggerClass = clsx(
    TRIGGER_SIZE_CLASSES[triggerSize],
    !!resolvedIcon && !hasText && 'kbtn-square',
  );
  const triggerClass = trigger.className ?? computedTriggerClass;
  const iconNode = resolvedIcon ? (
    <Icon name={resolvedIcon} size={TRIGGER_ICON_SIZES[triggerSize]} />
  ) : null;
  const textNode = hasText && <span>{trigger.text}</span>;
  const right = trigger.iconPosition === 'right';

  return (
    <Popover.RootProvider value={popover} autoFocus={false}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={trigger.label || trigger.text || 'Menu'}
        >
          {right ? (
            <>
              {textNode}
              {iconNode}
            </>
          ) : (
            <>
              {iconNode}
              {textNode}
            </>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content
          className="bg-base-100 border border-base-300 rounded-box shadow-lg p-1 min-w-60 z-30 outline-0"
        >
          <ItemList idPrefix={id} items={items} onItemClick={close} />
        </Popover.Content>
      </Popover.Positioner>
    </Popover.RootProvider>
  );
};

const BundleMenuComponent = forwardRef(({ id, config }, ref) => {
  const onClickCapture = useInternalLinkInterceptor();
  const [mode, setMode] = useState('expanded');
  const layout = LAYOUTS.includes(config.layout) ? config.layout : 'popover';
  const staticItems = config.items || [];
  const integration = config.integration;

  // Integration fetch + state lives in the shared hook; the menu just maps
  // the resolved list into menu items via its `itemMap` / `transform`, then
  // composes with static items and renders loading/error placeholders.
  const {
    list: integrationList,
    loading: integrationLoading,
    error: integrationError,
    refresh: refetch,
  } = useIntegration(integration);

  const integrationItems = useMemo(
    () =>
      integrationList
        ? integrationList.map(row =>
            mapRowToItem(row, integration?.itemMap, integration?.transform),
          )
        : null,
    [integrationList, integration],
  );

  // Imperative API. Keep refresh pointing at the latest refetch closure
  // so external callers always trigger an up-to-date fetch.
  const apiRef = useRef({ refresh: () => {} });
  useEffect(() => {
    apiRef.current.refresh = refetch;
  }, [refetch]);

  // Mode-aware api exposure. Synchronous so chrome can call setMode the
  // moment the widget's promise resolves.
  apiRef.current.setMode = setMode;
  apiRef.current.tooltip =
    config.tooltip ?? config.trigger?.text ?? config.trigger?.label;

  // Compose the rendered item list: static first, then integration's
  // loading/error placeholder OR its resolved items.
  const items = useMemo(() => {
    if (!integration) return staticItems;
    if (integrationItems) {
      return [...staticItems, ...integrationItems];
    }
    if (integrationLoading) {
      return [
        ...staticItems,
        {
          text: integration.loadingMessage || 'Loading...',
          clickAction: { type: 'none' },
        },
      ];
    }
    if (integrationError) {
      return [
        ...staticItems,
        {
          text: integration.errorMessage || 'Failed to load menu items.',
          clickAction: { type: 'none' },
        },
      ];
    }
    return staticItems;
  }, [
    integration,
    staticItems,
    integrationItems,
    integrationLoading,
    integrationError,
  ]);

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={apiRef.current}>
        <div onClickCapture={onClickCapture} className="flex-initial w-full">
          {layout === 'popover' ? (
            <PopoverMenu
              id={id || 'menu'}
              items={items}
              trigger={config.trigger || {}}
              mode={mode}
            />
          ) : (
            <ItemList idPrefix={id || 'menu'} items={items} />
          )}
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateItems = (items, parentName) => {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = `${parentName}[${i}]`;
    if (!item || typeof item !== 'object') {
      console.error(`BundleMenu Widget Error: ${name} must be an object.`);
      return false;
    }
    // Dividers don't need other fields validated.
    if (item.divider) continue;
    if (item.text != null && typeof item.text !== 'string') {
      console.error(`BundleMenu Widget Error: ${name}.text must be a string.`);
      return false;
    }
    if (
      !item.header &&
      (typeof item.text !== 'string' || item.text.length === 0)
    ) {
      console.error(
        `BundleMenu Widget Error: ${name} requires a 'text' (or set 'divider: true' / 'header: true').`,
      );
      return false;
    }
    if (item.icon != null && typeof item.icon !== 'string') {
      console.error(`BundleMenu Widget Error: ${name}.icon must be a string.`);
      return false;
    }
    if (item.description != null && typeof item.description !== 'string') {
      console.error(
        `BundleMenu Widget Error: ${name}.description must be a string.`,
      );
      return false;
    }
    if (item.label != null && typeof item.label !== 'string') {
      console.error(`BundleMenu Widget Error: ${name}.label must be a string.`);
      return false;
    }
    if (!validateClickAction(item.clickAction, `BundleMenu ${name}`))
      return false;
    if (!validateTarget(item.target, `BundleMenu ${name}`)) return false;
    if (item.children != null) {
      if (!Array.isArray(item.children)) {
        console.error(
          `BundleMenu Widget Error: ${name}.children must be an array.`,
        );
        return false;
      }
      if (!validateItems(item.children, `${name}.children`)) return false;
    }
  }
  return true;
};

const validateTrigger = trigger => {
  if (trigger == null) return true;
  if (typeof trigger !== 'object') {
    console.error('BundleMenu Widget Error: trigger must be an object.');
    return false;
  }
  if (trigger.size != null && !SIZES.includes(trigger.size)) {
    console.error(
      `BundleMenu Widget Error: trigger.size must be one of ${SIZES.join(', ')}.`,
    );
    return false;
  }
  if (trigger.icon != null && typeof trigger.icon !== 'string') {
    console.error('BundleMenu Widget Error: trigger.icon must be a string.');
    return false;
  }
  if (trigger.text != null && typeof trigger.text !== 'string') {
    console.error('BundleMenu Widget Error: trigger.text must be a string.');
    return false;
  }
  if (
    trigger.iconPosition != null &&
    trigger.iconPosition !== 'left' &&
    trigger.iconPosition !== 'right'
  ) {
    console.error(
      'BundleMenu Widget Error: trigger.iconPosition must be "left" or "right".',
    );
    return false;
  }
  if (trigger.className != null && typeof trigger.className !== 'string') {
    console.error(
      'BundleMenu Widget Error: trigger.className must be a string.',
    );
    return false;
  }
  if (trigger.label != null && typeof trigger.label !== 'string') {
    console.error('BundleMenu Widget Error: trigger.label must be a string.');
    return false;
  }
  return true;
};

const validateIntegration = integration => {
  if (integration == null) return true;
  if (!validateIntegrationBase(integration, 'BundleMenu')) return false;
  // Menu-specific extras: itemMap (template), transform (function — mutually
  // exclusive with itemMap), and the loading/error placeholder messages.
  if (
    integration.itemMap != null &&
    (typeof integration.itemMap !== 'object' ||
      Array.isArray(integration.itemMap))
  ) {
    console.error(
      'BundleMenu Widget Error: integration.itemMap must be a plain object.',
    );
    return false;
  }
  if (
    integration.transform != null &&
    typeof integration.transform !== 'function'
  ) {
    console.error(
      'BundleMenu Widget Error: integration.transform must be a function.',
    );
    return false;
  }
  if (integration.itemMap && integration.transform) {
    console.error(
      'BundleMenu Widget Error: provide either integration.itemMap or integration.transform, not both.',
    );
    return false;
  }
  if (
    integration.loadingMessage != null &&
    typeof integration.loadingMessage !== 'string'
  ) {
    console.error(
      'BundleMenu Widget Error: integration.loadingMessage must be a string.',
    );
    return false;
  }
  if (
    integration.errorMessage != null &&
    typeof integration.errorMessage !== 'string'
  ) {
    console.error(
      'BundleMenu Widget Error: integration.errorMessage must be a string.',
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  if (config.layout != null && !LAYOUTS.includes(config.layout)) {
    console.error(
      `BundleMenu Widget Error: layout must be one of ${LAYOUTS.join(', ')}.`,
    );
    return false;
  }
  if (config.items != null) {
    if (!Array.isArray(config.items)) {
      console.error('BundleMenu Widget Error: items must be an array.');
      return false;
    }
    if (!validateItems(config.items, 'items')) return false;
  }
  if (!validateTrigger(config.trigger)) return false;
  if (!validateIntegration(config.integration)) return false;
  if (config.tooltip != null && typeof config.tooltip !== 'string') {
    console.error('BundleMenu Widget Error: tooltip must be a string.');
    return false;
  }
  return true;
};

/**
 * Initializes a BundleMenu widget instance — a configurable menu with
 * popover or inline layout, supporting nested items, dividers, section
 * headers, and the same clickAction / target options as other chrome widgets.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.BundleMenu({
 *     container: K('content[Menu]').element(),
 *     config: {
 *       layout: 'popover',                    // 'popover' (default) or 'inline'
 *       trigger: { icon: 'menu-2', size: 'lg' },  // popover only
 *       items: [
 *         { icon: 'home', text: 'Home', clickAction: { type: 'home' } },
 *         { divider: true },
 *         { header: true, text: 'Admin' },
 *         { icon: 'palette', text: 'Theme', clickAction: { type: 'internal', path: '/theme' } },
 *       ],
 *     },
 *     id: 'main-menu',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] All fields optional.
 * @param {string} [config.layout] 'popover' (default) or 'inline'.
 * @param {Array}  [config.items] Array of static item configs. Each item is one of:
 *   - Regular item: `{ icon?, text, description?, clickAction?, target?, label?, children? }`
 *   - Section header: `{ header: true, text }` (non-interactive label)
 *   - Divider: `{ divider: true }` (visual separator)
 *   - Hidden: any item with `hidden: true` is skipped
 * @param {Object} [config.integration] Optional integration source. Items
 *   resolved from the integration response render *after* `config.items`.
 *   Required fields: `kappSlug`, `integrationName`, `listProperty` (path to
 *   the array of rows in the response). Optional: `formSlug` (for form
 *   integrations), `parameters` (passed to integration), `errorProperty`
 *   (path in response where error is reported), `itemMap` (declarative
 *   per-row mapping with `{{path}}` template syntax), `transform`
 *   (function alternative to itemMap — receives a row, returns an item
 *   config), `loadingMessage`, `errorMessage`, `onError`, `onSuccess`.
 *   Provide either `itemMap` or `transform`, not both.
 * @param {Object} [config.trigger] Popover-only. The clickable thing that
 *   opens the dropdown. Same vocabulary as BundleLink: icon (default
 *   'menu-2'), text, iconPosition, size, label, className.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const BundleMenu = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleMenu');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleMenu, {
      container: resolved,
      Component: BundleMenuComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleMenu widget parameters are invalid. See the console for more details.',
  );
};
