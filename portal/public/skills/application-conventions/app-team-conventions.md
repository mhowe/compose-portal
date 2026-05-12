---
name: app-team-conventions
description: Team naming hierarchy and membership conventions when scaffolding a new Kinetic application (Kapp). Covers the Role::App::<App Name>::* structure, container vs membership teams, the protected system-wide teams, and the app-name availability check that must run before creating or renaming an app.
---

# Application Team Conventions

This skill defines the team hierarchy that **must** be created alongside every new Kapp, and the availability check that **must** precede creating or renaming a Kapp. It pairs with the `app-security-policies` skill, which defines the two Kapp-level security policies that reference these teams.

For generic team CRUD, KQL query syntax, and the team data model, see the `users-teams-security` skill. This skill assumes that knowledge.

---

## MCP Tool Equivalents

When operating via MCP Tools:

| Operation | MCP tool |
|---|---|
| List teams | `core_listTeams` |
| Retrieve team | `core_retrieveTeam` |
| Create team | `core_createTeam` |
| Update / rename team | `core_updateTeam` |
| List Kapps | `core_listKapps` |
| Retrieve Kapp | `core_retrieveKapp` |
| Update Kapp (rename + slot bindings) | `core_updateKapp` |


## The Naming Contract

Team names are load-bearing. Kapp security policies are JavaScript IIFE expressions whose rule bodies contain team names as **string literals** (e.g., `"Role::App::ITSM::Admin::Superuser"`). The team-naming convention is therefore not stylistic — it's the contract that the security model relies on.

Two consequences follow from this:

1. **Use the app's display name verbatim in team names**, including spaces. Team names with spaces (`Role::App::Asset Tracker::Admin::Superuser`) are readable; slugs (`role-app-asset-tracker-admin-superuser`) are not. The `identity('teams')` function used in security expressions returns full team names, not slugs, so names are what the policy rules compare against.
2. **The app name string appears in two places that must stay in sync:** team names, and policy rule bodies. A rename touches both. See the rename procedure below.

---

## The Hierarchy

For an app named `<App Name>` (e.g., `Asset Tracker`), create the following teams:

```
Role::App::<App Name>                               [MEMBERSHIP — Kapp visibility]
Role::App::<App Name>::Admin                        [CONTAINER — no users]
Role::App::<App Name>::Admin::Superuser             [MEMBERSHIP — full app access]
Role::App::<App Name>::Admin::<Other Admin Role>    [MEMBERSHIP — as needed]
Role::App::<App Name>::Functional                   [CONTAINER — no users]
Role::App::<App Name>::Functional::<Role>           [MEMBERSHIP — as needed, any depth]
Role::App::<App Name>::<Other Grouping>             [CONTAINER or MEMBERSHIP, as needed]
```

### Container teams vs membership teams

- **Container teams** exist only to organize the hierarchy. They hold no users. Examples: `Role::App::<App Name>::Admin`, `Role::App::<App Name>::Functional`. Create them anyway — they're needed so child teams have a valid parent, and they make rename cascades predictable.
- **Membership teams** hold actual users. The `Role::App::<App Name>` root is itself a membership team — every user who needs Kapp visibility belongs to it.

### Teams do not cascade

**Memberships in a child team do NOT confer access from a parent team.** Each team is operationally independent. The `::` separator is structural and useful for cascading renames (renaming a parent renames its children automatically in the data model), but it confers zero access.

This has a critical operational consequence:

> **A user in `Role::App::<App Name>::Admin::Superuser` does NOT automatically have Kapp visibility.** Superusers must be added to **both** `Role::App::<App Name>` (for the Kapp Display policy) **and** `Role::App::<App Name>::Admin::Superuser` (for everything else).

This is the single most common "I'm a Superuser, why can't I see the app?" failure. When provisioning a Superuser, always add them to both teams.

### The minimum set for a new app

When scaffolding `<App Name>`, create at minimum:

