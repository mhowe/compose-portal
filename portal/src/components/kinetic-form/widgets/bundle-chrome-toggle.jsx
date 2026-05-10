import { forwardRef, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  CHROME_MODES,
  chromeGetController,
  chromeOff,
  chromeOn,
  useInternalLinkInterceptor,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';
import { Icon } from '../../../atoms/Icon.jsx';

const ACTIONS = ['toggle', 'show', 'hide', 'rail', 'expand'];
const SIZES = ['sm', 'md', 'lg', 'xl'];

const SIZE_CLASSES = {
  sm: { btn: 'kbtn kbtn-ghost kbtn-sm kbtn-square', icon: 16 },
  md: { btn: 'kbtn kbtn-ghost kbtn-square', icon: 20 },
  lg: { btn: 'kbtn kbtn-ghost kbtn-lg kbtn-square', icon: 24 },
  xl: { btn: 'kbtn kbtn-ghost kbtn-xl kbtn-square', icon: 28 },
};

const DEFAULT_ICON = 'menu-2';

// Drive the configured action on the target chrome's controller. If the
// chrome isn't registered yet (e.g., a header trigger that drives a
// per-kapp chrome which hasn't loaded), the click is a no-op — the user
// will retry once the chrome is present.
const dispatchAction = (action, targetId) => {
  const ctrl = chromeGetController(targetId);
  if (!ctrl) return;
  switch (action) {
    case 'toggle':
      ctrl.toggle();
      return;
    case 'show':
    case 'expand':
      ctrl.expand();
      return;
    case 'hide':
      ctrl.hide();
      return;
    case 'rail':
      ctrl.setMode('rail');
      return;
    default:
      // Validation already prevents this; defensive.
      console.warn(`BundleChromeToggle: unknown action "${action}".`);
  }
};

const BundleChromeToggleComponent = forwardRef(({ config }, ref) => {
  const apiRef = useRef({});
  const onClickCapture = useInternalLinkInterceptor();

  const target = config.target;
  const action = ACTIONS.includes(config.action) ? config.action : 'toggle';
  const sizeKey = SIZES.includes(config.size) ? config.size : 'md';
  const sizeSpec = SIZE_CLASSES[sizeKey];

  // Track the target chrome's current mode so we can swap iconByState.
  // Starts at whatever the chrome is currently in (if it's registered);
  // updates via the registry's `change` event afterwards.
  const [chromeMode, setChromeMode] = useState(() => {
    const ctrl = target ? chromeGetController(target) : null;
    return ctrl ? ctrl.getMode() : null;
  });

  useEffect(() => {
    if (!target) return;
    // Re-read in case the chrome registered between the initial state read
    // and this effect's run (rare but possible during fast mounts).
    const ctrl = chromeGetController(target);
    if (ctrl) setChromeMode(ctrl.getMode());

    const onChange = ({ mode }) => setChromeMode(mode);
    const onDestroy = () => setChromeMode(null);
    chromeOn(target, 'change', onChange);
    chromeOn(target, 'destroy', onDestroy);
    return () => {
      chromeOff(target, 'change', onChange);
      chromeOff(target, 'destroy', onDestroy);
    };
  }, [target]);

  const iconByState = config.iconByState;
  const stateIcon =
    iconByState && chromeMode && iconByState[chromeMode]
      ? iconByState[chromeMode]
      : null;
  const icon = stateIcon || config.icon || DEFAULT_ICON;

  const ariaLabel = config.ariaLabel || 'Toggle navigation';

  const handleClick = () => {
    if (!target) {
      console.warn(
        'BundleChromeToggle: no target configured; click is a no-op.',
      );
      return;
    }
    dispatchAction(action, target);
  };

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={apiRef.current}>
        <div onClickCapture={onClickCapture} className="flex-initial">
          <button
            type="button"
            onClick={handleClick}
            aria-label={ariaLabel}
            data-toggle-target={target}
            className={clsx(sizeSpec.btn, config.className)}
          >
            <Icon name={icon} size={sizeSpec.icon} />
          </button>
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (typeof config.target !== 'string' || config.target.length === 0) {
    console.error(
      'BundleChromeToggle Widget Error: target is required and must be a non-empty string (the BundleChrome id to drive).',
    );
    return false;
  }
  if (config.action != null && !ACTIONS.includes(config.action)) {
    console.error(
      `BundleChromeToggle Widget Error: action must be one of ${ACTIONS.join(', ')}.`,
    );
    return false;
  }
  if (config.icon != null && typeof config.icon !== 'string') {
    console.error('BundleChromeToggle Widget Error: icon must be a string.');
    return false;
  }
  if (config.iconByState != null) {
    if (
      typeof config.iconByState !== 'object' ||
      Array.isArray(config.iconByState)
    ) {
      console.error(
        'BundleChromeToggle Widget Error: iconByState must be a plain object.',
      );
      return false;
    }
    for (const [key, value] of Object.entries(config.iconByState)) {
      if (!CHROME_MODES.includes(key)) {
        console.error(
          `BundleChromeToggle Widget Error: iconByState keys must be chrome modes (${CHROME_MODES.join(', ')}); got "${key}".`,
        );
        return false;
      }
      if (typeof value !== 'string') {
        console.error(
          `BundleChromeToggle Widget Error: iconByState["${key}"] must be a string icon name.`,
        );
        return false;
      }
    }
  }
  if (config.size != null && !SIZES.includes(config.size)) {
    console.error(
      `BundleChromeToggle Widget Error: size must be one of ${SIZES.join(', ')}.`,
    );
    return false;
  }
  if (config.ariaLabel != null && typeof config.ariaLabel !== 'string') {
    console.error(
      'BundleChromeToggle Widget Error: ariaLabel must be a string.',
    );
    return false;
  }
  if (config.className != null && typeof config.className !== 'string') {
    console.error(
      'BundleChromeToggle Widget Error: className must be a string.',
    );
    return false;
  }
  return true;
};

/**
 * Initializes a BundleChromeToggle widget instance — an icon button that
 * triggers a configured action on a named BundleChrome.
 *
 * See BUNDLE_CHROME_TOGGLE.md for the full spec.
 *
 * Minimal usage (drive the kapp-level vertical chrome with a hamburger):
 *   bundle.widgets.BundleChromeToggle({
 *     container: K('content[Hamburger]').element(),
 *     id: 'kapp-toggle',
 *     config: {
 *       target: 'kapp',
 *       action: 'toggle',
 *     },
 *   });
 *
 * Toggle that swaps icon based on chrome state:
 *   bundle.widgets.BundleChromeToggle({
 *     container: K('content[Hamburger]').element(),
 *     id: 'header-toggle',
 *     config: {
 *       target: 'kapp',
 *       action: 'toggle',
 *       iconByState: {
 *         expanded: 'x',
 *         rail:     'menu-2',
 *         hidden:   'menu-2',
 *       },
 *     },
 *   });
 *
 * Subscriptions are queued — if the toggle mounts before the target chrome
 * registers, it'll bind as soon as the chrome appears. This is what allows
 * a header-mounted toggle to drive a per-kapp chrome that loads later.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} config Configuration object.
 * @param {string} config.target Required. The BundleChrome id to drive.
 * @param {string} [config.action] One of 'toggle' (default) | 'show' |
 *   'hide' | 'rail' | 'expand'. If the action targets a state not allowed
 *   by the chrome's `modes`, the chrome logs a warning and ignores it.
 * @param {string} [config.icon] Tabler icon name. Default 'menu-2'.
 * @param {Object} [config.iconByState] Optional map of chrome mode →
 *   icon name. When the target chrome is in a known state and the map
 *   has an entry for it, that icon wins. Falls back to `icon`.
 * @param {string} [config.size] 'sm' | 'md' (default) | 'lg' | 'xl'.
 * @param {string} [config.ariaLabel] Accessibility label. Default 'Toggle navigation'.
 * @param {string} [config.className] Override the default ghost-button styling.
 * @param {string} [id] Optional id used by registerWidget for instance tracking.
 */
export const BundleChromeToggle = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleChromeToggle');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleChromeToggle, {
      container: resolved,
      Component: BundleChromeToggleComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleChromeToggle widget parameters are invalid. See the console for more details.',
  );
};
