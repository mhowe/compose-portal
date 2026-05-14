---
name: profile-page
description: How the compose-portal bundle resolves `/profile` — the space attribute `Default Profile Form Slug` points at a form (or CSV-ordered list of forms) in the admin kapp, and the bundle renders the first form the user can see in place of the built-in profile UI. When no candidate resolves, the bundle's standard profile page is shown. Covers the attribute, where the form lives, the fallback contract, and the testing pattern. The CSV-ordered list and Display Mode mechanics are shared with `landing-pages` — this skill points there rather than duplicating them.
---

# Profile Page (`/profile`)

This skill defines **how `/profile` is customized** in the compose-portal bundle and **where the custom form lives**. It is the answer to user requests like:

- *"Customize what users see on `/profile`."*
- *"Make a custom profile page for VIPs but keep the standard one for everyone else."*
- *"Replace the default profile UI with our own form."*

The mechanics — comma-separated slug lists, first-match-the-user-can-see semantics, Display Mode, Form Chrome, MCP tools, the no-risk preview workflow — are **identical to space and kapp landing pages**. See [`landing-pages`](./landing-pages.md) for the shared model. This skill only covers what's unique to `/profile`.

---

## The resolver

| URL | What renders | Driven by |
|---|---|---|
| `/profile` | A form in the `admin` kapp, inline, in place of the bundle's standard profile UI. Falls through to the built-in profile page when no form resolves. | Space attribute **`Default Profile Form Slug`**. |

Two things to internalize:

1. **`/profile` is a destination, not a landing page.** Despite using the same mechanics as `/kapps`, it isn't part of the `/` cascade. Users navigate to `/profile` directly (via the avatar menu, a `BundleLink`, or a chrome action); there is no profile equivalent of `Default Kapp Slug`.
2. **The form replaces the built-in profile UI entirely.** Anything the standard `Profile.jsx` provides (email/displayName/password editing, logout) becomes the form's responsibility when a custom form resolves. If the custom form doesn't include logout or password change, those features are simply unavailable on `/profile` for users who land on that form.

---

## Where the custom profile form lives

| Page | Physical form | Configuration |
|---|---|---|
| **Custom profile** (`/profile`) | A form in the `admin` kapp. Slug is conventionally something like `profile`, `my-profile`, `space-profile`, or whatever the admin chose. | Space attribute **`Default Profile Form Slug`** = that form's slug (or a CSV-ordered list of slugs). |

The `admin` kapp is the conventional location for **all** space-level configuration forms — space landing, kapp setup, theme settings, and now the profile form all live here.

---

## CSV-ordered list pattern (shared with landings)

`Default Profile Form Slug` accepts a single slug or a comma-separated ordered list, exactly like `Default Space Form Slug`:

```
vip-profile, standard-profile
```

The first slug whose form the user can see (Active or New, security policy allows) wins. Audience routing is **slug order + Form security policy** — there is no per-user `Default Profile Form Slug` attribute and there will not be one. See [`landing-pages`](./landing-pages.md) for the full semantics.

---

## Common requests → what to do

| User request | Action |
|---|---|
| "Customize my profile page to do X." | 1. Read space attr `Default Profile Form Slug`. 2. If empty, this user is asking to *replace* the built-in profile UI for the first time — create a form in the `admin` kapp (slug e.g. `profile`) and set the attribute to its slug. 3. If set, the slug(s) in there name a form (or forms) in the `admin` kapp — retrieve the first one and edit *the form*. Don't touch the attribute unless you're changing *which* form is the profile page. |
| "Make VIPs see a different profile page than everyone else." | Use the CSV-ordered list. Add the VIP-specific form first (with a Form security policy scoping it to the VIP team), then the general profile form last. Same shape as the audience routing example in [`landing-pages`](./landing-pages.md). |
| "Make the profile page take the whole screen — no header." | Set the profile form's `Display Mode` attribute to `fullscreen`. The bundle honors this exactly like it does for landing forms. |
| "Go back to the default profile page." | Clear the `Default Profile Form Slug` attribute (or remove all candidate slugs from the CSV). The bundle's built-in `Profile.jsx` will render again. Don't delete the custom form — admins may want to restore it. |

---

## What the built-in profile page does (the fallback)

When no custom form resolves, the bundle renders its built-in profile UI (`portal/src/pages/profile/Profile.jsx`):

