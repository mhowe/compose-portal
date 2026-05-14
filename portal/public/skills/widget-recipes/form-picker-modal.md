---
name: form-picker-modal
description: One strategy for "pick a form from a list" UIs (categories browser, search-style picker, "choose what to open next"). A reusable presentation-only form rendered in a modal, parameterized by URL query params, dispatches a single window CustomEvent when the user picks. The caller listens and decides what to do — swap an inline container, close the modal and navigate, open another modal, anything. Decouples the picker from the consumer. Not the only way to do this; alternative patterns are listed at the bottom.
---

# Form Picker via Modal — One Strategy

This is **one** way to build a "pick a form" UI — the kind of thing that opens when a user clicks a "Categories" button, shows them a tree of categories and forms, and lets them choose one. It's not the only way. It's a strategy worth reaching for when the pieces below line up; alternatives are listed at the end.

The underlying mechanics (modals, BundleContainer events, widget events) are documented separately in the widget docs and `CHROME_ACTIONS`. This skill captures the *composition idea* — how those pieces fit together when you don't want every host form to re-invent the picker.

---

## The idea, in one paragraph

A **presentation-only form** in the admin (or service) kapp acts as a reusable picker. Anything that wants a form chosen opens it in a modal, passing context — an event name to dispatch and any scoping data — as URL query parameters. The picker form has **one** event-dispatch site (not one per row): when the user clicks a form in the list, the picker reads its URL-param-driven config and fires a `window` `CustomEvent` with the chosen form's path. The host form listens for that event and decides what comes next. The picker has zero knowledge of where the result will land.

---

## When this strategy fits

Reach for it when **at least two** of these are true:

- **You have multiple host forms** that want a "browse categories and pick a form" experience and you don't want each of them re-implementing the list UI.
- **The destination depends on the host** — one host wants the pick to swap an inline `BundleContainer`, another wants to navigate the outer page, another wants to open the picked form in yet another modal. Hard-coding the destination inside the picker is the wrong factoring.
- **The picker is presentation-only** — it doesn't submit, doesn't mutate, has no workflow of its own. It just renders and emits.
- **You're already inside a form-driven layout** and adding a one-off React component would be heavier than another form.

