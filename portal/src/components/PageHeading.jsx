import { useCallback } from 'react';
import clsx from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../atoms/Icon.jsx';
import { useSelector } from 'react-redux';
import {
  RENDER_MODE_CONTAINER,
  RENDER_MODE_MODAL,
  useContainerHistory,
  useRenderMode,
} from '../helpers/container-scope.js';

/**
 * Page-level heading rendered above route content. Render mode (set by the
 * mount boundary — top-level page, BundleContainer, or modal) decides what
 * the back affordance does:
 *
 *   page (default):
 *     Renders a Link to `location.state.backPath` (highest priority) or the
 *     `backTo` prop. If both are absent and `backAction` is provided, renders
 *     a button that fires the callback. Otherwise no back element.
 *
 *   container:
 *     Same `location.state.backPath` precedence, but the literal `backTo`
 *     prop is intentionally ignored — top-level paths like "/" or "/kapps"
 *     would escape the container's MemoryRouter, which is not what callers
 *     mean inside a container. Falls back to `navigate(-1)` (guarded by
 *     `location.key !== 'default'`) so the back button behaves like browser
 *     back within the container's own history; hides itself when there is
 *     no prior history to pop. An explicit `backAction` from the caller
 *     still wins over the auto fallback.
 *
 *   modal:
 *     The host modal already provides title/close chrome, so this component
 *     renders nothing at all in modal context.
 */
export const PageHeading = ({
  title,
  before,
  after,
  backTo = './..',
  backAction,
  className,
  children,
}) => {
  const mobile = useSelector(state => state.view.mobile);
  const location = useLocation();
  const navigate = useNavigate();
  const renderMode = useRenderMode();
  const containerHistory = useContainerHistory();
  const goBack = useCallback(() => navigate(-1), [navigate]);

  if (renderMode === RENDER_MODE_MODAL) return null;

  const explicitBackPath = location.state?.backPath;

  // Resolve the back affordance into either a path (Link) or a callback
  // (button), in priority order. Container mode swaps the literal backTo
  // for navigate(-1) unless the caller has been more explicit.
  let backLinkPath = null;
  let backCallback = null;
  if (explicitBackPath) {
    backLinkPath = explicitBackPath;
  } else if (renderMode === RENDER_MODE_CONTAINER) {
    if (typeof backAction === 'function') {
      backCallback = backAction;
    } else if (containerHistory?.canGoBack) {
      backCallback = goBack;
    }
  } else if (backTo) {
    backLinkPath = backTo;
  } else if (typeof backAction === 'function') {
    backCallback = backAction;
  }

  const showBackLink = !mobile && backLinkPath;
  const showBackButton = !mobile && backCallback;

  return (
    <div className={clsx('relative flex-sc gap-3 mb-6', className)}>
      {showBackLink && (
        <Link
          className="kbtn kbtn-ghost kbtn-lg kbtn-circle"
          to={backLinkPath}
          aria-label="Back"
        >
          <Icon name="arrow-left" />
        </Link>
      )}
      {showBackButton && (
        <button
          type="button"
          className="kbtn kbtn-ghost kbtn-lg kbtn-circle"
          onClick={backCallback}
          aria-label="Back"
        >
          <Icon name="arrow-left" />
        </button>
      )}
      {before}
      <span className="text-lg md:text-xl font-semibold">{title}</span>
      {after}
      {children}
    </div>
  );
};
