[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## TeamMembers Widget

`TeamMembers` lists, adds, and removes members of a Kinetic team. The team is resolved from `config.team` — an explicit slug or name, a built-in picker, or `'current'` to follow a sibling Teams widget's selection. Adding a member uses a typeahead-style search: either Kinetic's built-in `username` / `email` `startsWith` search (the default `userLookup.mode: 'direct'`) or a Kinetic integration the designer points the widget at (`'integration'` — same plumbing as BundleMenu's integration-sourced items). Removals route through the bundle's confirm modal; 403s surface the platform's policy denial message verbatim.

```js
// Initialize the TeamMembers widget
bundle.widgets.TeamMembers({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.TeamMembers.get(id);
```

### Scope

The widget renders three stacked sections: a header showing the resolved team's name and member count, a search input for adding new members, and the member list with per-row remove buttons. The mutations (add membership, remove membership) are gated by the Kinetic platform's security policies; when a request returns a 403, the policy's denial message is surfaced as a toast verbatim.

What this widget does **not** do:

- Manage teams themselves (create / rename / delete teams) — pair with the `Teams` widget.
- Edit team attributes — pair with an `Attributes` widget configured for `type: 'team'`.
- Create or edit users — only existing users can be added to a team.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into.

**`config`** — *Object*
All fields optional.

> **`team`** — *string or Object*
> The team whose members are shown. Defaults to `'picker'`. Accepted shapes:
>
> | Value                          | Behavior                                                                       |
> | ------------------------------ | ------------------------------------------------------------------------------ |
> | `'picker'`                     | Auto-renders a styled `<select>` of every team; user picks one.                |
> | `'current'`                    | Reads the selection published by `config.teamsWidgetId`'s Teams widget.        |
> | `'<slug>'`                     | Explicit team slug — fetched directly.                                          |
> | `{ teamSlug: '<slug>' }`       | Same as the bare-string form.                                                  |
> | `{ teamName: '<full name>' }`  | Looked up by exact name on mount (one extra request).                          |

> **`teamsWidgetId`** — *string*
> Required when `team` is `'current'`. The id of the sibling Teams widget whose selection this widget should follow. If omitted in `current` mode, the widget logs a configuration warning and displays an empty state.

> **`userLookup`** — *Object*
> How the add-a-member search is sourced. Defaults to `{ mode: 'direct' }`.
>
> #### `userLookup.mode: 'direct'` *(default)*
>
> The widget renders a typeahead input that calls `fetchUsers` with a KQL query of the form `(username =* "...") OR (email =* "...")` on debounced typing — `=*` is Kinetic KQL's starts-with operator. Pick a result to add.
>
> #### `userLookup.mode: 'integration'`
>
> The candidate pool is sourced from a Kinetic integration. Reuses the same fetch plumbing as BundleMenu's integration-sourced items.
>
> | Field             | Type                      | Notes                                                                                                                                                                              |
> | ----------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `kappSlug`        | *string, required*        | Kapp owning the integration.                                                                                                                                                       |
> | `formSlug`        | *string, optional*        | Form integration; omit for a kapp integration.                                                                                                                                     |
> | `integrationName` | *string, required*        | Integration to execute.                                                                                                                                                            |
> | `listProperty`    | *string, required*        | Lodash path in the integration response that resolves to the candidate array (e.g. `'users'`, `'submissions'`).                                                                    |
> | `parameters`      | *object, optional*        | Static parameters passed on every call.                                                                                                                                            |
> | `searchParameter` | *string, optional*        | When set, the widget re-calls the integration on debounced typing with the typed value merged into `parameters[searchParameter]`. When omitted, the integration is called once on mount and the result is filtered client-side as the user types. |
> | `userMap`         | *object, see below*       | Declarative `{{path}}` template producing the canonical `{ username, displayName?, email? }` shape. Mutually exclusive with `transform`.                                            |
> | `transform`       | *(row) => { username, …}* | Function alternative to `userMap`. Receives a row, returns the canonical user shape. Mutually exclusive with `userMap`.                                                            |
> | `errorProperty`   | *string, optional*        | Lodash path where the integration nests its own error object.                                                                                                                      |
> | `onSuccess`       | *function, optional*      | Called with the full response on success.                                                                                                                                          |
> | `onError`         | *function, optional*      | Called with the error object on failure.                                                                                                                                           |
>
> **`userMap` template.** Mirrors BundleMenu's `itemMap`. Every value is either a literal or a `{{lodash.path}}` template against the row. The canonical shape:
>
> ```js
> userMap: {
>   username:    '{{values.Username}}',     // REQUIRED — used to POST the membership
>   displayName: '{{values["Full Name"]}}', // optional display niceties
>   email:       '{{values.Email}}',
> }
> ```
>
> `username` is the only required output field — the membership endpoint only needs that. `displayName` and `email` are display-only.

> **`pickerLabel`** — *string*
> Label for the auto-rendered team picker. Only meaningful when `team === 'picker'`. Defaults to `"Team"`.

> **`protect`** — *Array of (string | RegExp)*
> Visual-only protection list for "grouping" teams that shouldn't accept direct memberships. When the resolved team's full name matches any entry — string entries via exact equality, RegExp entries via `.test(fullName)` — the search/add input and per-row remove buttons are hidden and an inline message explains (override via `protectedMessage`). Existing members still render read-only so the user can verify there's nothing to clean up.
>
> Designed for role hierarchies where some teams in the chain are containers, not leaves — e.g. `Role::App::services::Admin` grouping `Tier1` / `Tier2` sub-admin teams. Users get added to the Tier teams, not to Admin itself.
>
> This is a UX guardrail, not a permission boundary. The Kinetic platform's security policy is the actual gate for whether memberships can be created or removed; the widget just removes the in-UI accident vector. The imperative `addMember` / `removeMember` API still works on protected teams — they're a custom-integration affordance, not a guarded surface.

> **`protectedMessage`** — *string*
> Overrides the inline message shown when the resolved team is protected. Defaults to `"Direct membership management is disabled for this team."`.

> **`classNames`** — *Object keyed by slot name*
> Per-slot class overrides. Same convention as Profile / Attributes / Teams — string values are additive; object values `{ add?, remove? }` first strip the listed tokens, then append.
>
> Recognized slots:
>
> | Slot                | Default                                                                                              | What it styles                                                       |
> | ------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
> | `container`         | `flex-c-st gap-4 w-full`                                                                             | Outer wrapper.                                                       |
> | `picker`            | `field`                                                                                              | The team picker's wrapper (only rendered when `team === 'picker'`).  |
> | `pickerLabel`       | _(empty)_                                                                                            | The picker's `<label>`.                                              |
> | `pickerSelect`      | `min-w-48`                                                                                           | The picker's `<select>`.                                             |
> | `header`            | `flex-sc justify-between gap-2 items-start`                                                          | The header row.                                                      |
> | `headerMain`        | `flex-c-st gap-1 flex-1 min-w-0`                                                                     | Name + count container.                                              |
> | `headerName`        | `text-lg font-semibold text-base-content`                                                            | The team name.                                                       |
> | `headerCount`       | `text-sm text-base-content/60`                                                                       | The member-count line.                                               |
> | `search`            | `relative w-full`                                                                                    | The search-to-add wrapper (positioning context for the dropdown).    |
> | `searchInput`       | `kinput kinput-bordered w-full`                                                                      | The search input element.                                            |
> | `searchResults`     | `absolute z-10 left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-box shadow-lg max-h-72 overflow-auto` | The dropdown of search matches.                                      |
> | `searchResult`      | `flex-c-st gap-0 px-3 py-2 cursor-pointer hover:bg-base-200`                                         | Each row inside the dropdown.                                        |
> | `searchResultName`  | `text-base text-base-content`                                                                        | The candidate's display name.                                        |
> | `searchResultMeta`  | `text-xs text-base-content/60`                                                                       | The username / email sub-line.                                       |
> | `searchEmpty`       | `px-3 py-2 text-sm text-base-content/60 italic`                                                      | "No matching users" message.                                         |
> | `searchLoading`     | `px-3 py-2 text-sm text-base-content/60`                                                             | "Searching…" message.                                                |
> | `searchError`       | `px-3 py-2 text-sm text-error`                                                                       | Inline search-error message.                                         |
> | `list`              | `flex-c-st gap-0 divide-y divide-base-200`                                                           | The member-list wrapper.                                             |
> | `listRow`           | `flex-sc justify-between gap-2 py-2 px-1`                                                            | Each member row.                                                     |
> | `listRowMain`       | `flex-c-st gap-0 flex-1 min-w-0`                                                                     | Name + meta container.                                               |
> | `listRowName`       | `text-base text-base-content truncate`                                                               | Member display name.                                                 |
> | `listRowMeta`       | `text-sm text-base-content/60 truncate`                                                              | Member username / email.                                             |
> | `listRowActions`    | `flex-sc gap-1 shrink-0`                                                                             | Wrapper around the remove button.                                    |
> | `removeButton`      | `p-1 rounded hover:bg-base-200 text-base-content/70`                                                 | The X-icon remove button.                                            |
> | `loading`           | `text-sm text-base-content/60`                                                                       | "Loading…" while a fetch is in flight.                               |
> | `empty`             | `text-sm text-base-content/60 italic`                                                                | "No members yet" / "No team selected" placeholder.                   |
> | `error`             | `text-sm text-error`                                                                                 | Inline fetch-error message.                                          |

**`id`** — *string*
Optional id used for instance tracking.

### API

In addition to the standard `container()` and `destroy()` functions every widget exposes, the TeamMembers widget adds:

| Method                          | Returns / does                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTeam()`                     | `{ name, slug }` for the currently-loaded team, or `null`.                                                                                                                  |
| `setTeam(target)`               | Programmatically change the team. Accepts the same shapes as `config.team` except `'picker'` / `'current'` (which are config-time concepts). Returns `true` on success.    |
| `getMembers()`                  | Array of `{ username, displayName, email }` for the currently-loaded members.                                                                                              |
| `addMember(user)`               | Add a user. `user` is either a `username` string or a canonical user object. Same code path as picking from the search dropdown — toast on success / 403 / other error.    |
| `removeMember(usernameOrUser)`  | Remove a user. Routes through the confirm modal before issuing `DELETE /memberships/<teamSlug>_<username>`.                                                                |
| `refresh()`                     | Re-fetch the current team + memberships.                                                                                                                                    |

### Behavior

- **Team resolution.** When `team === 'current'` the widget subscribes to `state.widgets.teamSelection[teamsWidgetId]` and re-fetches whenever Teams' breadcrumb selection changes. When `team === 'picker'`, the widget fetches every team (`limit: 1000`) once on mount to populate the select. When `team` is a slug / name / object form, the widget resolves it once on mount and refreshes the load whenever `setTeam()` swaps the target.
- **Member sort.** Members are sorted alphabetically by `displayName` (case-insensitive), falling back to `username`. The widget does not currently expose a client-side filter input — for large teams use the API and a custom UI.
- **Already-a-member guard.** `addMember` checks the current list before issuing the create call; if the user is already on the team, a toast explains and no request is made.
- **Direct-mode KQL.** The widget issues `(username =* "...") OR (email =* "...")` against indexed user fields (`=*` is KQL's starts-with operator). The query string is escaped to safely embed user-typed double quotes. Searches under 2 characters are skipped to avoid noisy server load.
- **Integration-mode fetch policy.** Without `searchParameter`, the integration is called once on mount and the typed query filters the cached list client-side — best for small / static directories. With `searchParameter`, every debounced keystroke updates `parameters[searchParameter]` and the integration is re-called — best for large directories that already filter on the server.
- **Imperative `addMember` doesn't require the search input.** A custom UI (typeahead widget, search modal, anything) can call `bundle.widgets.TeamMembers.get('members').addMember({ username: '...' })` directly, bypassing the built-in search entirely.
- **403 surfacing.** Create-membership and delete-membership failures surface the platform's policy denial message via `extractPolicyMessage` — toast title says "Add/Remove member failed", description is the policy reason verbatim.

### Examples

#### Pair with Teams via 'current'

```js
bundle.widgets.Teams({
  container: K('content[Teams]').element(),
  config: { parentName: 'Role::App::services' },
  id: 'services-roles',
});

bundle.widgets.TeamMembers({
  container: K('content[Members]').element(),
  config: { team: 'current', teamsWidgetId: 'services-roles' },
  id: 'services-members',
});
```

The user descends through teams in the Teams widget; the right-hand TeamMembers widget follows along, always showing the deepest selected team's members.

#### Explicit team slug

```js
bundle.widgets.TeamMembers({
  container: K('content[Admins]').element(),
  config: { team: 'role-admins' },
});
```

#### Look up by name

```js
bundle.widgets.TeamMembers({
  container: K('content[HRMembers]').element(),
  config: { team: { teamName: 'Role::App::services::HR' } },
});
```

One extra request on mount to resolve the slug, then standard load.

#### Built-in picker

```js
bundle.widgets.TeamMembers({
  container: K('content[Members]').element(),
  config: { team: 'picker', pickerLabel: 'Team to manage' },
});
```

#### Integration-sourced user search

Admin maintains a `user-directory` form with fields `Username`, `Full Name`, `Email`, and an integration `search-users` that returns rows filtered server-side by a `q` parameter:

```js
bundle.widgets.TeamMembers({
  container: K('content[Members]').element(),
  config: {
    team: 'current',
    teamsWidgetId: 'roles',
    userLookup: {
      mode: 'integration',
      kappSlug: 'admin',
      formSlug: 'user-directory',
      integrationName: 'search-users',
      listProperty: 'users',
      searchParameter: 'q',
      userMap: {
        username:    '{{values.Username}}',
        displayName: '{{values["Full Name"]}}',
        email:       '{{values.Email}}',
      },
    },
  },
});
```

For a small / static directory, omit `searchParameter` — the integration is called once and the widget filters client-side as the user types.

#### Role hierarchy: prefix accepts memberships, some sub-teams are groupings only

```js
bundle.widgets.Teams({
  container: K('content[Teams]').element(),
  config: {
    parentName: 'Role::App::services',
    parentSelectable: true,       // ← prefix is a real team, accepts members
  },
  id: 'roles',
});

bundle.widgets.TeamMembers({
  container: K('content[Members]').element(),
  config: {
    team: 'current',
    teamsWidgetId: 'roles',
    // These teams exist to organize their sub-teams; users get added to
    // the sub-teams, not to these.
    protect: [
      'Role::App::services::Admin',
      'Role::App::services::Operations',
      /^Role::App::services::.+::Container$/,
    ],
  },
});
```

At the prefix (`services`) and at the leaf sub-teams (`Admin::Tier1`, `Operations::Tier2`), the search + remove UI is available. At the grouping teams (`Admin`, `Operations`, anything ending in `::Container`), the widget shows an inline message and existing members render read-only.

#### Drive add from a custom typeahead via the imperative API

```js
bundle.widgets.TeamMembers({
  container: K('content[Members]').element(),
  config: { team: 'current', teamsWidgetId: 'roles' },
  id: 'members',
});

// In your form's bundle script, after a custom typeahead resolves a user:
bundle.widgets.TeamMembers.get('members').addMember({ username: 'jsmith' });
```

The built-in search input still renders unless you also remove it via classNames; the imperative API is additive.

### Notes

- **`bundle.widgets.TeamMembers` vs `bundle.widgets.Teams`.** Teams manages teams; TeamMembers manages who's *in* a team. They share the `state.widgets.teamSelection[id]` redux slice so a single user motion ("click into a team in Teams") drives both widgets without designer wiring.
- **Where memberships come from.** The widget issues `fetchTeam({ teamSlug, include: 'memberships,memberships.user' })` per load — one round trip pulls the team and all members with their user records. Pagination beyond ~1000 members is not handled in v1.
- **Where the canonical user shape comes from.** Direct mode reads the Kinetic user record. Integration mode applies `userMap` (or `transform`) to each row. In both cases, the widget falls back to assembling `displayName` from `firstName` + `lastName` (or just `username`) when the field isn't present.
- **The widget doesn't pre-check permissions.** Users without permission to modify memberships still see the add/remove affordances; the 403 response handler surfaces the policy denial when they try. Same pattern as Teams.
- **No 'remove all' or bulk operations.** Removals are per-row, behind a confirm modal. If you need a bulk pattern, drive the imperative API in a loop from a custom button.
- **`protect` is a UX guardrail, not a permission.** Protected teams hide the search input and per-row remove buttons and show an inline message. The platform's security policy is the actual gate. The imperative `addMember` / `removeMember` API still works on protected teams — they're a custom-integration affordance, not a guarded surface.
