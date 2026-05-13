# Widget maintenance instructions

This file is for **Claude Code sessions** working in the bundle. It tells you exactly which files to touch when a widget is added, renamed, or removed, so the bundle, the human-facing docs, and the AI Builder Assistant's view of widgets all stay in sync.

The human-facing entry point for this directory is `README.md`. Read that first if you're new to the widget system.

---

## How the pieces fit together

A widget has up to four manually-maintained surfaces:

1. **Source** — `widget-name.jsx` (React) or `widget-name.js` (vanilla JS) in this directory.
2. **Registration** — `widgets.js` (import + entry in the `AVAILABLE_WIDGETS` map; kept alphabetical).
3. **Reference doc** — `WIDGET_NAME.md` (uppercase, underscores) in this directory. Read by the human doc viewer AND by the AI Builder Assistant.
4. **README.md** — the categorized "Available Widgets" list. Each widget appears under one category; new categories are rare.

Two things are **auto-generated** from the .md files by `widgetDocsPlugin` in `portal/vite.config.js` — do not edit them by hand:

- `/widget-docs/index.json` — `[{ id, file, title, isWidget, description }]` machine index
- `/widget-docs/CLAUDE.md` — markdown skill index loaded by the AI Builder companion service

The auto-generated CLAUDE.md classifies a doc as a **widget** (vs a reference doc) by checking whether the source H2 heading ends with the word `Widget`. The **description** column is the first paragraph immediately after that H2. If the first non-blank line after the H2 is a list, code block, or another heading, no description is extracted and the doc is omitted from the index. Keep the format below.

---

## Standard widget doc format

Every widget doc must follow this shape so the auto-generation works:

```markdown
[⬅ Back to Kinetic Form Widgets](README.md#available-widgets)

## <ExactWidgetName> Widget

One paragraph describing what this widget renders and the primary decision a form author makes when reaching for it. This paragraph becomes the entry in the auto-generated `/widget-docs/CLAUDE.md`, so keep it self-contained and prose (no lists, no code blocks, no headings before it).

```js
// Initialize the widget
bundle.widgets.<ExactWidgetName>({ container, config, id });
```

### Parameters
…

### API
…

### Examples
…

### Notes
…
```

**Critical:**
- The H2 must end with the word `Widget` — that's how the plugin distinguishes widgets from reference docs like `STYLES.md` or `UTILS.md`.
- The first paragraph after the H2 must be prose. A list, table, code block, blockquote, or sub-heading there will cause description extraction to fail.
- The widget call signature is always `bundle.widgets.<Name>({ container, config, id, ... })`. The `container` parameter accepts either a raw `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()` — note this in the Parameters section, because form authors trip over it.

## Adding a new widget

1. Author the source file. Pattern: copy a similar existing widget (a chrome widget → `bundle-link.jsx`; a form-field widget → `markdown.js`; a non-rendering widget → `ai-builder-settings.js`). Keep the file name kebab-case.
2. Register in `widgets.js`:
   - Add the import (alphabetical).
   - Add the identifier to the `AVAILABLE_WIDGETS` object (alphabetical).
3. Author the reference doc following the **Standard widget doc format** above. File name is `UPPER_SNAKE_CASE.md` matching the widget identifier (e.g. `BundleFoo` → `BUNDLE_FOO.md`).
4. Add the widget to `README.md` under the right category in the "Available Widgets" tree. Keep its position consistent with the visual order in the rendered UI when possible.
5. If the widget participates in a shared system (e.g. the `clickAction`/`target` system documented in `CHROME_ACTIONS.md`), link to that doc from the new widget's reference doc rather than duplicating the system.
6. **Don't update `/widget-docs/CLAUDE.md` or `/widget-docs/index.json`** — the vite plugin regenerates them on next start/build.
7. Restart the dev server (`yarn start` or equivalent) so the plugin re-collects. Restart the AI Builder companion service if it was running, so it re-fetches the regenerated `CLAUDE.md`.

## Renaming a widget

The widget identifier appears in multiple places. Update all of them.

1. Rename the source file (`bundle-old.jsx` → `bundle-new.jsx`).
2. Update `widgets.js`: rename the import path AND the identifier in `AVAILABLE_WIDGETS`.
3. Rename the reference doc (`BUNDLE_OLD.md` → `BUNDLE_NEW.md`).
4. Update the `## OldName Widget` heading in the renamed doc.
5. **Cross-references in other widget docs** — search every `.md` file in this directory for:
   - The old filename in relative links (e.g. `[OldName](BUNDLE_OLD.md)` → `[NewName](BUNDLE_NEW.md)`).
   - The old identifier in prose and code examples.
6. Update `README.md` — the bullet in the "Available Widgets" list.
7. **Customer-facing impact**: form bundles in customer spaces may call `bundle.widgets.OldName(...)`. Those references are outside this repo. Surface this risk to the user before completing a rename — the rename is breaking.
8. Restart dev server + companion. Verify the regenerated `/widget-docs/CLAUDE.md` shows the new name.

## Removing a widget

1. Delete the source file.
2. Remove the import and the `AVAILABLE_WIDGETS` entry from `widgets.js`.
3. Delete the reference doc.
4. Remove the bullet from `README.md`'s "Available Widgets" tree.
5. Search every other `.md` in this directory for references to the removed widget (filename and identifier) and clean them up.
6. Search the rest of the bundle source for `bundle.widgets.RemovedName(...)` usage — the widget might be wired into forms shipped with the bundle (e.g. capabilities).
7. **Customer-facing impact**: same as renaming — customer forms may break. Surface this before completing.
8. Restart dev server + companion to regenerate the index without the removed widget.

## Sanity checks before finishing

Run these mentally (or with `grep`) on any add/rename/remove:

- `grep -rl "OldName" .` in this directory — should be zero hits after a rename or removal.
- The widget identifier in `widgets.js` matches the H2 heading in the reference doc exactly (case-sensitive).
- The reference doc opens with a back-link line, then `## <Name> Widget`, then a prose paragraph (no list/code/heading immediately under the H2).
- `README.md`'s "Available Widgets" tree includes the widget (after add) or excludes it (after remove).

## Related infrastructure

- `portal/vite.config.js` — `widgetDocsPlugin` reads this directory and emits the `/widget-docs/*` endpoints. Don't edit emitted files; edit the plugin if you need the format to change.
- `portal/src/components/kinetic-form/globals.jsx` — exposes `bundle.widgetDocs.{list, get, rewireLinks}` for the in-portal doc viewer. Should not need changes for widget add/rename/remove.
- AI Builder companion service `.env` — must have `http://localhost:3000/widget-docs` (or the deployed equivalent) in `SKILLS_DIRS` for the assistant to see widgets. See `ai-builder-companion/.env.example`.
