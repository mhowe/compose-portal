---
name: landing-pages
description: How the compose-portal bundle resolves "home pages" — the cascade from `/` through user/space `Default Kapp Slug`, `/kapps` rendered from the space's `Default Space Form Slug` (in the admin kapp), and `/kapps/:slug` rendered from the kapp's `Default Form Slug`. Covers where each home page physically lives, the CSV-ordered list pattern for per-audience landings, the testing pattern, Display Mode and Form Chrome attributes, the MCP tools to use, and the bundle URLs a home page can link to.
---

# Landing Pages (Space Home & Kapp Home)

This skill defines **what a "home page" is** in the compose-portal bundle, **where it lives**, and **how to edit or create one**. It is the answer to user requests like:

- *"Update my space home page to do X."*
- *"Create a new space home page for testing that does Y."*
- *"Change what users land on when they open this kapp."*

Widget API details (BundleContainer, BundleChrome, BundleLink, etc.) live in `compose-portal/portal/src/components/kinetic-form/widgets/*.md`. This skill points to those rather than duplicating them.

---

## The cascade — what renders where

There are three landing surfaces, resolved in this order:

| URL | What renders | Driven by |
|---|---|---|
| `/` | A redirect — never renders content itself. | User profile `Default Kapp Slug` → space `Default Kapp Slug` → `/kapps`. |
| `/kapps` | The **space home page**. A form in the `admin` kapp, inline. Falls through to a built-in kapp-cards view when no form resolves. | Space attribute `Default Space Form Slug`. |
| `/kapps/:slug` | The **kapp home page** for that kapp. A form in that kapp, inline. Falls through to a built-in forms table when no form resolves. | Kapp attribute `Default Form Slug` on the matching kapp. |

Two things to internalize:

1. **There is no first-class "home page" object.** Every home page is a regular Kinetic form. The bundle just renders the form whose slug an attribute points at.
2. **`/kapps` is the universal preview URL.** The resolver at `/` redirects past it when a `Default Kapp Slug` is set, but `/kapps` itself always renders the space home page (or the fallback) regardless. Use `/kapps` to preview without changing default-kapp settings.

---

## Where each home page physically lives

| Home page | Physical form | Configuration |
|---|---|---|
| **Space home** (`/kapps`) | A form in the `admin` kapp. Slug is conventionally something like `home`, `space-home`, or whatever the admin chose. | Space attribute **`Default Space Form Slug`** = that form's slug. |
| **Kapp home** (`/kapps/<kappSlug>`) | A form in that same kapp. | Kapp attribute **`Default Form Slug`** = that form's slug. |

The `admin` kapp is the conventional location for **all** space-level configuration forms — it's where setup, capability installs, theme settings, and the space landing form live. Creating a new space home page means creating a form in the admin kapp.

---

## The CSV-ordered list pattern

Both `Default Space Form Slug` and `Default Form Slug` accept either a single slug or a **comma-separated, ordered list** of slugs:

```
vip-home, standard-home, fallback-home
```

The bundle queries every candidate in one round trip, then renders the **first slug from the configured order that the user can see** (form is Active or New **and** security policy allows). This is how admins ship different landings to different audiences without per-user branching inside one form:

- Put the most-restricted form first (e.g. `vip-home` with a security policy limiting it to a VIP team).
- Subsequent entries are progressively broader fallbacks.
- The last entry should be the form everyone can see; if none of the candidates resolve, the bundle falls through to its built-in view.

If you're editing this attribute, **never re-order silently** — the order is the precedence and is part of the contract.

---

## Common requests → what to do

