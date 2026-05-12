---
name: app-security-policies
description: The two required Kapp-type security policies that must be created and bound when scaffolding a Kinetic application — Display Visibility and Superusers — and how they map to the eight Kapp security policy slots. Includes the JavaScript IIFE rule templates and the membership rule that Superusers must belong to both the visibility team and the Superuser team.
---

# Application Security Policies

This skill defines the two `Kapp`-type security policies that **must** be created when scaffolding a new Kinetic app, and the eight Kapp security policy slots they bind to. It depends on the team hierarchy defined by `app-team-conventions` — read that first.

For generic security policy CRUD (KSL, attribute definitions, the security policy data model), see the `users-teams-security` and `security-policies` skills.

---

## MCP Tool Equivalents

When operating via MCP Tools:

| Operation | MCP tool |
|---|---|
| Create Kapp security policy | `core_createKappSecurityPolicyDefinition` |
| Update Kapp security policy (incl. rename + rule body edit) | `core_updateKappSecurityPolicyDefinition` |
| Retrieve Kapp security policy | `core_retrieveKappSecurityPolicyDefinition` |
| List Kapp security policies (rename procedure, step 3) | `core_listKappSecurityPolicyDefinitions` |
| Bind policies to Kapp slots | `core_updateKapp` (with `securityPolicies` array) |

## Background

A Kapp has eight security policy slots. Each slot takes exactly one security policy of type `Kapp` — there is no OR'ing of policies in a slot. By default, Space Admins always have full access regardless of which policies are bound; the policies govern access for everyone else.

The eight slots and their API field names:

| UI Name | API Field Name |
|---------|----------------|
| Kapp Display | `Display` |
| Kapp Modification | `Modification` |
| Form Creation | `Form Creation` |
| Submission Support | `Submission Support` |
| Default Form Display | `Default Form Display` |
| Default Form Modification | `Default Form Modification` |
| Default Submission Access | `Default Submission Access` |
| Default Submission Modification | `Default Submission Modification` |

When scaffolding a new app, create two Kapp-type security policies and bind them across these eight slots as follows:

| Slot | Bound Policy |
|------|--------------|
| `Display` | `<App Name> Display Visibility` |
| `Modification` | `<App Name> Superusers` |
| `Form Creation` | `<App Name> Superusers` |
| `Submission Support` | `<App Name> Superusers` |
| `Default Form Display` | `<App Name> Superusers` |
| `Default Form Modification` | `<App Name> Superusers` |
| `Default Submission Access` | `<App Name> Superusers` |
| `Default Submission Modification` | `<App Name> Superusers` |

One slot (`Display`) gets the visibility policy; the other seven get the Superusers policy. App-specific functional roles (approvers, requesters, etc.) generally aren't bound at the Kapp slot level — they're bound at the form or submission level via form-specific or category-specific policies. The Kapp-level bindings represent the floor of access required to operate the app at all.

---

## Policy 1 — `<App Name> Display Visibility`

**Purpose:** Anyone in the team `Role::App::<App Name>` can see (display) the Kapp.

**Bound to:** Kapp Display slot only.

**Type:** Kapp

**Rule body:**

```javascript
(function() {
  // Helper method
  var hasIntersection = function(obj1, obj2) {
    // Ensure the objects are not empty
    obj1 = (obj1 === null || obj1 === undefined) ? [] : obj1;
    obj2 = (obj2 === null || obj2 === undefined) ? [] : obj2;
    // If the parameters are not lists, wrap them in lists
    var list1 = (obj1 instanceof Array) ? obj1 : [obj1];
    var list2 = (obj2 instanceof Array) ? obj2 : [obj2];
    // Return whether any intersecting values were found
    return list1.find(function(value) {return hasValue(list2, value)}) !== undefined;
  };

  // Helper method
  var hasValue = function(list, value) {
    return (list instanceof Array) && list.indexOf(value) != -1;
  };

  return (
    // App Visibility: members of the app's root team
    hasIntersection(["Role::App::<App Name>"], identity('teams'))
  );
})()
```

