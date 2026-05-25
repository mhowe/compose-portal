[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Teams Widget

`Teams` renders a breadcrumb-driven browser for Kinetic teams. The user starts at either all top-level teams or the children of a configured `parentName` prefix, descends into teams by clicking rows (each descent extends the breadcrumb), and can create, rename, describe, and delete teams subject to the platform's security policies. Selection — the deepest segment of the breadcrumb — is published to redux at `state.widgets.teamSelection[id]` so sibling widgets (TeamMembers, future `Attributes` `target: 'current'` for `type: 'team'`) can follow without designer wiring beyond a matching `teamsWidgetId` config.

```js
// Initialize the Teams widget
bundle.widgets.Teams({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Teams.get(id);
```

### Scope

The widget renders three stacked sections: a breadcrumb row, a header for the currently-focused team (or a label like "Top-level teams" when nothing is selected) with edit and delete affordances, and a list of the focused team's direct children. Mutations (create, rename, describe, delete) are gated by the Kinetic platform's security policies; when a request returns a 403, the policy's denial message is surfaced as a toast verbatim so users learn *which* policy denied the action.

What this widget does **not** do:

- Edit team attributes — pair with an `Attributes` widget configured for `type: 'team'`. A future enhancement will let that widget follow this one's selection via `target: 'current'`.
- Manage team memberships — that's a separate `TeamMembers` widget.
- Render the configured prefix team itself as a row. The prefix is treated as a filter, not a selectable team — to manage the prefix team, configure a Teams widget pointed at its parent.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*
All fields optional.

> **`parentName`** — *string*
> Restrict the widget to teams whose `parentName` is this value (and their descendants, reached via drill-down). The configured team is treated as a filter, not a selectable row. Omit to browse all top-level teams.

> **`rootLabel`** — *string*
> Label for the root breadcrumb segment. Defaults to `"Teams"` — or, when `parentSelectable` is on with `parentName` set, the prefix's final `::`-segment (e.g. `"services"` for `Role::App::services`). Use to brand the widget for the local context.

> **`parentSelectable`** — *boolean*
> When `true` and `parentName` is set, the widget treats the prefix team itself as a first-class team: it loads the team's record on mount (one extra request), publishes it to redux selection at root level so sibling widgets (`TeamMembers`, future `Attributes` `target: 'current'` for `type: 'team'`) can target it, and renders the team in the header with the standard pencil / trash affordances (subject to `protect`). Default `false` — the prefix stays a filter, not a row.
>
> Use this when the widget's scope corresponds to a role hierarchy whose root is itself a meaningful team — for example, `Role::App::<kappSlug>` grants access to the kapp and accepts direct memberships, with sub-teams underneath organising sub-roles.

> **`hidePrefix`** — *boolean*
> When `true` (default), strips the current parent prefix from each row's displayed name — `"Admin"` instead of `"Role::App::services::Admin"`. Set `false` to always render the team's full name.

> **`showDescription`** — *boolean*
> When `true` (default), shows the team description under the name in each row. Set `false` to render a tighter, name-only list.

> **`protect`** — *Array of (string | RegExp | Object)*
> Visual-only protection list. When a team's full name matches any entry, the widget hides **both** the pencil (edit) and the trash (delete) on that team's row (and on the header when the protected team is the currently-focused one). The object form lets a designer opt back into edits per entry.
>
> Entry forms:
>
> - **String** — exact full-name equality, with one convenience: when `parentName` is configured AND the entry doesn't already start with `<parentName>::`, the entry is auto-prefixed. So with `parentName: 'Role::App::services'`, writing `'Admin'` matches the team named `Role::App::services::Admin`. Designers who want to write full names can do so; their entries pass through unchanged.
> - **RegExp** — `.test(fullName)` against the team's full name (no auto-prefix — the designer chose the pattern explicitly).
> - **Object** `{ match: string|RegExp, allowEdit?: boolean }` — same matcher rules as above; set `allowEdit: true` to keep the pencil visible while still hiding the trash. Useful when a team must stay around but its name / description should still be tweakable.
>
> The first matching entry wins, so if you list `'Admin'` before `{ match: 'Admin', allowEdit: true }`, the edit affordance is hidden.
>
> This is a UX guardrail, not a permission boundary. The Kinetic platform's security policy is still the actual gate for whether an edit or delete is allowed — the widget just removes the in-UI accident vectors.

> **`classNames`** — *Object keyed by slot name*
> Per-slot class overrides. Same convention as Profile / Attributes — string values are additive (concatenated on top of the widget's defaults); object values `{ add?, remove? }` first strip the listed tokens, then append. Use the object form's `remove` when you need to drop a default the widget would otherwise apply.
>
> Recognized slots:
>
> | Slot                  | Default                                                                  | What it styles                                                          |
> | --------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
> | `container`           | `flex-c-st gap-4 w-full`                                                 | The outer wrapper around breadcrumbs, header, and list.                 |
> | `breadcrumbs`         | `kd-teams-breadcrumb flex-sc flex-wrap gap-1 text-sm text-base-content/70` | The `<nav>` breadcrumb row. Same vocabulary as Categories' breadcrumb.  |
> | `breadcrumbItem`      | `kd-teams-breadcrumb-item kbtn kbtn-ghost kbtn-xs`                       | A breadcrumb crumb. Clickable ancestors and the current segment share this slot; the current segment adds `pointer-events-none opacity-100` to non-interactively highlight it. |
> | `breadcrumbSeparator` | `kd-teams-breadcrumb-separator opacity-50 px-1`                          | The `/` between segments.                                               |
> | `header`              | `flex-sc justify-between gap-2 items-start`                              | The current-team header row (or root label at the prefix root).         |
> | `headerMain`          | `flex-c-st gap-1 flex-1 min-w-0`                                         | The name + description block on the left side of the header.            |
> | `headerName`          | `text-lg font-semibold text-base-content`                                | The current team's name (or `"Top-level teams"` at root).               |
> | `headerDescription`   | `text-sm text-base-content/60`                                           | The current team's description.                                         |
> | `headerActions`       | `flex-sc gap-1 shrink-0`                                                 | Wrapper around the edit + delete icon buttons.                          |
> | `editButton`          | `p-1 rounded hover:bg-base-200 text-base-content/70`                     | The pencil-icon edit button (header + each row).                        |
> | `deleteButton`        | `p-1 rounded hover:bg-base-200 text-base-content/70`                     | The trash-icon delete button (header + each row).                       |
> | `listSection`         | `text-sm font-semibold text-base-content/70`                             | Heading above the child / nested team list ("Sub-teams" or "Top-level teams"). |
> | `addButton`           | `kbtn kbtn-primary kbtn-sm self-start`                                   | The `+ Add team` button below the list.                                  |
> | `panel`               | `flex-c-st gap-3 p-3 rounded border border-base-300 bg-base-100`         | The inline create / edit accordion panel.                               |
> | `field`               | `field`                                                                  | Each input row inside a panel.                                          |
> | `label`               | _(empty)_                                                                | Each field's `<label>`.                                                 |
> | `input`               | _(empty)_                                                                | The name `<input>`.                                                     |
> | `textarea`            | _(empty)_                                                                | The description `<textarea>`.                                           |
> | `panelActions`        | `flex-sc gap-2 self-end`                                                 | Save / Cancel row inside the panel.                                     |
> | `panelSave`           | `kbtn kbtn-primary kbtn-sm`                                              | The Save / Create button inside the panel.                              |
> | `panelCancel`         | `kbtn kbtn-ghost kbtn-sm`                                                | The Cancel button inside the panel.                                     |
> | `list`                | `flex-c-st gap-0 divide-y divide-base-200`                               | The wrapper around the child-team rows.                                 |
> | `listRow`             | `flex-sc justify-between gap-2 py-2 px-1 cursor-pointer hover:bg-base-200/50 rounded` | Each row in the child-team list. Click descends into the team.   |
> | `listRowMain`         | `flex-c-st gap-0 flex-1 min-w-0`                                         | The name + description block on the left side of each row.              |
> | `listRowName`         | `text-base text-base-content truncate`                                   | Each row's team name.                                                   |
> | `listRowDescription`  | `text-sm text-base-content/60 truncate`                                  | Each row's team description (when `showDescription` is on).             |
> | `listRowActions`      | `flex-sc gap-1 shrink-0`                                                 | Wrapper around each row's edit + delete buttons.                        |
> | `loading`             | `text-sm text-base-content/60`                                           | The `Loading…` message during a fetch.                                  |
> | `empty`               | `text-sm text-base-content/60 italic`                                    | "No sub-teams", "No top-level teams", and similar empty states.         |
> | `error`               | `text-sm text-error`                                                     | Inline fetch-error message.                                             |

**`id`** — *string*
Optional id used by the widget machinery for instance tracking AND as the key under which the widget's selection is published to redux. Sibling widgets reference this same id (typically via a `teamsWidgetId` config field) to follow the selection.

### API

In addition to the standard `container()` and `destroy()` functions every widget exposes, the Teams widget adds:

| Method                    | Returns / does                                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSelectedTeam()`       | `{ name, slug }` for the deepest segment of the breadcrumb, or `null` when the user is at the prefix's children (or all top-level) level.                                                                                     |
| `getCurrentPath()`        | An array of `{ name, slug, displayName }` representing the segments below the configured prefix root. The displayName is the prefix-stripped local name. Empty array when the user is at the root view.                       |
| `navigateToRoot()`        | Clears the breadcrumb path back to the configured root (the prefix's children, or all top-level teams). Discards any open edit / create accordions.                                                                            |
| `navigateUp(n = 1)`       | Pops `n` segments off the breadcrumb path. Clamped at the root.                                                                                                                                                               |
| `refresh()`               | Re-fetches the current view's child list. Useful after the underlying data has changed outside the widget.                                                                                                                     |

### Behavior

- **Children query.** Each view is sourced from a single `fetchTeams({ q: 'parentName="..."' })` call, ordered by name ascending. The platform's `parentName` is automatically derived from the team's full name (everything before the final `::`), so the widget never has to compute it. The root view (no configured prefix, no breadcrumb segments below) uses `q='parentName=""'` to pull top-level teams.
- **Name composition.** Creating `"Admin"` from inside `"Role::App::services"` POSTs a team named `"Role::App::services::Admin"`. The full name is reassembled on the client; the platform doesn't accept a separate `parentName` field on `POST /teams`.
- **Rename cascade.** Renaming a team that has children is safe — the Kinetic platform automatically cascades the new prefix to every descendant's `parentName`. No manual fix-up is needed, and the widget refreshes the current view after the rename so the new shape is visible immediately.
- **Selection.** Descending into a team writes `{ name, slug }` to `state.widgets.teamSelection[id]` (when `id` is set). Going up clears it. On unmount the selection is cleared so a closed Teams widget doesn't leave stale state for downstream consumers. The widget also dispatches a `teams-selection-change` CustomEvent on its container element on every selection change, with `event.detail = { widgetId, team }` where `team` is `{ name, slug }` or `null`. This is the recommended hook for non-React form-bundle code that wants to react to selection without subscribing to redux.
- **Inline panels are single-open.** Opening the edit panel on a row (or on the header for the currently-focused team) closes any other open panel. The same goes for the create panel — it toggles from the `+ Add team` button.
- **Mutations + security policies.** Create, update, and delete calls surface their 403 responses verbatim — the policy denial message is shown in the toast, not a generic "failed to save". When the server returns any other error, the platform's message is surfaced too.
- **Delete is destructive and cascades.** The Kinetic platform deletes the target team, every descendant team (recursively), and every membership within all of them — in a single request. The widget's confirm dialog says so explicitly and warns that the action cannot be undone. The security-policy check still gates the operation; if the user isn't allowed, the 403 message is surfaced verbatim.
- **`protect` is a UX guardrail, not a permission.** A protected team has no trash button (and no pencil unless `allowEdit: true`) in the widget, but the API will still accept the corresponding request from someone with permission. Use `protect` to make accidents harder, not to enforce policy.
- **`parentSelectable` adds one fetch on mount.** The widget issues `fetchTeams({ q: 'name="<parentName>"', limit: 1 })` to resolve the prefix team's slug + description before rendering. Rename of the prefix team is picked up automatically — the widget switches its children query to the new name (which the platform also cascades). Deleting the prefix team puts the widget in a broken state (no prefix exists); reload after to recover.

### Examples

#### Browse all top-level teams in the space

```js
bundle.widgets.Teams({
  container: K('content[Teams]').element(),
  config: {},
  id: 'all-teams',
});
```

#### Manage app roles for a specific kapp

```js
bundle.widgets.Teams({
  container: K('content[Roles]').element(),
  config: {
    parentName: 'Role::App::services',
    rootLabel: 'App roles',
  },
  id: 'services-roles',
});
```

Inside the widget, the user only sees teams under `Role::App::services::*`. Creating `"Admin"` posts a team named `Role::App::services::Admin`; entering it and creating `"Tier 1"` posts `Role::App::services::Admin::Tier 1`. Rows display the prefix-stripped local name by default.

#### Manage memberships at the prefix team itself

```js
bundle.widgets.Teams({
  container: K('content[Roles]').element(),
  config: {
    parentName: 'Role::App::services',
    parentSelectable: true,   // ← prefix team is a first-class row
  },
  id: 'roles',
});

bundle.widgets.TeamMembers({
  container: K('content[Members]').element(),
  config: { team: 'current', teamsWidgetId: 'roles' },
  id: 'members',
});
```

At the root view, the breadcrumb reads `services` and TeamMembers shows the prefix team's members. Descend into a child (e.g. `Admin`) and the breadcrumb becomes `services / Admin`, with TeamMembers following along. Useful for role hierarchies where `Role::App::<kappSlug>` itself grants access to the kapp.

#### Pair with Attributes (manual wiring, today)

```js
// 1. Mount Attributes — it can stand up in picker mode immediately.
bundle.widgets.Attributes({
  container: K('content[Attrs]').element(),
  config: { type: 'team', target: 'picker' },
  id: 'role-attrs',
});

// 2. Mount Teams and, once it's instantiated, wire Teams' selection events
//    to Attributes' setTarget. The `.then(api => ...)` form is important —
//    `bundle.widgets.Teams.get(id)` is only available after the widget has
//    finished its async mount, so calling it synchronously after the
//    initializer returns will give you `undefined`.
//
//    A future config option on Attributes will follow Teams' selection
//    automatically via `target: 'current'`, removing this wiring entirely.
bundle.widgets
  .Teams({
    container: K('content[Teams]').element(),
    config: { parentName: 'Role::App::services' },
    id: 'roles',
  })
  .then(api => {
    api.container().addEventListener('teams-selection-change', e => {
      const team = e.detail.team; // { name, slug } | null
      if (team) {
        bundle.widgets.Attributes.get('role-attrs').setTarget({
          teamSlug: team.slug,
        });
      }
    });
  });
```

The `teams-selection-change` event fires on every selection change — including the initial publish on mount and the clear-on-deselect — with `event.detail = { widgetId, team }` where `team` is `{ name, slug }` or `null`.

#### Protect specific teams from accidental delete

```js
bundle.widgets.Teams({
  container: K('content[Teams]').element(),
  config: {
    parentName: 'Role::App::services',
    protect: [
      // Locked entirely — no edit, no delete. Relative to parentName,
      // so this matches `Role::App::services::Admin`.
      'Admin',
      // Full name also works — both match the same team.
      'Role::App::services::Admin',
      // RegExp matches the full name (no auto-prefix). Every team named
      // `Core` at any depth under the prefix — locked entirely.
      /^Role::App::services::.+::Core$/,
      // Object form — keep the team around (no delete) but allow renames /
      // description edits. Same matcher rules as strings/regexps.
      { match: 'HR', allowEdit: true },
      { match: /^.+::Owner$/, allowEdit: true },
    ],
  },
});
```

For matched rows: the trash always disappears; the pencil disappears too unless the matching entry has `allowEdit: true`. Remember: this is a UX guard, not a permission boundary; the platform's security policy is the actual gate.

#### Show full names instead of stripping the prefix

```js
bundle.widgets.Teams({
  container: K('content[Teams]').element(),
  config: { parentName: 'Role::App::services', hidePrefix: false },
});
```

Useful when the form is targeting an audience that doesn't think in terms of the prefix scope, or when you want the full `Role::App::services::Admin` visible for clarity.

#### Restyle slots via classNames

```js
bundle.widgets.Teams({
  container: K('content[Teams]').element(),
  config: {
    parentName: 'Role::App::services',
    classNames: {
      // ADD only — string is additive.
      headerName: 'text-xl',
      // REMOVE + ADD — put the Add button on the right.
      addButton: { add: 'self-end', remove: ['self-start'] },
    },
  },
});
```

When you only need to add classes, use the string form. When you need to drop a default the widget would otherwise apply, use the object form's `remove` array. Removal is the more reliable customization tool — Tailwind's compile-time content scan doesn't see classes typed in form bundles, so overrides via new classes can silently no-op, but stripping unwanted defaults always works.

### Notes

- **Theme inheritance.** The widget uses the same `kbtn` / DaisyUI vocabulary as other bundle widgets, so changes to the space (or kapp) theme apply without extra work.
- **Where the slug comes from.** Each team returned by the platform carries its own `slug` (derived from the full name). The widget always uses that, never computing the slug locally.
- **Unknown slot names warn and are ignored.** Same convention as Profile / Attributes.
- **The widget doesn't pre-check permissions.** A user without permission to create / rename / delete still sees those affordances; the 403 response handler surfaces the policy denial when they try. This keeps the widget simple and uniform — security messaging lives in the platform's policy text, not in widget code.
- **Pagination beyond 1000 teams per view is not handled in v1.** A prefix with more than 1000 direct children would be truncated; if you hit that, partition the namespace further with intermediate teams.