| User request | Action |
|---|---|
| "Update my space home page to do X." | 1. Read space attr `Default Space Form Slug`. 2. The slug(s) in there name a form (or forms) in the `admin` kapp — retrieve the first one. 3. Edit *the form* (fields, events, page layout). Don't touch the attribute unless you're changing *which form* is the home page. |
| "Create a new space home page for testing that does Y." | 1. Create a new form in the `admin` kapp with a clear temp slug (e.g. `home-test-<feature>`). 2. **Prepend** that slug to `Default Space Form Slug` so it wins for you while the existing entries remain as fallbacks. 3. When done testing: either promote the new form and remove the old slug, or delete the test form and remove its slug from the attribute. |
| "Make this kapp open to form X instead of the forms table." | 1. Confirm form X exists in that kapp and is Active. 2. Set the kapp's `Default Form Slug` attribute to form X's slug. |
| "Make different teams land on different home pages." | Use the CSV-ordered list. Add the audience-specific form first (with an appropriate Form security policy), then the general fallback last. |
| "Make the space home page take the whole screen — no header." | Set the home form's `Display Mode` attribute to `fullscreen`. See [Display Mode](#display-mode) below. |
| "Make the kapp open to no chrome at all when the home form loads." | Same as above — set that form's `Display Mode` to `fullscreen`. |

---

## Display Mode — fullscreen vs embedded landings

Form attribute: `Display Mode`. Values:

- **`embedded`** (default) — form renders inside the bundle's chrome (header, nav, avatar). Wrapped in the standard page layout (gutter, max-width, content card).
- **`fullscreen`** — form renders alone, no bundle chrome at all. The form itself is responsible for any chrome it wants (via `BundleHeader`, `BundleChrome`, etc. widgets). Use this for marketing-style landings or for forms that compose their own header.

Only consulted when the form is rendered as a landing page (space landing or kapp landing). Has no effect on regular form routes like `/kapps/:kappSlug/forms/:formSlug`.

---

## Form Chrome — for forms loaded inside a BundleContainer

Form attribute: `Form Chrome`. Values:

- **`default`** — form renders with its standard page wrapper (form heading, settings link, gutter, bordered content card) even inside a container.
- **`bare`** — strips the wrapper. Just the form's fields/sections render inside the container, letting the host page own the layout.

This is **separate from `Display Mode`**:

| Surface | Attribute |
|---|---|
| Form rendered as a landing page (`/kapps` or `/kapps/:slug`) | `Display Mode` controls chrome around the *whole bundle*. |
| Form rendered inside a `BundleContainer` widget in another form | `Form Chrome` controls the *page wrapper* around the form inside the container. |

A `BundleContainer` can also force-strip the wrapper via `hideFormChrome: true` regardless of the form's attribute. Either source set to bare wins. See the `BundleContainer` widget doc for the full container model.

---

## URLs a home page can link to

When a home page form composes navigation (via `BundleLink`, `BundleMenu`, or raw `<a>` tags inside HTML content), these are the bundle-defined routes:

| Route | Renders |
|---|---|
| `/` | Landing resolver (cascades; never a stable target — use `/kapps` instead). |
| `/kapps` | Space home page (or built-in kapp cards). |
| `/kapps/:kappSlug` | Kapp home page (or built-in forms table). |
| `/kapps/:kappSlug/forms/:formSlug` | New submission for that form. |
| `/kapps/:kappSlug/forms/:formSlug/:submissionId` | Existing submission. |
| `/profile` | The user's profile. |
| `/settings/space` | Space Settings (admins only). |

For chrome-widget click actions, prefer the documented `clickAction` / `target` system rather than hand-rolled hrefs — see the `CHROME_ACTIONS` widget doc.

To embed *another page* inline within the home page (e.g. show a dashboard form plus a request-list form side by side), use the `BundleContainer` widget with an `initialPath` pointing at one of the routes above.

---

## MCP Tool Equivalents