- Displays the user's avatar and current display name / email.
- Edits to display name and email, saved via `updateProfile`.
- Optional password change (toggled visible).
- Logout link.

A custom profile form should reproduce whichever of these the admin wants — there is no automatic merge with the built-in UI. Linking back to the built-in flow is not an option (any link to `/profile` re-enters this resolver and loops to the same custom form), so the form itself must include any password/logout affordances its users need.

---

## Display Mode

Form attribute: `Display Mode` (same as for landing forms).

- **`embedded`** (default) — form renders inside the bundle's chrome, wrapped in the standard page layout (gutter, max-width, content card).
- **`fullscreen`** — form renders alone with no bundle chrome. The form owns its own header (via `BundleHeader` / `BundleChrome` widgets) and is responsible for any back-navigation.

See [`landing-pages`](./landing-pages.md#display-mode) for full details — the behavior is identical.

---

## URLs a profile form can link to

The full set of bundle-defined routes is in [`landing-pages`](./landing-pages.md#urls-a-home-page-can-link-to). Notably relevant for a profile form:

| Route | Renders |
|---|---|
| `/` | Landing resolver (use for "back home"). |
| `/kapps` | Space home page. |
| `/profile` | Loops back into this resolver — do **not** link a profile form to `/profile`. |
| `/app/logout` | The platform logout endpoint (anchor tag, not a bundle route — that's what the built-in profile uses). |

---

## MCP Tool Equivalents

| Operation | MCP tool |
|---|---|
| Read the current profile form slug(s) | `core_retrieveSpace` (with `include=attributesMap`) |
| Change which form is the profile page | `core_updateSpace` — set `attributesMap["Default Profile Form Slug"]` |
| List candidate forms in the admin kapp | `core_listForms` with `kappSlug=admin` |
| Retrieve a profile form's definition | `core_retrieveForm` (include `pages,attributesMap`) |
| Create a new profile form | `core_createForm` in `kappSlug=admin` |
| Edit the profile form's content | `core_updateForm` |
| Toggle fullscreen profile | `core_updateForm` — set `attributesMap["Display Mode"]` to `fullscreen` or `embedded` |

Always include `attributesMap` so you see existing attribute values rather than discovering they're absent on a write.

---

## Testing pattern (zero-risk preview)

Same as for landings — see [`landing-pages`](./landing-pages.md#testing-pattern-zero-risk-preview). Summary:

1. Create a new form in the admin kapp with a temp slug (`profile-test-<feature>`).
2. **Prepend** that slug to `Default Profile Form Slug` so it wins for you.
3. Restrict visibility with a Form security policy scoped to you or a test team.
4. Preview at `/profile`.
5. Promote (rename + clean up CSV) or discard (remove from CSV + delete form).

Never just *swap* a live profile form's slug — the CSV-with-fallback pattern keeps the existing profile working for everyone the entire time.

---

## Gotchas

- **Admin kapp must exist.** The profile form is looked up in `kappSlug=admin`, same as space landing forms.
- **The form must be Active or New.** Inactive forms are filtered out server-side; a draft will silently not render even if it's in the CSV.
- **The user must be able to see the form.** Form security policies gate visibility. If *no* candidate in the CSV admits the current user, the bundle falls through to the built-in profile page — that's the safety net, but it also means a misconfigured policy looks like "my custom profile didn't work."
- **Logout and password change are the custom form's responsibility.** The bundle does not splice anything from the built-in profile into the custom form.
- **There is no per-user override attribute.** Unlike `Default Kapp Slug` (which has a user-profile twin), the profile resolver is purely space-level + CSV-ordered. This is intentional — keep audience routing in slug order + security policies.
- **`/profile` always renders the resolver.** Even if a user has every conceivable profile-related attribute set, navigating to `/profile` goes through this resolver. There is no bypass to the built-in UI other than clearing / not configuring the attribute.

---

## Related skills and docs

- [`landing-pages`](./landing-pages.md) — shared CSV-ordered list pattern, Display Mode and Form Chrome semantics, audience routing model, MCP tool equivalents in detail.
- **Bundle manifest** — `compose-portal/portal/src/helpers/bundle-manifest.js` declares `Default Profile Form Slug` alongside the other space attributes.
- **Resolver source** — `compose-portal/portal/src/pages/profile/ProfileResolver.jsx` for the exact resolution behavior, and `Profile.jsx` for the built-in fallback UI.
