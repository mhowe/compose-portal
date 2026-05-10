import { forwardRef, useEffect, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import clsx from 'clsx';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';
import { store } from '../../../redux.js';

// Canonical four-size set, shared with Logo and Link. Kavatar's default
// (no modifier) corresponds to 'md'.
const SIZE_CLASSES = {
  sm: 'kavatar-sm',
  md: '',
  lg: 'kavatar-lg',
  xl: 'kavatar-xl',
};
const SIZE_KEYS = Object.keys(SIZE_CLASSES);

const COLOR_CLASSES = {
  primary: 'kavatar-primary',
  neutral: 'kavatar-neutral',
};
const COLOR_KEYS = Object.keys(COLOR_CLASSES);

/**
 * Plain React component that renders a configurable avatar — image (when
 * `imageSrc` provided and loads successfully) or initial-letter placeholder.
 * Exported so future composite widgets (e.g. BundleAvatarStack) can render N
 * avatars inside a single React root rather than mounting N widget roots.
 *
 * Caller is responsible for putting this inside a `<Provider>` (chrome
 * widgets do that around the whole tree) and inside a div with the
 * `useInternalLinkInterceptor` onClickCapture handler so internal links
 * navigate the top-level app correctly.
 */
export const BundleAvatarContent = ({ id, config = {}, mode = 'expanded' }) => {
  const {
    username: configUsername,
    imageSrc,
    size,
    railSize,
    color,
    clickAction,
    target,
    label,
    className,
  } = config;

  // Username defaults to the logged-in user. useSelector works because the
  // widget tree wraps with <Provider store={store}>.
  const profileUsername = useSelector(s => s.app?.profile?.username);
  const username = configUsername ?? profileUsername ?? '';

  // Image fallback — if the image fails to load, drop back to the
  // placeholder rather than showing the broken-image icon.
  const [imageOk, setImageOk] = useState(!!imageSrc);
  useEffect(() => {
    setImageOk(!!imageSrc);
  }, [imageSrc]);
  const showImage = !!imageSrc && imageOk;

  const firstLetter = (username || '').slice(0, 1).toUpperCase();

  const isInteractive = clickAction && clickAction.type !== 'none';
  // In rail mode, use railSize (default 'sm') so the avatar fits the rail
  // strip without spilling over.
  const effectiveSize =
    mode === 'rail' ? (railSize ?? 'sm') : size;
  const sizeKey = SIZE_KEYS.includes(effectiveSize) ? effectiveSize : 'md';
  const sizeClass = SIZE_CLASSES[sizeKey];
  const colorClass = COLOR_KEYS.includes(color) ? COLOR_CLASSES[color] : '';

  // Designer-supplied className wins fully — same convention as Link/Logo.
  // Color via `color` config and color via className both target the same
  // CSS variables, so designers should pick one path per usage.
  const computedClass = clsx(
    'kavatar',
    !showImage && 'kavatar-placeholder',
    isInteractive && 'kavatar-actionable',
    colorClass,
    sizeClass,
  );
  const finalClass = className ?? computedClass;

  return (
    <ClickActionWrapper
      clickAction={clickAction}
      target={target}
      label={label || username || undefined}
      widgetName="BundleAvatar"
      instanceId={id}
      className={finalClass}
    >
      {showImage ? (
        <img
          src={imageSrc}
          alt=""
          onError={() => setImageOk(false)}
        />
      ) : (
        <div>{firstLetter}</div>
      )}
    </ClickActionWrapper>
  );
};

const BundleAvatarComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});
  const onClickCapture = useInternalLinkInterceptor();
  const [mode, setMode] = useState('expanded');

  api.current.setMode = setMode;
  api.current.tooltip = config.tooltip ?? config.label ?? config.username;

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <div onClickCapture={onClickCapture} className="flex-initial">
          <BundleAvatarContent id={id} config={config} mode={mode} />
        </div>
      </WidgetAPI>
    </Provider>
  );
});