When **none** of those apply, see [Alternatives](#alternatives) — there are simpler shapes.

---

## The contract

Three pieces of glue, all loose:

1. **The host calls the picker via a modal with URL params.**

   ```js
   // Inside a host form / page widget — e.g. a "Categories" BundleLink:
   target: { type: 'modal', size: 'lg', title: 'Browse' }
   clickAction: {
     type: 'internal',
     path: '/kapps/admin/forms/form-picker?eventName=picker-result&kappSlug=services',
   }
   ```

2. **The picker form reads its URL params** (Kinetic auto-populates fields from query string), uses them to scope its data, and dispatches a single event from one handler when a form is picked.

   ```js
   // Picker form — on load, after the form list has rendered:
   const eventName = K('field[Event Name]').value();
   const kappSlug  = K('field[Kapp Slug]').value();

   const onPick = form =>
     window.dispatchEvent(new CustomEvent(eventName, {
       detail: { config: { path: `/kapps/${kappSlug}/forms/${form.slug}` } },
     }));

   // Wire onPick once into whatever renders the list — Table widget's
   // row-click hook, hand-rolled HTML, etc. No per-row widgets needed.
   ```

   The `detail.config.path` shape matches what chrome widgets emit for `clickAction: 'event'`, so the host's handler doesn't care whether the picker or a widget dispatched.

3. **The host listens and decides what to do.**

   ```js
   // Host form, on load:
   bundle.utils.onWidgetEvent('picker-result', e => {
     // ...the host's decision — see "Three flows" below.
   });
   ```

That's the entire contract. The picker knows nothing about modals, containers, or the outer router. The host knows nothing about how the picker renders its list.

---

## Three flows the host can implement

The same picker form serves all three. Only the host's handler differs.

| Flow | Host handler |
|---|---|
| **Swap an inline container** (modal stays open is not the goal here — this is for *no* modal at all, picker rendered inline in a sidebar container) | `bundle.widgets.BundleContainer.get('main').navigate(e.detail.config.path);` |
| **Close modal, swap an inline container** | `bundle.utils.closeModal(); bundle.widgets.BundleContainer.get('main').navigate(e.detail.config.path);` |
| **Close modal, navigate the outer page** | `bundle.utils.closeModal(); window.location.hash = `#${e.detail.config.path}`;` |

Want the modal to stay open and the picked form to render *inside the modal*? That's a different shape — see the "Modal-internal swap" variation below.

---

## Variations

- **Modal-internal swap.** If the goal is "picked form replaces the picker inside the same modal," the picker form mounts its own `BundleContainer` (call it `id: 'picker-inner'`) and renders the list of forms with `target: { type: 'container', id: 'picker-inner' }`. Picked form loads inside, modal stays. Title doesn't change (no API to update modal title post-open), so use a generic title or render your own header inside the picker with `Form Chrome: bare`.
- **Pass a cancel event too.** Add `cancelEventName` URL param so the picker can emit a "user backed out" event if it has its own back/cancel UI. Hosts that don't care just don't register a handler.
- **Scope the picker.** URL params can carry filters — `?kappSlug=services&category=hardware&onlyType=Service`. Picker reads them and queries accordingly.
- **Record the pick on the picker form.** If you want a visible "You picked X" or you want the pick auditable, set a field on the picker form (`Selected Form Path`) at click time before dispatching. Optional — the dispatch already carries the path.
- **Multiple pickers per page.** Pass distinct `eventName`s per instance (`picker-result-${hostId}`) so two hosts on the same page don't cross-talk. `onWidgetEvent` dedupes by name, so re-mounting is safe in either case.

---

## Why this composes well

- **The picker is stateless from the host's perspective.** It takes inputs as URL params, produces output as one event. Easy to test, easy to swap implementations (a different picker form can plug in under the same event contract).
- **`onWidgetEvent` is a single deduped handler per name.** Host forms can re-register on every load without stacking listeners.
- **Modals stack rather than replace.** A picker opened from inside another modal layers cleanly — no special-casing needed.
- **The picker doesn't need to know about containers or outer routes.** That decoupling is what makes the same picker work across all the flow shapes in the table above.

---

## Trade-offs

- **No declarative `target` shape covers "close modal + do X."** Flows that close the modal need form JS on the host. If the host is itself a form designer who isn't comfortable writing JS, this strategy is the wrong tool — point them at a BundleLink-per-row design where the modal stays open and `target: { type: 'container' }` does the swap declaratively.
- **Event names are global.** Two hosts that register the same event name on the same page will both fire on the same dispatch. Either scope by instance id (variation above) or accept the broadcast as a feature.
- **`detail.config.path` is a hand-shake string, not a typed object.** Treat it as a contract and document it where the picker form lives. If the contract changes (e.g., adding a `submissionId` for resume-existing flows), every host's handler needs updating.

---

## Alternatives

This strategy is a hammer; not every nail. Common alternatives:

- **Just use the built-in `openSearch` modal** if "search forms across the configured Service Portal kapp" is the whole requirement and the modal closing + outer-page navigation is the only flow you need. No custom picker form to maintain.
- **Per-row `BundleLink`s with `target: { type: 'container', id }`** when the modal-stays-open + swap-inside-modal flow is the only one you need. Fully declarative, no form JS.
- **A direct `Table` widget on the host form** when the form list is small enough to live in the host's layout — no modal, no event dispatch, just a row-click handler in the host.
- **A custom React component** when the picker UX is rich enough (drag-reorder, multi-select, virtualized lists) that a Kinetic form would fight you. Forms are the right hammer when they're the right hammer.

If the AI Builder Assistant is asked to build a "pick a form" UI and more than one of these alternatives also fits, surface them and let the user choose. Don't default to this strategy just because it's the most general.

---

## Related

- `landing-pages` skill — covers how a kapp's home form (potentially the host that calls this picker) is wired up.
- `BundleContainer` widget doc — the in-modal swap variation and the cross-page-container flows both depend on it.
- `CHROME_ACTIONS` widget doc — `clickAction`/`target` shapes and the `event` dispatch payload.
- `BundleLink` widget doc — what each row of the form list looks like when you opt for the per-row variation.