Replace `<App Name>` with the literal app display name (e.g., `Role::App::Asset Tracker`).

### Why Superusers also need to be in `Role::App::<App Name>`

The Display slot evaluates only the `Display Visibility` policy. The Superusers policy is bound to the other seven slots but not to Display. Because teams do not cascade access (see `app-team-conventions`), a user in `Role::App::<App Name>::Admin::Superuser` who is **not** also in `Role::App::<App Name>` cannot see the Kapp — even though they could modify it if they could reach it.

This is intentional: it keeps each policy slot governed by a single, easily-auditable policy, rather than ORing visibility checks across multiple rule bodies. The cost is the membership rule: **Superusers must belong to both teams.**

---

## Policy 2 — `<App Name> Superusers`

**Purpose:** Anyone in `Role::App::<App Name>::Admin::Superuser` has full access to the seven non-Display Kapp slots.

**Bound to:** Modification, Form Creation, Submission Support, Default Form Display, Default Form Modification, Default Submission Access, Default Submission Modification.

**Type:** Kapp

**Rule body:**

```javascript
(function() {
  // Helper method
  var hasIntersection = function(obj1, obj2) {
    // Ensure the objects are not empty
    obj1 = (obj1 === null || obj1 === undefined) ? [] : obj1;
    obj2 = (obj2 === null || obj2 === undefined) ? [] : obj2;
    // If the parameters are not lists, wrap them in lists
    var list1 = (obj1 instanceof Array) ? obj1 : [obj1];
    var list2 = (obj2 instanceof Array) ? obj2 : [obj2];
    // Return whether any intersecting values were found
    return list1.find(function(value) {return hasValue(list2, value)}) !== undefined;
  };

  // Helper method
  var hasValue = function(list, value) {
    return (list instanceof Array) && list.indexOf(value) != -1;
  };

  return (
    // Superuser access
    hasIntersection(["Role::App::<App Name>::Admin::Superuser"], identity('teams'))
  );
})()
```

Replace `<App Name>` with the literal app display name.

---

## Creating the Policies via API

Both policies are scoped to the Kapp (not the Space), so use the Kapp-scoped security policy definition endpoints:

```http
POST /app/api/v1/kapps/<kappSlug>/securityPolicyDefinitions
Content-Type: application/json

{
  "name": "<App Name> Display Visibility",
  "type": "Kapp",
  "message": "You do not have access to this application.",
  "rule": "(function() { ... full IIFE body ... })()"
}
```

```http
POST /app/api/v1/kapps/<kappSlug>/securityPolicyDefinitions
Content-Type: application/json

{
  "name": "<App Name> Superusers",
  "type": "Kapp",
  "message": "You do not have superuser access to this application.",
  "rule": "(function() { ... full IIFE body ... })()"
}
```

The `message` field is what users see when the policy denies access. Tune the text per policy so failures are diagnosable.

---

## Binding the Policies to Kapp Slots

After creating both policies, update the Kapp to bind them to the eight slots:

```http
PUT /app/api/v1/kapps/<kappSlug>
Content-Type: application/json

{
  "securityPolicies": [
    {"endpoint": "Display",                          "name": "<App Name> Display Visibility"},
    {"endpoint": "Modification",                     "name": "<App Name> Superusers"},
    {"endpoint": "Form Creation",                    "name": "<App Name> Superusers"},
    {"endpoint": "Submission Support",               "name": "<App Name> Superusers"},
    {"endpoint": "Default Form Display",             "name": "<App Name> Superusers"},
    {"endpoint": "Default Form Modification",        "name": "<App Name> Superusers"},
    {"endpoint": "Default Submission Access",        "name": "<App Name> Superusers"},
    {"endpoint": "Default Submission Modification",  "name": "<App Name> Superusers"}
  ]
}
```

Slot assignments are by policy `name`, not slug — which is why renaming a policy requires rebinding (see `app-team-conventions` for the rename procedure).

