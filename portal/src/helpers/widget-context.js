import { createContext, useContext, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectKappBySlug } from './state.js';

/* ------------------------------------------------------------------ */
/* BundleWidgetContext                                                */
/*                                                                    */
/* Every widget rendered through `registerWidget` is wrapped in this  */
/* provider so anything inside the widget tree can discover its DOM   */
/* container element and its registered id. The container element is  */
/* the bridge between the host page's DOM and the widget's React tree */
/* (which mounts inside its own createRoot, so React context from the */
/* host doesn't reach it — but DOM ancestry is shared).               */
/*                                                                    */
/* Use cases:                                                         */
/*   - Walking DOM ancestry to find a host BundleContainer            */
/*   - Reading `data-*` attributes set by the host                    */
/*   - Surfacing the widget's id when dispatching events              */
/* ------------------------------------------------------------------ */

export const BundleWidgetContext = createContext(null);

/**
 * Returns the widget's runtime metadata: `{ container, id }`.
 *
 *   - `container` is the host DOM element this widget instance was rendered
 *     into (the value resolved from the original `container` arg).
 *   - `id` is the widget instance id (may be undefined for anonymous mounts).
 *
 * Outside a widget tree (e.g. inside main app routes that don't go through
 * `registerWidget`), this returns `null`. Always null-check before using.
 */
export const useBundleWidget = () => useContext(BundleWidgetContext);

/* ------------------------------------------------------------------ */
/* useKappContext — resolve "which kapp am I observing"               */
/*                                                                    */
/* Three modes via the `kappSlug` field:                              */
/*   'auto'       (default) — DOM-walk up from the widget's container */
/*                 to find the nearest BundleContainer. If found, use */
/*                 its published kapp slug. If not found, fall back   */
/*                 to the global state.app.kappSlug (URL-driven).     */
/*   'global'    — always read the global slug regardless of any     */
/*                 enclosing container.                               */
/*   <slug>      — pin to a specific slug. Use when a widget should  */
/*                 render a known kapp regardless of where it lives.  */
/*                                                                    */
/* Returns: { kapp, slug, slotPath }                                  */
/*   - kapp: the cached kapp record (or null if not in cache yet)     */
/*   - slug: the resolved slug being observed                         */
/*   - slotPath: the nearest container's slotPath, or null            */
/* ------------------------------------------------------------------ */

const SLOT_DATA_ATTR = 'data-bundle-container-slot';

export const useKappContext = ({ kappSlug = 'auto' } = {}) => {
  const widget = useBundleWidget();
  const globalSlug = useSelector(s => s.app.kappSlug);

  // Walk DOM ancestry once for the widget's lifetime. The container element
  // doesn't move in the DOM after mount, so this is stable; if the widget is
  // re-mounted in a different position, the hook re-runs and we re-resolve.
  const slotPath = useMemo(() => {
    if (!widget?.container) return null;
    const ancestor = widget.container.closest?.(`[${SLOT_DATA_ATTR}]`);
    return ancestor?.getAttribute(SLOT_DATA_ATTR) || null;
  }, [widget?.container]);

  const containerSlug = useSelector(s =>
    slotPath ? (s.containers?.[slotPath]?.kappSlug ?? null) : null,
  );

  // Resolve which slug to observe. `kappSlug` other than 'auto' / 'global'
  // is treated as an explicit slug to pin to.
  let resolved;
  if (
    typeof kappSlug === 'string' &&
    kappSlug !== 'auto' &&
    kappSlug !== 'global'
  ) {
    resolved = kappSlug;
  } else if (kappSlug === 'global') {
    resolved = globalSlug;
  } else {
    // 'auto' — if there's an enclosing container, use its scope (even when
    // null, meaning the container is on a non-kapp path). If not, fall
    // through to global.
    resolved = slotPath ? containerSlug : globalSlug;
  }

  const kapp = useSelector(selectKappBySlug(resolved));
  return { kapp, slug: resolved, slotPath };
};