const validateConfig = (config = {}) => {
  if (config.username != null && typeof config.username !== 'string') {
    console.error('BundleAvatar Widget Error: username must be a string.');
    return false;
  }
  if (config.imageSrc != null && typeof config.imageSrc !== 'string') {
    console.error(
      'BundleAvatar Widget Error: imageSrc must be a string URL.',
    );
    return false;
  }
  if (config.size != null && !SIZE_KEYS.includes(config.size)) {
    console.error(
      `BundleAvatar Widget Error: size must be one of ${SIZE_KEYS.join(', ')}.`,
    );
    return false;
  }
  if (config.railSize != null && !SIZE_KEYS.includes(config.railSize)) {
    console.error(
      `BundleAvatar Widget Error: railSize must be one of ${SIZE_KEYS.join(', ')}.`,
    );
    return false;
  }
  if (config.tooltip != null && typeof config.tooltip !== 'string') {
    console.error('BundleAvatar Widget Error: tooltip must be a string.');
    return false;
  }
  if (config.color != null && !COLOR_KEYS.includes(config.color)) {
    console.error(
      `BundleAvatar Widget Error: color must be one of ${COLOR_KEYS.join(', ')}.`,
    );
    return false;
  }
  if (!validateTarget(config.target, 'BundleAvatar')) return false;
  if (config.label != null && typeof config.label !== 'string') {
    console.error('BundleAvatar Widget Error: label must be a string.');
    return false;
  }
  if (config.className != null && typeof config.className !== 'string') {
    console.error('BundleAvatar Widget Error: className must be a string.');
    return false;
  }
  if (!validateClickAction(config.clickAction, 'BundleAvatar')) return false;
  return true;
};

/**
 * Initializes a BundleAvatar widget instance.
 *
 * Usage from a Kinetic form's bundle script — minimal (renders the
 * logged-in user's initial-letter avatar, non-interactive):
 *   bundle.widgets.BundleAvatar({
 *     container: K('content[Avatar]').element(),
 *     id: 'avatar',
 *   });
 *
 * Header-style avatar (current user, click navigates to profile):
 *   bundle.widgets.BundleAvatar({
 *     container: K('content[Avatar]').element(),
 *     config: {
 *       size: 'lg',
 *       clickAction: { type: 'internal', path: '/profile' },
 *     },
 *     id: 'avatar',
 *   });
 *
 * Specific user with an image (form-side resolves the URL ahead of time):
 *   bundle.widgets.BundleAvatar({
 *     container: K('content[Assignee]').element(),
 *     config: {
 *       username: 'jdoe',
 *       imageSrc: `${profileImageUrl('jdoe')}`,
 *       size: 'sm',
 *       label: 'Jane Doe',
 *     },
 *     id: 'assignee',
 *   });
 *
 * clickAction shape (shared with Logo / Link):
 *   { type: 'none' }                              ← non-interactive
 *   { type: 'home' }                              ← runs landing resolver
 *   { type: 'internal', path: '/kapps/services' } ← top-level path
 *   { type: 'external', url: 'https://...' }      ← external URL
 *   { type: 'event', name: 'avatar-clicked' }     ← CustomEvent
 *
 * For `type: 'event'`, listen with `bundle.utils.onWidgetEvent(name, handler)`.
 *
 * **Color caveat:** when you set both `config.color` and a `className` that
 * also affects color, results are not predictable — both target the same
 * CSS variables and which wins depends on Tailwind/DaisyUI source order, not
 * the className argument order. Pick one path per usage.
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM element
 *   or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] All fields optional.
 * @param {string} [config.username] Username displayed (and used for the
 *   initial-letter fallback). Defaults to the logged-in user when not
 *   provided.
 * @param {string} [config.imageSrc] Image URL. When provided and loads
 *   successfully, displays the image instead of the initial letter. On
 *   load failure, falls back to the placeholder. For dynamic sources
 *   (gravatar, profile attribute, image library), resolve form-side and
 *   pass the URL string here.
 * @param {string} [config.size] 'sm' | 'md' (default) | 'lg' | 'xl'. Same
 *   four-size set as other chrome widgets.
 * @param {string} [config.color] 'primary' | 'neutral'. Optional — leaving
 *   it undefined lets a `className`-supplied color apply without conflict.
 * @param {Object} [config.clickAction] Discriminated by `type`. See above.
 *   Default `{ type: 'none' }`.
 * @param {string|Object} [config.target] 'current' (default), 'new', 'modal',
 *   or `{ type: 'container', id, replace? }` to render inline inside a named
 *   BundleContainer. Modal object form: `{ type: 'modal', size, title, closeOn }`
 *   (size sm|md|lg|xl|full, closeOn any subset of ['esc','backdrop','button']).
 *   See CHROME_ACTIONS.md for full details.
 * @param {string} [config.label] Accessibility label override. Auto-derived
 *   from `username` when not provided.
 * @param {string} [config.className] Override the default kavatar styling.
 *   Use DaisyUI semantic classes, not raw Tailwind utility chains.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const BundleAvatar = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'BundleAvatar');
  if (resolved && validateConfig(config)) {
    return registerWidget(BundleAvatar, {
      container: resolved,
      Component: BundleAvatarComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The BundleAvatar widget parameters are invalid. See the console for more details.',
  );
};
