import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Modal } from '../../atoms/Modal.jsx';
import { modalActions } from '../../helpers/state.js';
import { fireAndClearModalCloseCallback } from '../kinetic-form/widgets/utils.js';

/**
 * Renders the global modal stack. Each entry in `state.modal.stack`
 * produces one `<Modal>`; modals layer on top of each other (stacked) so
 * a modal opened from inside another modal coexists with — rather than
 * replaces — the lower one.
 *
 * Inner content depends on `entry.type`:
 *   - 'internal' → mounts a `BundleContainer` widget pointed at `entry.path`
 *     (inside an isolated React tree, with its own MemoryRouter — so navigation
 *     inside the modal doesn't leak to the top-level URL).
 *   - 'external' → renders an `<iframe>` for the URL. Cross-origin sites that
 *     set `X-Frame-Options: DENY` will appear blank; documented limitation.
 */
export const ModalSlot = () => {
  const stack = useSelector(state => state.modal?.stack || []);
  return (
    <>
      {stack.map(entry => (
        <ModalEntry key={entry.id} entry={entry} />
      ))}
    </>
  );
};

const ModalEntry = ({ entry }) => {
  const close = () => modalActions.remove(entry.id);
  const closeOn = entry.closeOn || ['esc', 'backdrop', 'button'];
  // Fire any registered onClose callback when the entry unmounts. This runs
  // for every close path (esc / backdrop / button / programmatic close /
  // closeAllModals) since all of them eventually drop the entry from the
  // stack, which unmounts this component.
  useEffect(
    () => () => fireAndClearModalCloseCallback(entry.id),
    [entry.id],
  );
  return (
    <Modal
      open={true}
      onOpenChange={({ open }) => !open && close()}
      title={entry.title}
      size={entry.size || 'md'}
      closeOnEscape={closeOn.includes('esc')}
      closeOnInteractOutside={closeOn.includes('backdrop')}
      showCloseButton={closeOn.includes('button')}
    >
      <div slot="body" className="flex-c-st h-full min-h-100">
        {entry.type === 'internal' ? (
          <ModalInternalContent path={entry.path} />
        ) : entry.type === 'external' ? (
          <ModalExternalContent url={entry.url} />
        ) : null}
      </div>
    </Modal>
  );
};

/**
 * Mounts a `BundleContainer` widget into the modal's body via the same
 * `bundle.widgets.BundleContainer(...)` registration that form designers use.
 * Going through the widget machinery (rather than rendering BundleRoutes
 * directly here) keeps the modal's inner routing isolated from the top-level
 * HashRouter — same isolation BundleContainer already provides everywhere
 * else, no special-cased path needed.
 *
 * The widget's `destroy()` (which calls `root.unmount()` on its inner React
 * root) is scheduled asynchronously via setTimeout. React 18 disallows
 * synchronously unmounting one root from inside another root's lifecycle —
 * which is exactly what happens when the modal closes (outer tree unmounts
 * the div, useEffect cleanup runs *during* that unmount, and we'd be tearing
 * down the inner BundleContainer root mid-render). Deferring past the current
 * task drops us out of React's active cycle.
 */
const ModalInternalContent = ({ path }) => {
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let widgetApi = null;
    let cancelled = false;

    // The widget's MutationObserver also tries to clean up when the DOM
    // container is removed, and races with this explicit destroy. Use the
    // `destroyed` flag (set by registerWidget after unmount) to no-op
    // gracefully whichever path arrives second. Re-check at fire time
    // because the flag flips between scheduling and firing.
    const deferredDestroy = api => {
      if (!api || api.destroyed) return;
      setTimeout(() => {
        if (api.destroyed || typeof api.destroy !== 'function') return;
        api.destroy();
      }, 0);
    };

    // Lazy import to avoid a hard cycle: chrome-utils imports from utils,
    // which is loaded with widgets, which registers BundleContainer.
    import(
      '../kinetic-form/widgets/bundle-container.jsx'
    ).then(({ BundleContainer }) => {
      if (cancelled) return;
      Promise.resolve(
        BundleContainer({
          container: el,
          config: {
            id: `modal-${Math.random().toString(36).slice(2, 8)}`,
            initialPath: path,
            urlSync: false,
            renderMode: 'modal',
          },
        }),
      ).then(api => {
        if (cancelled) {
          deferredDestroy(api);
        } else {
          widgetApi = api;
        }
      });
    });

    return () => {
      cancelled = true;
      const api = widgetApi;
      widgetApi = null;
      deferredDestroy(api);
    };
  }, [path]);
  return <div ref={containerRef} className="flex-auto w-full" />;
};

const ModalExternalContent = ({ url }) => (
  <iframe
    src={url}
    className="w-full h-full min-h-100 border-0"
    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    title="Embedded content"
  />
);