| Team | Purpose | Holds users? |
|------|---------|--------------|
| `Role::App::<App Name>` | Kapp visibility | Yes |
| `Role::App::<App Name>::Admin` | Container | No |
| `Role::App::<App Name>::Admin::Superuser` | Full app access | Yes |
| `Role::App::<App Name>::Functional` | Container | No |

Functional sub-teams (`Role::App::<App Name>::Functional::Approver`, etc.) are added as the app's roles are defined.

---

## Protected System-Wide Teams

These teams are part of the platform's standard structure. **Do not modify, rename, or delete them under any circumstances:**

- `Role`
- `Role::App`
- `Role::Capability`

They're the roots that the entire `Role::App::*` and `Role::Capability::*` namespaces hang off. Renaming them silently breaks every app's security model.

---

## App Name Availability Check

Run this **before** creating a new app and **before** renaming an existing one. Two namespaces must be clear: the Kapp name itself, and the `Role::App::<App Name>::*` team namespace.

### Step 1 — Check for existing Kapp with the same name

```http
GET /app/api/v1/kapps
```

The Kapp search endpoint does not reliably support `q=name=...` filtering across versions, so list all Kapps and check client-side. There are typically only a handful in a space, so this is cheap.

```javascript
const kapps = (await fetch('/app/api/v1/kapps').then(r => r.json())).kapps;
const collision = kapps.find(k => k.name === proposedName);
if (collision) {
  throw new Error(`Kapp "${proposedName}" already exists (slug: ${collision.slug})`);
}
```

Match on `name` (display name), not `slug`. Slugs are derived from names but the name is what the user sees and what policy rules will reference indirectly through team names.

### Step 2 — Check for existing teams in the target namespace

```http
GET /app/api/v1/teams?q=name =* "Role::App::<App Name>::"
```

Use the `=*` (starts-with) operator. The trailing `::` is important — without it, `Role::App::Ticketing` would also match `Role::App::TicketingSystem` and produce false positives.

```javascript
const proposedName = "Ticketing";
const q = `name =* "Role::App::${proposedName}::"`;
const teams = (await fetch(`/app/api/v1/teams?q=${encodeURIComponent(q)}`).then(r => r.json())).teams;
// Also check the root membership team itself (which won't match the trailing ::)
const root = (await fetch(`/app/api/v1/teams?q=${encodeURIComponent(`name = "Role::App::${proposedName}"`)}`).then(r => r.json())).teams;
if (teams.length > 0 || root.length > 0) {
  throw new Error(`Team namespace Role::App::${proposedName}:: is already in use`);
}
```

### Step 3 — Decide

If either check returns results, the name is unavailable. Pick a different name. Do not attempt to merge namespaces — overlapping team trees from two different apps will produce ambiguous security policies.

---

## Renaming an Existing App

Renames are not a single API call. They require coordinated updates to the Kapp, the teams, and the security policy rule bodies. Run the availability check (above) against the new name **first**.

### The full procedure

For renaming `ITSM` → `Ticketing`:

1. **Availability check on the new name.** Both the Kapp namespace and the team namespace must be clear (see above).

2. **Rename the team root.** Because team names form a hierarchy in the data model, renaming `Role::App::ITSM` cascades to all children — `Role::App::ITSM::Admin::Superuser` automatically becomes `Role::App::Ticketing::Admin::Superuser`, memberships preserved.

   ```http
   PUT /app/api/v1/teams/<slug-of-Role::App::ITSM>
   {"name": "Role::App::Ticketing"}
   ```

   Note: the slug of `Role::App::ITSM` is an MD5 hash of the lowercase name. Renaming changes the slug, so any code that hardcoded the old slug breaks. See the `users-teams-security` skill for slug gotchas.

