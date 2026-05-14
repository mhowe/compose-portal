# Compose Portal Skills

Skills specific to building inside the **compose-portal** bundle. Loaded by the AI Builder companion service when `SKILLS_DIRS` includes this directory.

These augment — they do **not** replace — the general Kinetic Platform skills in the `kinetic-platform-ai-skills` repo. Use both. The general skills cover how the platform itself works (forms, kapps, workflows, MCP tools); these cover how to build *within compose-portal* (its widgets, theme system, RBAC conventions, deployment patterns).

## When to consult these

When the user asks you to build something inside compose-portal — a kapp landing page, a chrome layout, a custom theme, a multi-builder team setup, anything that uses bundle widgets or follows bundle conventions — check this index for a relevant skill before designing. Load it via `read_skill` to get the full content.

If a pattern obviously belongs here but isn't covered, flag the gap to the user — they'll add it.

## Available skills

_The index is being seeded. Categories below have placeholders; populated entries will be listed under each._

### Widget recipes

Composing the bundle widgets (`BundleHeader`, `BundleChrome`, `BundleContainer`, `BundleMenu`, `BundleLogo`, `BundleAvatar`, `BundleSearch`, `BundleLink`, `BundleBanner`, `BundleCounter`, `BundleChromeToggle`) into common UI surfaces. These are **strategies**, not canonical patterns — surface alternatives when more than one fits.

| Skill | Path | Read when you need to... |
|-------|------|--------------------------|
| Form picker via modal (one strategy) | `widget-recipes/form-picker-modal.md` | Build a "pick a form from a list" UI (categories browser, custom search picker) using a reusable presentation-only form opened in a modal, parameterized by URL params, that emits a single event for the host to handle. |

### Theming

Space-level theme builder, per-kapp theme overrides, custom CSS conventions, file resource organization for theme assets.

_(none yet)_

### Team / RBAC strategy

Team naming conventions, ownership patterns, security policy expressions for shared spaces with many builders.

| Skill | Path | Read when you need to... |
|-------|------|--------------------------|
| Application team conventions | `application-conventions/app-team-conventions.md` | Understand conventions for creating and managing teams to control application access. |
| Maintaining teams for application access | `application-conventions/app-security-policies.md` | Update a kapp with proper standard security settings. |

### Bundle conventions

Capability installs, storage kapp layout, file resource organization, Display Mode (fullscreen pages), AI Builder integration.

| Skill | Path | Read when you need to... |
|-------|------|--------------------------|
| Landing pages (space home & kapp home) | `bundle-conventions/landing-pages.md` | Update or create a space home page or kapp home page, set `Default Space Form Slug` / `Default Form Slug`, switch a landing between embedded and fullscreen, or test a new home page without disrupting the live one. |
| Profile page (`/profile`) | `bundle-conventions/profile-page.md` | Replace the bundle's built-in profile page with a custom form via the space `Default Profile Form Slug` attribute, ship per-audience profile variants via the CSV-ordered list, or test a new profile form without disrupting the live one. |

## Authoring notes (for whoever adds skills here)

- Each skill is a markdown file with YAML frontmatter (`name`, `description`).
- Be **decision-oriented**: focus on "when to use," "what to choose," common gotchas. The widget API docs in `compose-portal/portal/src/components/kinetic-form/widgets/*.md` cover the "how" — point to them rather than duplicating.
- Skills are **bundle-specific**. If a pattern applies to any Kinetic install, it belongs in `kinetic-platform-ai-skills`, not here.
- Keep this index entry under ~one line per skill. Full content is loaded on demand via `read_skill`.
