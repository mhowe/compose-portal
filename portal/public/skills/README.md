# Compose Portal Skills

Bundle-specific skills for the AI Builder Assistant. They teach Claude how to build *within compose-portal* — its widgets, theme system, RBAC conventions, and deployment patterns — as opposed to the general Kinetic Platform skills (in a separate `kinetic-platform-ai-skills` repo) which teach how the platform itself works.

## Why these live in `portal/public/skills/`

Vite copies the entire `public/` directory into the build output verbatim. By living here, skills:

- Travel with every bundle build automatically — no separate copy step
- Are served at `<bundle-base>/skills/` once deployed (e.g. `https://acme.kinops.io/<bundle>/skills/CLAUDE.md`)
- Are served at `http://localhost:3000/skills/...` during dev
- Stay version-locked with the bundle code that describes the widgets and conventions

The companion service fetches them over HTTP at startup (server-to-server, no CORS, no auth — skills aren't secret).

## How they're loaded

The companion's `SKILLS_DIRS` env var accepts a comma-separated list of roots. Each root can be a **filesystem path** or an **HTTP/HTTPS URL**. Configure for local dev:

```
SKILLS_DIRS=/path/to/kinetic-platform-ai-skills,http://localhost:3000/skills
```

For a deployed installation:

```
SKILLS_DIRS=/baked/in/path/to/kinetic-platform-ai-skills,https://<space>.kinops.io/<bundle>/skills
```

`CLAUDE.md` at the root of each entry is the index injected into Claude's system prompt. Individual skill files are loaded on demand via the `read_skill` tool, which searches every root in order.

Backward compat: `SKILLS_DIR` (singular) still works as a single-entry list.

## Skill file shape

```markdown
---
name: <short-name>
description: <one-sentence summary; Claude uses this in the index to decide whether to load the full skill>
---

# Title

Body content. Markdown. Code samples. Tables. Whatever helps Claude make a good decision.
```

Filename convention: `SKILL.md` inside a directory named for the skill (e.g. `skills/widgets/kapp-landing-page/SKILL.md` becomes the path Claude passes to `read_skill`).

## What goes here vs. in `kinetic-platform-ai-skills`

| Question | Answer |
|---|---|
| "Use BundleChrome with a collapsed rail when there are >5 nav items" | Here |
| "Forms have content elements vs. field elements" | `kinetic-platform-ai-skills` |
| "Our team naming convention is `<App>-Builders`, `<App>-Admins`" | Here |
| "How `core_createForm` works" | `kinetic-platform-ai-skills` (or the MCP tool's own description) |
| "When to use Display Mode vs. embedded chrome" | Here |
| "DateTimes must be UTC without milliseconds" | `kinetic-platform-ai-skills` |
| "Storage kapp slug attribute is `Data Storage Kapp Slug`" | Here |

Rule of thumb: if the skill is meaningless without the compose-portal bundle existing, it's bundle-specific and belongs here.

## Authoring guidance

- **Decision-oriented over reference.** Skills should help Claude *choose* — when to use this widget, when not to, what trade-offs apply. Reference docs already exist in `compose-portal/portal/src/components/kinetic-form/widgets/*.md` for widget APIs and in MCP tool descriptions for platform calls. Skills should *point* to those, not duplicate.
- **Concrete over abstract.** Show actual config snippets, naming patterns, JSON shapes. Avoid vague "consider whether..." prose.
- **Recipes for composition.** A "build a kapp landing page" recipe that shows BundleHeader + BundleChrome + BundleContainer working together is more valuable than three separate widget skills.
- **One skill = one decision.** If you're writing a skill that branches into 4 unrelated decisions, split it.

## When to add a skill

Best moment: when you've watched Claude get the same thing wrong twice in a row. Third time, write a skill. That way each skill earns its place in the prompt.

## Note: this README ships with the build

Because it's in `public/`, this README ends up at `<bundle-base>/skills/README.md` after build. That's fine — it's not sensitive, and serving it documents what's available. If that ever becomes a concern, move this README to the bundle source root and leave only `CLAUDE.md` plus skill files in `public/skills/`.