3. **Update the policy rule bodies.** The team rename cascades the team names, but it does **not** rewrite the JavaScript inside security policy rule bodies. Those still contain the literal string `"Role::App::ITSM::Admin::Superuser"`.

   For each Kapp security policy on this Kapp (typically the two policies named `<App Name> Display Visibility` and `<App Name> Superusers` — see the `app-security-policies` skill), retrieve the policy, find-and-replace `Role::App::ITSM` → `Role::App::Ticketing` in the rule body, and PUT the updated policy.

   ```http
   GET /app/api/v1/kapps/<kappSlug>/securityPolicyDefinitions
   ```

   Then for each, update the `rule` field. The policy `name` itself (`ITSM Superusers`) should also be renamed to match the new app name (`Ticketing Superusers`).

4. **Rename the policies.** The policies' own names embed the app name. Update `ITSM Display Visibility` → `Ticketing Display Visibility`, and `ITSM Superusers` → `Ticketing Superusers`.

   ```http
   PUT /app/api/v1/kapps/<kappSlug>/securityPolicyDefinitions/ITSM Superusers
   {"name": "Ticketing Superusers", "rule": "...updated body..."}
   ```

5. **Rename the Kapp.**

   ```http
   PUT /app/api/v1/kapps/<old-kapp-slug>
   {"name": "Ticketing"}
   ```

6. **Reverify the Kapp's policy slot assignments.** Each of the eight Kapp security policy slots (`Display`, `Modification`, `Form Creation`, etc.) is assigned by policy name. If the policy names were updated in step 4, the Kapp's slot assignments may need to be re-pointed to the renamed policies — verify this on the Kapp's security settings after the rename.

### Order matters

Rename teams *before* policy rule bodies, but rename policies *before* the Kapp itself. The reason: if you rename the Kapp first, the convention "the policy named `<App Name> Superusers`" becomes inconsistent with the policies still named `ITSM Superusers`, and someone debugging the system midway through the rename has no clean mental model.

### Why not just leave the old names?

You can. The system will keep working. But every subsequent change to the app — adding a new functional role, debugging a policy, onboarding a new admin — fights against the mismatch between the app's display name and the team/policy names that reference it. The convention is only useful if it's maintained.

---

## Worked Example — `Asset Tracker`

User says: *"Build me an application called Asset Tracker."*

**Step 1 — Availability check:**

```javascript
// Check Kapp name
GET /app/api/v1/kapps
// → verify no Kapp with name "Asset Tracker"

// Check team namespace
GET /app/api/v1/teams?q=name =* "Role::App::Asset Tracker::"
GET /app/api/v1/teams?q=name = "Role::App::Asset Tracker"
// → both must return empty
```

**Step 2 — Create teams** (in this order, so parents exist before children):

```http
POST /teams  {"name": "Role::App::Asset Tracker"}
POST /teams  {"name": "Role::App::Asset Tracker::Admin"}
POST /teams  {"name": "Role::App::Asset Tracker::Admin::Superuser"}
POST /teams  {"name": "Role::App::Asset Tracker::Functional"}
```

Whether parent teams must be created before children depends on whether the platform validates the parent's existence — in practice, creating them in order makes the hierarchy explicit and avoids any ambiguity.

**Step 3 — Create the Kapp.** Standard Kapp create.

**Step 4 — Create the two required security policies and bind them to the Kapp's policy slots.** See the `app-security-policies` skill for the policy definitions and slot bindings.

**Step 5 — Add users** to `Role::App::Asset Tracker` (for visibility) and `Role::App::Asset Tracker::Admin::Superuser` (for full access). Remember: Superusers need both memberships.

---

## Gotchas Summary

- **Teams don't cascade access.** A user in `Role::App::<App>::Admin::Superuser` cannot see the Kapp unless also in `Role::App::<App>`.
- **App names with spaces are fine** in team names. Avoid characters that conflict with the `::` separator or with KQL quoting.
- **Slugs change on rename.** Anything hardcoding a team or Kapp slug breaks. Reference by name where possible.
- **Renaming cascades team names but not policy rule bodies.** The JavaScript inside `rule` fields holds string literals that must be updated manually.
- **The `Role`, `Role::App`, and `Role::Capability` teams are off-limits.** Don't rename, don't delete, don't restructure.
- **Availability check is two queries, not one.** Both the Kapp name and the team namespace must be clear.
