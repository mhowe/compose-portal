import { createContext, useContext } from 'react';

// Render mode signals where a bundle page is mounted.
//
//   'page'      — top-level route inside the app's HashRouter. Pages own the
//                 outer chrome (header/footer) and any in-page chrome they
//                 render (PageHeading etc.).
//   'container' — mounted inside a BundleContainer widget. The container has
//                 its own MemoryRouter, so navigation is local; pages should
//                 prefer in-router back navigation over hard-coded paths that
//                 would escape the container, and should not mutate global
//                 chrome state since chrome is owned by the host page.
//   'modal'     — mounted inside a BundleContainer that's hosted by the
//                 global modal stack. The modal already provides title/close
//                 chrome, so pages should suppress their own heading chrome.
//
// Components consume the value via `useRenderMode()`. `useInsideContainer()`
// is preserved as a backward-compat shorthand for the common "anything but
// page" check.
export const RENDER_MODE_PAGE = 'page';
export const RENDER_MODE_CONTAINER = 'container';
export const RENDER_MODE_MODAL = 'modal';

export const RenderModeContext = createContext(RENDER_MODE_PAGE);

// Legacy alias kept so existing imports continue to work. New code should
// prefer RenderModeContext directly so the tri-state value is explicit.
export const ContainerScopeContext = RenderModeContext;

export const useRenderMode = () => useContext(RenderModeContext);

export const useInsideContainer = () =>
  useContext(RenderModeContext) !== RENDER_MODE_PAGE;

// Container history information, provided by BundleContainer for the pages
// rendered inside it. `canGoBack` is true when there is a prior history
// entry within the container's MemoryRouter that navigate(-1) would land on
// — i.e. when the current entry isn't the floor of meaningful history. The
// container computes this by tracking the location.key of the first non-
// blank entry and comparing it to the current location.key.
//
// Outside any container the context returns its default of `null`, which
// callers can treat as "this signal is not available — fall back to no
// in-router back."
export const ContainerHistoryContext = createContext(null);

export const useContainerHistory = () => useContext(ContainerHistoryContext);
