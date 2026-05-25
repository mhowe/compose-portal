[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Attributes Widget

`Attributes` edits attributes on any Kinetic resource the user has permission to modify — space, user profile, team, kapp, category, or form. The form author picks the resource type via `config.type` and points the widget at a specific record via `config.target` (an explicit slug or object, the sentinel `"current"` to follow the surrounding kapp context, or `"picker"` to auto-render a styled select). User Attributes are deliberately excluded — they're system-controlled, and the Profile widget already handles the read-only "surface a User Attribute" case.

```js
// Initialize the Attributes widget
bundle.widgets.Attributes({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Attributes.get(id);
```

### Scope

The widget renders one section: editable rows for every attribute definition the chosen resource has (filtered by the `attributes.exclude` list), with per-attribute overrides for label, description, required, and a curated `options` list (with optional `Other…` reveal). Multi-valued definitions (`allowsMultiple: true`) automatically render as repeating rows with `Add another` / per-row remove buttons. A single Save button at the bottom commits changes; only fields the user actually edited are sent to the server, and `include` is set on every update call so redux can shallow-merge the response without dropping fields.

What this widget does **not** do:

- Render User Attributes (read-only) — use the Profile widget for that.
- Create or delete attribute definitions — the widget only sets values for definitions already deployed on the resource.
- Render anything other than text inputs, selects (with optional `Other…`), and their multi-valued repeating equivalents — values are stored as strings, so a "richer" editor (date picker, file upload, etc.) would belong in a separate widget.

### Parameters

**`container`** — *HTMLElement or array-like*
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*
`type` is required; everything else is optional.

> **`type`** — *string, required*
> One of `'space'`, `'userProfile'`, `'team'`, `'kapp'`, `'category'`, or `'form'`. Determines which definitions are read, which fetch / update endpoint is wired up, and what shape `target` must take.

> **`target`** — *string or Object*
> Identifies the record being edited. Shape depends on `type`:
>
> | `type`        | `target` accepts                                                              |
> | ------------- | ----------------------------------------------------------------------------- |
> | `space`       | _(ignored — singleton; always edits the current space)_                       |
> | `userProfile` | _(ignored — singleton; always edits the logged-in user)_                      |
> | `kapp`        | `"current"` \| `"<slug>"` \| `{ kappSlug }` \| `"picker"`                     |
> | `category`    | `{ kappSlug, categorySlug }` \| `"picker"` (needs `parent`)                   |
> | `form`        | `{ kappSlug, formSlug }` \| `"picker"` (needs `parent`)                       |
> | `team`        | `"<slug>"` \| `{ teamSlug }` \| `"picker"`                                    |
>
> `"current"` (only valid for `type: 'kapp'`) resolves through the surrounding context — an enclosing `BundleContainer`'s kapp scope if there is one, otherwise the URL kapp. `"picker"` renders an auto-styled select at the top of the widget; until the user picks a target, the widget shows a "Select a …" message instead of the editing form.

> **`parent`** — *string or Object*
> Only meaningful when `target === "picker"` and `type` is `'category'` or `'form'` (those pickers need a kapp to scope their option list). Accepts `"current"` (resolves via the same `BundleContainer` / URL fallback as `target: 'current'`), a bare slug string, or `{ kappSlug }`. Ignored for other types with a warning.

> **`attributes`** — *Object*
> Per-attribute configuration. Same shape as Profile's `userProfileAttributes`. Two keys:
>
> - **`exclude`** — *Array of string* — Attribute names to omit. By default, every attribute definition the chosen resource has is rendered.
> - **`entries`** — *Array of Object* — Per-attribute overrides. Each entry: `{ name, label?, description?, required?, options?, allowOther? }`.
>   - **`name`** — *string, required* — Attribute name.
>   - **`label`** — *string* — Override the field label (defaults to the attribute name).
>   - **`description`** — *string* — Override helper text (defaults to the definition's description).
>   - **`required`** — *boolean* — Block save when the attribute has no non-empty value. Widget-enforced; the platform has no system-level required concept for these attributes.
>   - **`options`** — *Array of (string | { value, label })* — When provided, the field renders as a `<select>` instead of a text input. Bare strings (label = value) or `{ value, label }` objects.
>   - **`allowOther`** — *boolean* — Only meaningful alongside `options`. When true, the select appends an "Other…" option that reveals a free-text input below.
>
> Multi-valued attributes (`allowsMultiple: true` on the definition) automatically render as repeating fields. When `options` is configured, each row becomes its own select with an independent `Other…` mode.

> **`order`** — *Array of string OR Array of Object*
> Explicit render order. Two shapes (pick one — don't mix):
>
> - **Flat array of attribute names.** Listed-then-alphabetical; unlisted fields fall to the end.
> - **Array of group objects** — `{ groupTitle: string, fields: [name, ...] }`. Each group renders as a `<section>` containing an optional `<h3>` header (empty `groupTitle` = headerless visual section break). Unlisted fields fall into an implicit final untitled group.
>
> Same semantics as Profile's `order`.

> **`pickerLabel`** — *string*
> Override for the picker's label text. Defaults to the type's human label (`"Kapp"`, `"Team"`, `"Category"`, `"Form"`). Only meaningful when `target === "picker"`.

> **`classNames`** — *Object keyed by slot name*
> Per-slot class overrides. Same convention as Profile — string values are additive (concatenated on top of the widget's defaults); object values `{ add?, remove? }` first strip the listed tokens, then append. Use the object form's `remove` when you need to drop a default the widget would otherwise apply.
>
> Recognized slots:
>
> | Slot           | Default                                | What it styles                                                       |
> | -------------- | -------------------------------------- | -------------------------------------------------------------------- |
> | `container`    | `flex-c-st gap-6 w-full`               | The outer `<div>` wrapping the picker (when present) and the form.   |
> | `picker`       | `field`                                | The picker's outer `.field` wrapper. Picker only renders when `target === 'picker'`. |
> | `pickerLabel`  | _(empty)_                              | The picker's `<label>`.                                              |
> | `pickerSelect` | `min-w-48`                             | The picker's `<select>`.                                             |
> | `group`        | `flex-c-st gap-6`                      | The `<section>` wrapping each ordered group of attribute fields.     |
> | `groupHeader`  | `text-base font-semibold text-base-content` | The `<h3>` rendered above a named group.                          |
> | `field`        | `field`                                | Each attribute field row.                                            |
> | `label`        | _(empty)_                              | Each field's `<label>`.                                              |
> | `input`        | `min-w-48`                             | Every editable `<input>`.                                            |
> | `select`       | `min-w-48`                             | Every editable `<select>`.                                           |
> | `description`  | `text-sm text-base-content/60`         | Helper text under a field.                                           |
> | `addAnother`   | `kbtn kbtn-ghost kbtn-xs self-start`   | The "Add another" button on multi-value rows.                        |
> | `removeRow`    | `kbtn kbtn-ghost kbtn-sm kbtn-circle`  | The per-row remove button.                                           |
> | `saveButton`   | `kbtn kbtn-primary self-end`           | The Save button at the bottom.                                       |
> | `error`        | `flex-sc gap-2 text-base-content/60`   | Inline error message under a field.                                  |
> | `loading`      | `text-sm text-base-content/60`         | The "Loading…" message while form/team values are being fetched.     |
> | `empty`        | `text-sm text-base-content/60`         | "Select a kapp", "No attribute definitions", and similar messages.   |

**`id`** — *string*
Optional id used by the widget machinery for instance tracking.

### API

In addition to the standard `container()` and `destroy()` functions every widget exposes, the Attributes widget adds:

| Method                     | Returns / does                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTarget()`              | The currently resolved target object (e.g. `{ kappSlug: 'services' }`), or `null` if no target is set yet (picker mode pre-selection).                                    |
| `setTarget(target)`        | Programmatically change the target. Accepts the same shapes as `config.target` (excluding `"current"` and `"picker"` — those are config-time concepts). If the form is dirty, prompts the user before swapping. Returns `true` if the swap was applied, `false` if the user cancelled. |
| `isDirty()`                | Whether any field has unsaved edits.                                                                                                                                      |
| `reset()`                  | Discard local edits and re-seed inputs from the server-side state.                                                                                                        |
| `save()`                   | Trigger a save programmatically (same code path as clicking the Save button). Async — resolves when the save completes (or no-ops if nothing is dirty or validation fails). |

### Behavior

- **Target resolution.** The widget normalizes `config.target` into a canonical object (`{ kappSlug }`, `{ teamSlug }`, `{ kappSlug, categorySlug }`, `{ kappSlug, formSlug }`) on every render where the config changes. `"current"` (kapp only) expands through the surrounding `BundleContainer` / URL kapp; `"picker"` defers until the user picks one.
- **Picker as a styled form field.** When `target === "picker"`, the widget renders a `kd-`/DaisyUI-themed `<select>` at the top of its container. Options come from: `state.app.space.kapps` (preloaded) for the kapp picker; `state.app.kappCache[parent].categories` (preloaded) for the category picker; `bundle.refreshKappForms(parent)` (lazy, cached) for the form picker; `fetchTeams({ limit: 1000 })` for the team picker.
- **Discard-confirm on target swap.** Both the picker and the imperative `setTarget()` route through the same internal `requestTarget()`. When there are unsaved changes, the user is prompted via `window.confirm("You have unsaved changes. Discard them and switch?")`; cancel keeps the current target.
- **Diff-only save.** Only attributes the user actually edited are sent. Unchanged attributes are left untouched on the server.
- **Single Save button.** The button is disabled until the user edits at least one field. After a successful save, the form re-seeds against the response and dirty clears.
- **Per-type `include` policy.** Every update call passes `include` so the response carries `attributesMap` (or `profileAttributesMap` + dependents for userProfile), avoiding the stale-redux trap where shallow-merging an `include`-light response would leave the wrong values cached.
- **Repeating fields for multi-valued attributes.** One input per existing value plus an "Add another" button. Empty rows are not saved; clearing all rows clears the attribute.
- **Validation.** A `required` attribute must have at least one non-empty value (for multi-valued definitions, at least one row). Validation errors render under the offending field using the standard Kinetic form-field error style. Server errors surface as toasts; the form keeps its dirty state so the user can retry.

### Examples

#### Kapp attributes on a custom kapp-settings form (current kapp from URL)

```js
bundle.widgets.Attributes({
  container: K('content[Kapp Attrs]').element(),
  config: { type: 'kapp', target: 'current' },
  id: 'kapp-attrs',
});
```

When this form is rendered at `/kapps/services/...`, the widget edits the `services` kapp's attributes. Drop the same form inside a `BundleContainer` pointed at a different kapp and the widget follows the container's scope automatically.

#### Space attributes — singleton, no target needed

```js
bundle.widgets.Attributes({
  container: K('content[Space Attrs]').element(),
  config: { type: 'space' },
  id: 'space-attrs',
});
```

#### User profile attributes — equivalent of Profile's UPA section, but on its own

```js
bundle.widgets.Attributes({
  container: K('content[UPA]').element(),
  config: {
    type: 'userProfile',
    attributes: {
      exclude: ['SSO Subject'],
      entries: [
        { name: 'Phone', required: true },
        {
          name: 'Department',
          options: ['Engineering', 'Sales', 'Support'],
          allowOther: true,
        },
      ],
    },
  },
  id: 'upa',
});
```

#### Pick any form's attributes (picker scoped to the current kapp)

```js
bundle.widgets.Attributes({
  container: K('content[Form Attrs]').element(),
  config: {
    type: 'form',
    target: 'picker',
    parent: 'current',
    pickerLabel: 'Edit attributes for form',
  },
  id: 'form-attrs',
});
```

Drops a form picker at the top of the widget. The kapp scope follows whatever kapp the surrounding page is in — same `BundleContainer` / URL fallback as `target: 'current'`. Selecting a form loads its attributes; switching forms while edits are pending prompts the user before discarding.

#### Pick any team's attributes

```js
bundle.widgets.Attributes({
  container: K('content[Team Attrs]').element(),
  config: { type: 'team', target: 'picker' },
  id: 'team-attrs',
});
```

Teams aren't pre-loaded the way space / kapp data is, so the widget shows a `Loading…` picker for a moment on first render while it fetches the team list. Pagination beyond 1000 teams is not handled in v1.

#### Edit a specific category's attributes by explicit slug

```js
bundle.widgets.Attributes({
  container: K('content[Category Attrs]').element(),
  config: {
    type: 'category',
    target: { kappSlug: 'services', categorySlug: 'hr' },
    attributes: {
      entries: [
        { name: 'Icon', description: 'Icon name from the iconify set.' },
        { name: 'Sort Order', required: true },
      ],
    },
  },
  id: 'category-attrs',
});
```

#### Form-author-driven picker via the imperative API

```js
bundle.widgets
  .Attributes({
    container: K('content[Attrs]').element(),
    config: { type: 'form', target: { kappSlug: 'services', formSlug: 'simple-request' } },
    id: 'attrs',
  });

// Later, in a custom dropdown's onChange:
K('field[Form Picker]').on('change', e => {
  bundle.widgets.Attributes.get('attrs').setTarget({
    kappSlug: 'services',
    formSlug: e.target.value,
  });
});
```

Use this when the auto-rendered picker doesn't fit — e.g. you want a typeahead, a search modal, or a wizard driving the swap. The dirty-check confirm still runs, so the user is asked before discarding edits.

#### Grouped layout with section titles

```js
bundle.widgets.Attributes({
  container: K('content[Kapp Attrs]').element(),
  config: {
    type: 'kapp',
    target: 'current',
    order: [
      { groupTitle: 'Branding',  fields: ['Theme', 'Logo URL'] },
      { groupTitle: 'Behavior',  fields: ['Default Form Type', 'Search Enabled'] },
      { groupTitle: '',          fields: ['Internal Notes'] }, // headerless
    ],
  },
});
```

Anything not listed in any group falls into an implicit untitled group at the end, so a newly-added attribute definition never silently hides.

#### Restyle slots via classNames

```js
bundle.widgets.Attributes({
  container: K('content[Attrs]').element(),
  config: {
    type: 'kapp',
    target: 'current',
    classNames: {
      // ADD only.
      description: 'text-xs',
      // REMOVE + ADD — put Save on the left.
      saveButton: { add: 'self-start', remove: ['self-end'] },
      // Customize the picker styling.
      pickerLabel: 'font-semibold',
    },
  },
});
```

When you only need to add classes, use the string form. When you need to drop a default the widget would otherwise apply, use the object form's `remove` array. Removal is the more reliable customization tool — Tailwind's compile-time content scan doesn't see classes typed in form bundles, so overrides via new classes can silently no-op, but stripping unwanted defaults always works.

### Notes

- **Theme inheritance.** Fields render with the same `.field` / `.field.required` / `.has-error` classes that Kinetic forms use, so changes to the space (or kapp) theme apply to this widget without extra work.
- **Where definitions come from.** Attribute definitions for every supported type are preloaded into redux by the bulk space fetch — the widget doesn't issue a definitions request on mount. The exception is the picker's option list for team / form, which is lazy-loaded.
- **Where current values come from.** Space, userProfile, kapp, and category values are read from redux directly (the bulk space fetch includes them). Form and team values are fetched on demand (with `include: 'attributesMap'`) when the target changes; switching between forms / teams shows a brief `Loading…` state.
- **Category saves patch the cached category directly.** Categories live nested in `state.app.kappCache[kappSlug].categories` in redux. After a successful save the widget merges the response's `attributesMap` straight into the cached entry (via the `updateKappCategoryData` action) — no full kapp refresh needed.
- **`required` is widget-enforced.** The Kinetic platform doesn't have a "required" concept for any of these attributes. The widget's `required` flag is the form-author's contract with the user.
- **Unknown slot names warn and are ignored.** Same convention as Profile.
- **The widget does not refresh on permission denial.** A save attempt against a resource the user can't modify surfaces the server's 403 as an error toast. The widget doesn't pre-check permissions.
- **`bundle.widgets.Attributes` vs `bundle.widgets.Profile`.** Profile is the user-facing profile editor (core props + User Attribute display + User Profile Attribute editing). Attributes is the generalized attribute editor for *any* resource — including userProfile, when you want a standalone UPA editor without the Profile widget's core/User Attribute scaffolding. The two are complementary, not redundant.
