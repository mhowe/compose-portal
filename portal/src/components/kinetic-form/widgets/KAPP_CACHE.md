[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Kapp Cache

The compose-portal bundle loads every kapp the user can see — with full attribute, category, and categorization detail — in a single space fetch at app start, then keeps that data in a Redux cache keyed by slug. Widgets and forms read from the cache instead of issuing their own fetches, so a page with several kapp-aware widgets makes one round trip instead of many. This document describes the refresh API exposed on `window.bundle` for keeping that cache in sync with the server.

```js
// Refresh a single kapp's cache entry.
bundle.refreshKapp('services');

// Refresh every kapp by re-running the bulk space fetch.
bundle.refreshKapps();

// Refresh the per-kapp forms list (metadata only — pages/elements/layout are
// never cached). Populated lazily on Forms widget mount; this helper forces
// a re-fetch after a known mutation.
bundle.refreshKappForms('services');
```

### How the cache is loaded

App.jsx fetches the space with a nested include that pulls each kapp's `attributesMap`, `kappAttributeDefinitions`, `categoryAttributeDefinitions`, `formAttributeDefinitions`, `categories`, `categories.attributesMap`, and `categorizations`. The `setSpace` reducer atomically writes every returned kapp into `state.app.kappCache` keyed by slug — so the cache is populated the same moment the space record is.

Widgets that need kapp data read from the cache, never from the network. The Categories widget, for example, does `useSelector(selectKappBySlug(slug))` against the cache; it never issues its own `fetchKapp`.

### Per-container scope

A widget rendered inside a `BundleContainer` usually wants to observe **that container's** current kapp, not the outer browser URL's kapp. The `useKappContext` hook gives every widget that "auto" scoping for free.

How it works:

- Every `BundleContainer` marks its root DOM element with a `data-bundle-container-slot="<slotPath>"` attribute. The slotPath is auto-derived from mount position (collision-free across nested containers).
- The container publishes its current kapp slug — parsed from its inner `MemoryRouter` path — to `state.containers[slotPath].kappSlug`. Published synchronously at registration (so first-render widgets see the right scope) and updated on every inner navigation.
- A widget calling `useKappContext()` walks DOM ancestry from its own host element, finds the nearest `[data-bundle-container-slot]`, and reads `state.containers[slotPath].kappSlug`. When no enclosing container is found, it falls through to `state.app.kappSlug`.
- When a container unmounts, its entry is removed from `state.containers`.

For widget authors using `useKappContext`, the three modes are:

```js
// Default — inside a container? use its kapp. Outside? use global.
useKappContext({ kappSlug: 'auto' });

// Always read the outer URL's kapp, even inside a container.
useKappContext({ kappSlug: 'global' });

// Pin to a specific kapp regardless of scope.
useKappContext({ kappSlug: 'services' });
```

Returns `{ kapp, slug, slotPath }`:

- `kapp` — the cached record (or `null` if the slug isn't in cache yet)
- `slug` — the resolved slug being observed
- `slotPath` — the nearest container's slotPath, or `null` if none

The hook depends on `BundleWidgetContext`, which `registerWidget` automatically wraps around every widget tree. Form-side authors don't need to think about it — widgets that adopt `useKappContext` just work.

### When to call refresh

You should call a refresh helper when the cache is known to be stale:

- After a form save that updated a kapp attribute (`Display - Hidden`, `Theme`, a category, etc.).
- After an integration that mutated kapps server-side.
- After an admin tool added or removed kapps.
- On user demand from a "reload" button.

You should NOT call refresh:

- Routinely (e.g. on every form submit, in an interval timer) — the cache is good for the session unless someone outside the page changed something.
- Just to "be sure" — a stale value is much rarer than the cost of a refetch.

### `bundle.refreshKapp(slug)`

Re-fetches one kapp and overwrites that single entry in the cache. Other kapps are untouched. Resolves with the @kineticdata/react response so callers can detect errors.

```js
const { kapp, error } = await bundle.refreshKapp('services');
if (error) {
  console.error('Refresh failed:', error);
} else {
  // Cache is now up to date — widgets reading 'services' will re-render
  // with the fresh data on their next paint.
}
```

On error, the existing cache entry is preserved — the call fails open, not destructive.

### `bundle.refreshKapps()`

Re-runs the same bulk space fetch App.jsx uses at startup. Replaces every kapp in the cache. Use this when you don't know which kapp changed, or after a structural change (a kapp added or removed).

```js
const { space, error } = await bundle.refreshKapps();
```

Heavier than `refreshKapp` — pulls the whole space — but it's the only way to pick up newly added kapps or notice removed ones.

### `bundle.refreshKappForms(slug)`

Re-fetches the form list for one kapp and writes it to `state.app.kappCache[slug].forms`. Used both by the Forms widget on first mount (when the cache slot is undefined) and by callers after a known mutation. Concurrent calls for the same slug coalesce on a single in-flight HTTP request, so two Forms widgets on the page never double-fetch.

```js
const { forms, error } = await bundle.refreshKappForms('services');
```

Stores **metadata only**: each form's `attributesMap` and `categorizations` are included, but `pages`, `elements`, and `layout` are deliberately omitted. The cache exists to power list/card rendering, not form runtime. When a form is actually rendered for submission, the platform fetches its definition on its own; this cache stays focused on what cards need.

On error, the existing cache entry is preserved.

### Examples

#### Refresh after a form save mutated a kapp attribute

```js
K('form').on('submit', async () => {
  await bundle.refreshKapp('services');
  // Any Kapps / Categories widget reading 'services' now sees fresh data.
});
```

#### "Reload" button on a kapp picker

```js
bundle.widgets.BundleLink({
  container: K('content[Reload]').element(),
  config: {
    icon: 'refresh',
    label: 'Reload',
    clickAction: {
      type: 'event',
      name: 'kapp-cache-reload',
    },
  },
});

window.addEventListener('kapp-cache-reload', () => {
  bundle.refreshKapps();
});
```

#### Refresh then read

If you need to act on the refreshed data immediately, await the helper — the cache is updated synchronously when the promise resolves.

```js
await bundle.refreshKapp('services');
// Read from cache here (e.g. via a widget API or by re-rendering a widget
// that subscribes to the cache).
```

### Notes

- **One-way data flow.** Refresh helpers always go through `appActions.setKapp` / `appActions.setSpace` so any other widget subscribed to the cache re-renders automatically. There is no manual "tell the widget to refresh" — write the data, the widget sees it.
- **No backoff or coalescing.** Two parallel `refreshKapp('services')` calls issue two HTTP requests and write twice. Coalesce on the caller side if it matters.
- **Errors are non-destructive.** A failed refresh leaves the previous cache entry in place. Callers can inspect `response.error` and decide whether to retry or surface a toast.
- **Per-kapp permission still applies.** If the current user can't see a kapp, the bulk fetch won't return it, and `refreshKapp('that-slug')` will get an error or empty response. No special handling — same as today's `fetchKapp` would return.
- **No automatic polling.** A future enhancement could add a TTL or periodic refresh; for now, refreshes are caller-driven only.