---

## Worked Example — `Asset Tracker`

After the four teams from `app-team-conventions` have been created and the Kapp itself exists with slug `asset-tracker`:

**Create `Asset Tracker Display Visibility`:**

```http
POST /app/api/v1/kapps/asset-tracker/securityPolicyDefinitions
{
  "name": "Asset Tracker Display Visibility",
  "type": "Kapp",
  "message": "You do not have access to the Asset Tracker application.",
  "rule": "(function() { var hasIntersection = function(obj1, obj2) { obj1 = (obj1 === null || obj1 === undefined) ? [] : obj1; obj2 = (obj2 === null || obj2 === undefined) ? [] : obj2; var list1 = (obj1 instanceof Array) ? obj1 : [obj1]; var list2 = (obj2 instanceof Array) ? obj2 : [obj2]; return list1.find(function(value) {return hasValue(list2, value)}) !== undefined; }; var hasValue = function(list, value) { return (list instanceof Array) && list.indexOf(value) != -1; }; return (hasIntersection([\"Role::App::Asset Tracker\"], identity('teams'))); })()"
}
```

**Create `Asset Tracker Superusers`:** same shape, with the team string replaced by `"Role::App::Asset Tracker::Admin::Superuser"` and the message tuned to "You do not have superuser access to the Asset Tracker application."

**Bind both to the Kapp:**

```http
PUT /app/api/v1/kapps/asset-tracker
{
  "securityPolicies": [
    {"endpoint": "Display",                         "name": "Asset Tracker Display Visibility"},
    {"endpoint": "Modification",                    "name": "Asset Tracker Superusers"},
    {"endpoint": "Form Creation",                   "name": "Asset Tracker Superusers"},
    {"endpoint": "Submission Support",              "name": "Asset Tracker Superusers"},
    {"endpoint": "Default Form Display",            "name": "Asset Tracker Superusers"},
    {"endpoint": "Default Form Modification",       "name": "Asset Tracker Superusers"},
    {"endpoint": "Default Submission Access",       "name": "Asset Tracker Superusers"},
    {"endpoint": "Default Submission Modification", "name": "Asset Tracker Superusers"}
  ]
}
```

**Add the first Superuser:** add their username to both `Role::App::Asset Tracker` and `Role::App::Asset Tracker::Admin::Superuser` via the memberships API. Forgetting either team is the most common provisioning bug.

---

## Beyond the Defaults

The two-policy default establishes the *floor*: visibility for general users, full access for Superusers. App-specific roles are added on top:

- **Functional roles** (e.g., `Role::App::Asset Tracker::Functional::Approver`) typically get their own policies bound at the **form level**, not the Kapp level. A form's `Submission Modification` slot might be bound to an "Asset Tracker Approver" policy that checks for membership in the Approver team.
- **Other admin roles** (e.g., `Role::App::Asset Tracker::Admin::Auditor`) follow the same pattern — their own policy, bound at the form or category level depending on scope.

The pattern stays the same: one team per role, one policy per access pattern, the policy's rule body uses the same `hasIntersection` IIFE template, and the policy name embeds the app name and role so renames are findable.

---

## Gotchas

- **Each Kapp slot takes one policy, not many.** Don't try to OR access conditions across multiple bound policies — combine them inside a single policy's rule body instead.
- **Superusers need TWO memberships.** Display Visibility checks `Role::App::<App Name>` only. Without that, a Superuser is locked out of their own app.
- **Policy rule bodies contain team-name string literals.** Renames must update those strings — the team rename doesn't propagate into the rule text. See `app-team-conventions` for the rename procedure.
- **Slot bindings reference policy names.** Renaming a policy without rebinding leaves orphaned slot assignments. Always re-bind after renaming.
- **`type` must be `"Kapp"`** for these two policies — not `"Space"`, not `"System"`. Wrong type means the policy can't be bound to a Kapp slot.
- **The `message` field matters.** Tune it per policy. Generic "access denied" messages make support tickets harder.