| Operation | MCP tool |
|---|---|
| Read the current space home form slug(s) | `core_retrieveSpace` (with `include=attributesMap`) |
| Change which form is the space home | `core_updateSpace` — set `attributesMap["Default Space Form Slug"]` |
| Read the current kapp home form slug(s) | `core_retrieveKapp` (with `include=attributesMap`) |
| Change which form is a kapp home | `core_updateKapp` — set `attributesMap["Default Form Slug"]` |
| List candidate forms in the admin kapp | `core_listForms` with `kappSlug=admin` |
| Retrieve a home form's definition | `core_retrieveForm` (include `pages,attributesMap` to see content + Display Mode / Form Chrome) |
| Create a new home form | `core_createForm` in `kappSlug=admin` (space home) or the target kapp (kapp home) |
| Edit the home form's content | `core_updateForm` |
| Toggle fullscreen landing | `core_updateForm` — set `attributesMap["Display Mode"]` to `fullscreen` or `embedded` |
| Toggle bare chrome inside containers | `core_updateForm` — set `attributesMap["Form Chrome"]` to `bare` or `default` |

Always include `attributesMap` (and `formAttributeDefinitions` when reading a kapp) so you see the relevant attribute values rather than discovering they're absent on a write.

---

## Testing pattern (zero-risk preview)

When asked to *try* a change without breaking the current home page:

1. **Create a new form** in the right kapp with a temp slug (`home-test-<feature>` or similar). Active status.
2. **Prepend** that slug to the attribute's CSV list — e.g. `Default Space Form Slug` goes from `standard-home` to `home-test-shiny, standard-home`. The existing form is now the fallback.
3. **Restrict the test form's visibility** if other users shouldn't see it: set a Form security policy that scopes it to you or a test team. Forms the user can't see are filtered server-side, so other users automatically fall through to `standard-home`.
4. **Preview at `/kapps`** (space home) or `/kapps/<slug>` (kapp home). No login impersonation needed; the security policy does the gating.
5. **Promote or discard:**
   - To keep: remove the old slug from the CSV, or rename the test form's slug to the canonical one and update the attribute.
   - To discard: remove the test slug from the CSV, then delete the test form.

Never just *swap* a live home form's slug — the CSV-with-fallback pattern keeps the existing landing working for everyone the entire time.

---

## Gotchas

- **Admin kapp must exist.** The space home form is looked up in `kappSlug=admin`. If the kapp is missing, the bundle blocks setup (visible in Space Settings → Setup) and falls through to the kapp-cards landing. Don't try to put the space home in a different kapp; the lookup is hardcoded.
- **The form must be Active or New.** Inactive forms are filtered out server-side. A "draft" status form will silently not render even if its slug is in the CSV.
- **The user must be able to see the form.** Form security policies gate visibility. A landing form that lacks an appropriate Form policy will render only for users the policy admits — which may be no one. When in doubt, set the policy to a permissive default and tighten later.
- **The space attribute is `Default Space Form Slug` (singular slug, even though it accepts a CSV).** The kapp attribute is just `Default Form Slug`. Don't conflate them.
- **`Display Mode` doesn't help inside `BundleContainer`.** Use `Form Chrome` (or the container's `hideFormChrome` config) for that.
- **`/kapps` is not gated by `Default Kapp Slug`.** Even if a user has a personal `Default Kapp Slug`, navigating directly to `/kapps` still shows the space home. The cascade only applies at `/`.
- **Order is meaning in the CSV.** Re-ordering changes which audience sees which form. Treat the order as part of the configuration, not as cosmetic.

---

## Related skills and docs

- **Widget docs** — `BundleContainer` (inline sub-routing), `Kapps` (the kapp-cards widget used in the fallback landing), `CHROME_ACTIONS` (the shared `clickAction` / `target` system). All live in the widget-docs index loaded by the AI Builder companion.
- **Bundle manifest** — `compose-portal/portal/src/helpers/bundle-manifest.js` is the canonical list of attribute definitions the bundle reads.
- **Resolver source** — `compose-portal/portal/src/pages/landing/LandingResolver.jsx`, `EmbeddedLanding.jsx`, `kapp/KappDefaultPage.jsx` if you need to understand the exact resolution behavior.
