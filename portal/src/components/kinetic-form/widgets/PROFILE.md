[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Profile Widget

`Profile` renders an editable view of the logged-in user's profile, themed to look like Kinetic form fields so the surrounding form's styling carries through. The widget is designed to be dropped into a form used as the custom `/profile` page (see [`bundle-conventions/profile-page`](../../../../public/skills/bundle-conventions/profile-page.md) for the routing pattern), but it can be embedded anywhere a "let the user edit their profile" surface is needed.

```js
// Initialize the Profile widget
bundle.widgets.Profile({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Profile.get(id);
```

### Scope

This widget is the **profile editor only**. Avatar, password change, and logout are separate widgets (or future widgets) so each can be composed independently — installs that use SSO can skip the password widget entirely, for example.

What this widget renders today:

- **Core properties** — `displayName`, `email`, `preferredLocale`, `timezone`. Editable. Text inputs for displayName/email; **selects** for preferredLocale/timezone, each driven by a curated `values` list the designer provides. Per-field options (hide, readOnly, required, label override) apply to all four.
- **User Attributes** — system-controlled attributes on the user record (e.g. `Manager`, `Department`). Read-only display rows from an opt-in allow-list; the attribute definition's description is shown by default, with per-attribute override available. Each attribute can also have an optional **action** — a clickable affordance below the description (e.g. "Submit Change Request") using the shared [Chrome Widget Actions](CHROME_ACTIONS.md) system, so the target can be `current`, `new`, `modal`, or a named `BundleContainer`.
- **User Profile Attributes** — user-settable attributes defined on the space. Editable inputs, **default-show** with an optional exclude list. Multi-valued attributes (`allowsMultiple: true` on the definition) render as repeating rows with add/remove affordances. Per-attribute `options` config flips the input to a select; `allowOther: true` adds an "Other…" option that reveals a free-text input alongside.

Future phases add clickAction-aware description text on User Attributes and visual / Save-button customization.

### Parameters

**`container`** — *HTMLElement or array-like*  
The DOM element to render into. Accepts either a real `HTMLElement` or the array-like wrapper returned by `K('content[Name]').element()`.

**`config`** — *Object*  
All fields optional. Without any config, the widget shows `Display Name`, `Email`, and every User Profile Attribute defined on the space as editable inputs.

> **`core`** — *Object*  
> Per-core-property config keyed by property name. Recognized keys: `'displayName'`, `'email'`, `'preferredLocale'`, `'timezone'`. Each entry may set:
>
> - **`hide`** — *boolean* — Omit the field entirely. Use when SSO manages the value and you don't even want to surface it.
> - **`readOnly`** — *boolean* — Render the field but disable editing. Use when SSO manages the value but you want users to see what's on file.
> - **`required`** — *boolean* — Block save when the field is empty. This is enforced by the widget; the platform itself has no system-level required concept for these properties.
> - **`label`** — *string* — Override the default label (`'Display Name'`, `'Email'`, `'Language'`, `'Timezone'`).
>
> Additionally, `preferredLocale` and `timezone` accept:
>
> - **`values`** — *Array of (string | { value, label })* — The curated list of options to show in the select. Each entry can be a bare string (label = value) or `{ value, label }` for an explicit human-readable label. **Without `values`, the field hides entirely** — the widget intentionally refuses to default to a 700-option locale dropdown or the full IANA timezone list. If the user's current value isn't in the curated list, it's prepended to the dropdown as a `"<value> (current)"` option so they can see what's set without losing it on save.
>
> Locale codes follow Java's `Locale.getAvailableLocales()` convention — underscore-separated like `en_US`, `fr_FR`, `es_MX` (not BCP 47 hyphens). Timezone identifiers are IANA — `America/Denver`, `Europe/Paris`, `US/Central`. Entries that don't match the bundled canonical lists produce a console warning at widget initialization, but **still render** — validation is advisory, so a locale or timezone the bundle doesn't recognize won't break the widget.
>
> Unknown keys in `config.core` are warned about and ignored.
>
> **`userAttributes`** — *Array of Object*  
> Allow-list of User Attributes to display as read-only rows. Each entry: `{ name, label?, description?, action? }`.
>
> - **`name`** — *string, required* — The attribute name as it appears in the user's attribute map.
> - **`label`** — *string, optional* — Override the field label (default: the attribute name).
> - **`description`** — *string, optional* — Override the descriptive text shown beneath the field (default: the attribute definition's description from the space).
> - **`action`** — *Object, optional* — A clickable affordance rendered below the description, useful for "to change this, do X" workflows where the attribute is system-controlled. Shape: `{ label, clickAction, target? }`.
>   - **`label`** — *string, required* — Visible text on the button or link (e.g. `"Submit Change Request"`).
>   - **`clickAction`** — *Object, required* — Discriminated union, same shape as chrome widgets. See [Chrome Widget Actions → clickAction](CHROME_ACTIONS.md#clickaction). Supports `'internal'`, `'external'`, `'event'`, `'home'`, and `'openSearch'`. (`'none'` is treated as "no action" and the affordance won't render.)
>   - **`target`** — *string or Object, optional* — Where the action opens. See [Chrome Widget Actions → target](CHROME_ACTIONS.md#target). Defaults to `'current'`. Use `'modal'` for change-request forms, `{ type: 'container', id: '…' }` to render inline inside a `BundleContainer`.
>
> Default: empty array — no User Attributes are shown. This is **opt-in** by design: User Attributes are system-controlled and most installs don't want them all surfaced to the user.
>
> **`userProfileAttributes`** — *Object*  
> User Profile Attributes (editable) configuration. Two keys:
>
> - **`exclude`** — *Array of string, optional* — Attribute names to omit from the widget. By default, every User Profile Attribute defined on the space is rendered; use this list to suppress ones the user shouldn't edit on this surface (internal tokens, integration markers, etc.).
> - **`entries`** — *Array of Object, optional* — Per-attribute overrides. Each entry: `{ name, label?, description?, required?, options?, allowOther? }`.
>   - **`name`** — *string, required* — The attribute name.
>   - **`label`** — *string, optional* — Override the field label (default: the attribute definition name).
>   - **`description`** — *string, optional* — Override the descriptive text (default: the attribute definition's description).
>   - **`required`** — *boolean, optional* — Block save when the attribute has no non-empty value. Widget-enforced; the platform has no system-level required concept for User Profile Attributes.
>   - **`options`** — *Array of (string | { value, label }), optional* — When provided, the field renders as a `<select>` instead of a text input. Same shape as the core-select `values` lists from Phase 3: bare strings (label = value) or `{ value, label }` objects for explicit labels. A current value outside the option list is prepended as `"<value> (current)"` so it stays visible.
>   - **`allowOther`** — *boolean, optional* — Only meaningful alongside `options`. When true, the select appends an "Other…" option; selecting it reveals a free-text input below the select, letting the user enter a value outside the curated list. Without `options`, this flag is ignored with a warning.
>
> An attribute that is neither excluded nor entered renders with all defaults — definition name as label, definition description as helper text, not required, plain text input.
>
> Multi-valued attributes (`allowsMultiple: true` on the definition) automatically render as repeating fields — one input per existing value plus an "Add another" button. Empty rows are display-only; only non-empty values are saved. When an `options` list is configured, each row becomes its own select (with optional per-row "Other…" reveal when `allowOther: true`).
>
> **`order`** — *Array of string OR Array of Object*  
> Explicit render order. Two shapes accepted; pick one — don't mix.
>
> **Flat (current behavior).** An array of field keys: either a core property name (`'displayName'`, `'email'`, `'preferredLocale'`, `'timezone'`), a User Attribute name, or a User Profile Attribute name.
>
> ```js
> order: ['displayName', 'Manager', 'email', 'Phone']
> ```
>
> Fields listed render in the listed order. Fields **not** listed fall to alphabetical at the end, grouped by section (core first, then User Attributes, then User Profile Attributes). Useful for placing related fields adjacent regardless of section.
>
> **Grouped.** An array of group objects, each with a `groupTitle` and a `fields` array. Each group renders as a `<section>` containing an optional `<h3>` header followed by the group's fields. Use an empty `groupTitle` for a headerless group — useful when you want a visual section break without a label.
>
> ```js
> order: [
>   { groupTitle: 'Account',     fields: ['displayName', 'email'] },
>   { groupTitle: 'Preferences', fields: ['preferredLocale', 'timezone'] },
>   { groupTitle: '',            fields: ['Manager', 'Department'] }, // headerless
> ]
> ```
>
> Any field defined in the widget but not listed in any group falls into an implicit final untitled group (alphabetical within section) so "I forgot to mention this field" never silently hides anything.
>
> Unknown keys in `order` (flat) or in `order[].fields` (grouped) are silently skipped — they don't render, but they also don't error.
>
> **`classNames`** — *Object keyed by slot name*  
> Per-slot class overrides. Each value is one of two shapes:
>
> - **String** — additive. Concatenated on top of the widget's defaults (and any conditional extras like `required` / `has-error`).
> - **Object `{ add?: string, remove?: string[] }`** — surgical. `remove` first strips the listed class tokens from `defaults + conditional extras`; `add` then appends new classes. Use this when you need to drop a default the widget would otherwise apply.
>
> **When to use the object form's `remove`.** Adding a class works for any utility Tailwind has compiled — and the bundle compiles a large utility set via `@source inline(...)` safelists in `portal/src/index.css` plus the standard React-source scan. Most everyday utilities (margins, padding, colors, sizing, gap, flex, kbtn-*, kd-*, etc.) are reachable from form-designer bundle code. If you hit a class that doesn't seem to take effect, it's likely outside the safelist and not used in source — `remove` is the most direct alternative because it operates on the existing default string and doesn't depend on new CSS being generated.
>
> Convention: the bundle's chrome widgets use the singular `className` for whole-widget overrides; the Profile widget uses the **plural** `classNames` because it has too many distinct parts for a single string. Other widgets that grow slot-level customization should follow the same singular-vs-plural convention.
>
> Recognized slots:
>
> | Slot           | Default                                | What it styles                                                |
> | -------------- | -------------------------------------- | -------------------------------------------------------------- |
> | `container`    | `flex-c-st gap-6 w-full`               | The outer `<form>` element.                                    |
> | `group`        | `flex-c-st gap-6`                      | The `<section>` wrapping each ordered group of fields (always rendered; one untitled group when `order` is flat or omitted, multiple sections when `order` is grouped). |
> | `groupHeader`  | `text-base font-semibold text-base-content` | The `<h3>` rendered above a named group. Omitted when the group's `groupTitle` is empty. |
> | `field`        | `field`                                | Each field row's `<div>`. (The `required` / `has-error` modifiers are added per-render and aren't part of the default.) |
> | `label`        | _(empty)_                              | The `<label>` of each field.                                   |
> | `input`        | `min-w-48`                             | Every editable `<input>` (core text, UPA text, UPA Other text). |
> | `select`       | `min-w-48`                             | Every `<select>` (core select, UPA select).                    |
> | `description`  | `text-sm text-base-content/60`         | Helper-text `<p>` rendered under a field.                      |
> | `value`        | `text-base-content/90`                 | Read-only value display on a User Attribute row.               |
> | `action`       | `kbtn kbtn-ghost kbtn-sm self-start`   | The optional clickable action on a User Attribute (Phase 5).   |
> | `addAnother`   | `kbtn kbtn-ghost kbtn-xs self-start`   | The "Add another" button on multi-value UPAs.                  |
> | `removeRow`    | `kbtn kbtn-ghost kbtn-sm kbtn-circle`  | The per-row remove button on multi-value UPA rows.             |
> | `saveButton`   | `kbtn kbtn-primary self-end`           | The Save button at the bottom of the form.                     |
> | `error`        | `flex-sc gap-2 text-base-content/60`   | Inline error message under a field.                            |
>
> Unknown slot names produce a console warning and are ignored. Slot values must be strings (or omitted).

**`id`** — *string*  
Optional id used by the widget machinery for instance tracking.

### API

The widget exposes the standard `container()` and `destroy()` functions but no widget-specific API yet.

### Behavior

- **Single Save button.** The widget renders one Save button at the bottom of the form. It is disabled until the user changes at least one editable field.
- **Diff-only save.** Only the fields the user actually edited are sent to the server. Read-only fields and User Attributes are never sent. Changed User Profile Attributes are sent as a partial `profileAttributesMap` — unchanged keys are untouched on the server.
- **Repeating fields for multi-valued attributes.** The widget renders one input per existing value, with a remove button on each (except when only one row remains) and an "Add another" button. Empty rows are not saved; clearing all rows clears the attribute.
- **Validation.** Required fields must be non-empty; `email` must be a syntactically valid email when non-empty. Required for a multi-valued attribute means at least one non-empty value. Validation errors render under the offending field using the standard Kinetic form-field error style.
- **Server errors surface as toasts.** A failed update never silently discards user input — the form keeps its dirty state so the user can retry.
- **Success refreshes redux.** On a successful save the widget updates the redux profile so any other surface in the portal that reads `state.app.profile` (avatar, header user menu, etc.) reflects the change immediately.

### Examples

#### Default — every editable thing the space knows about

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  id: 'profile',
});
```

Renders `Display Name`, `Email`, and one input per User Profile Attribute defined on the space. No User Attributes.

#### SSO-managed install — core props locked, custom UPAs only

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    core: {
      displayName: { readOnly: true },
      email:       { hide: true },
    },
    userProfileAttributes: {
      // Suppress these — they're set programmatically by integrations.
      exclude: ['SSO Subject', 'External ID'],
      entries: [
        { name: 'Phone',                required: true },
        { name: 'Notification Channels' },  // multi-value definition → repeating
      ],
    },
  },
  id: 'profile',
});
```

#### Surface a User Attribute with explanatory text

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    userAttributes: [
      {
        name: 'Manager',
        description: 'Set by HR. To change, submit a Department Change request.',
      },
    ],
  },
  id: 'profile',
});
```

#### User Attribute with a "submit change request" modal action

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    userAttributes: [
      {
        name: 'Manager',
        description: 'Set by HR.',
        action: {
          label: 'Submit Manager Change Request',
          clickAction: {
            type: 'internal',
            path: '/kapps/services/forms/manager-change-request',
          },
          target: { type: 'modal', size: 'lg', title: 'Manager Change Request' },
        },
      },
      {
        name: 'Department',
        description: 'Determined by your team membership.',
        action: {
          label: 'Open HR Portal',
          clickAction: { type: 'external', url: 'https://hr.example.com/profile' },
          target: 'new',
        },
      },
    ],
  },
  id: 'profile',
});
```

The action button uses the [Chrome Widget Actions](CHROME_ACTIONS.md) system — anything those widgets can do, this can do. `clickAction.type: 'event'` lets the form's bundle script handle the click; `target: { type: 'container', id: '…' }` routes inline into a `BundleContainer` if you've embedded one on the same page.

#### Curated language + timezone selects

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    core: {
      preferredLocale: {
        values: [
          { value: 'en_US', label: 'English (United States)' },
          { value: 'en_GB', label: 'English (United Kingdom)' },
          { value: 'es_MX', label: 'Español (México)' },
          { value: 'fr_FR', label: 'Français (France)' },
          { value: 'de_DE', label: 'Deutsch (Deutschland)' },
        ],
        required: true,
      },
      timezone: {
        values: [
          'America/New_York',
          'America/Chicago',
          'America/Denver',
          'America/Los_Angeles',
          'Europe/London',
          'Europe/Paris',
          'Asia/Tokyo',
        ],
      },
    },
  },
  id: 'profile',
});
```

Curate the lists to match the audiences your portal actually serves — a global help desk might list every region; an internal HR app might list just the offices the company has. The widget will not default to "all available" because the canonical lists are far too large to be useful as a dropdown.

#### User Profile Attribute as a curated select

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    userProfileAttributes: {
      entries: [
        {
          name: 'Notification Method',
          options: ['Email', 'SMS', 'In-app', 'None'],
          required: true,
        },
      ],
    },
  },
  id: 'profile',
});
```

#### Curated select with "Other…" reveal

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    userProfileAttributes: {
      entries: [
        {
          name: 'Department',
          options: [
            { value: 'eng', label: 'Engineering' },
            { value: 'sales', label: 'Sales' },
            { value: 'support', label: 'Support' },
          ],
          allowOther: true,
        },
      ],
    },
  },
  id: 'profile',
});
```

A user whose Department is already `Operations` (outside the list) will land on the form in Other-mode for that field — the dropdown shows "Other…" selected and the text input below is pre-filled with `Operations`. They can switch to a listed option or keep typing.

#### Multi-valued select — repeating selects with optional "Other…"

If the underlying attribute definition is `allowsMultiple: true`, the field becomes a list of selects:

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    userProfileAttributes: {
      entries: [
        {
          name: 'Skills',
          options: ['Java', 'Python', 'TypeScript', 'Go', 'Rust'],
          allowOther: true,
        },
      ],
    },
  },
  id: 'profile',
});
```

Each row gets its own select with an independent Other-mode. The "Add another" button appends a new empty row.

#### Grouped layout with section titles

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    userAttributes: [
      { name: 'Manager' },
      { name: 'Department' },
    ],
    order: [
      { groupTitle: 'Account',     fields: ['displayName', 'email'] },
      { groupTitle: 'Preferences', fields: ['preferredLocale', 'timezone'] },
      { groupTitle: 'Organization', fields: ['Manager', 'Department'] },
      { groupTitle: '',            fields: ['Phone', 'Notification Method'] },
    ],
  },
  id: 'profile',
});
```

The first three groups render with their titles as section headers; the last renders as a headerless visual section break. Anything you don't list (e.g. a User Profile Attribute you forgot to mention) lands in an implicit untitled group at the end — never silently hidden.

#### Restyle slots via classNames

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    classNames: {
      // ADD only — append classes on top of the defaults.
      description: 'text-xs',

      // REMOVE + ADD — drop the default right-align and put the save
      // button on the left instead.
      saveButton: {
        add:    'self-start kbtn-lg',
        remove: ['self-end'],
      },

      // REMOVE only — strip the default button styling so the action
      // looks like plain text (the existing description sits next to it).
      action: {
        remove: ['kbtn', 'kbtn-ghost', 'kbtn-sm'],
        add:    'klink klink-primary',
      },
    },
  },
  id: 'profile',
});
```

When you only need to add classes, use the string form. When you need to drop a default the widget would otherwise apply, use the object form's `remove` array. Removal is the most reliable customization tool in this bundle — see the note above for why.

#### Interleave core and attribute fields via explicit order

```js
bundle.widgets.Profile({
  container: K('content[Profile]').element(),
  config: {
    core: {
      displayName: { required: true, label: 'Full Name' },
    },
    userAttributes: [
      { name: 'Manager' },
    ],
    userProfileAttributes: {
      entries: [
        { name: 'Phone', required: true },
      ],
    },
    order: ['displayName', 'Phone', 'email', 'Manager'],
  },
  id: 'profile',
});
```

### Notes

- **Theme inheritance.** Fields render with the same `.field` / `.field.required` / `.has-error` classes that Kinetic forms use, so changes to the space theme apply to this widget without any extra work.
- **`preferredLocale` / `timezone` are hidden by default.** Don't expect the widget to surface these unless you provide a curated `values` list. The full Java locale set (~700 entries) and IANA timezone set (~600 entries) are unfit as defaults; the widget bundles them only for advisory validation of designer-curated subsets.
- **Validation is advisory, not blocking.** A `values` entry that isn't in the bundled canonical list still renders. The warning helps catch typos but doesn't strand a designer whose deployment supports a locale the bundle hasn't been updated for.
- **`allowOther` without `options` is a no-op.** A UPA entry with `allowOther: true` but no `options` array warns and falls back to a plain text input — `allowOther` only makes sense alongside a curated list (it's the "but also let users enter their own" escape hatch). If you want a plain text input, just omit both.
- **Saving while in Other-mode.** The value sent to the server is whatever the user typed in the text input — no special marker. Just like Phase 1's diff-only behavior, an Other-mode value that matches an option's label is saved as that literal string; if it matches an existing curated option's `value`, that's also fine, but a future render would then snap the row back to the regular select. This is the desired behavior.
- **User Attribute actions are read-only-friendly.** The widget never sends User Attribute values to the server, so a `clickAction` that opens an edit form somewhere else is the *intended* way to let users update them. Don't try to use the action to mutate the user record directly — point it at a form, an external system, or an event handler that does the work.
- **`classNames` is plural; chrome widgets use singular `className`.** This is a deliberate convention: a chrome widget like `BundleAvatar` is *one* clickable thing and takes a single `className` for whole-widget override. The Profile widget has many distinct parts; the `classNames` plural reflects that it's a *map* of slot → classes. When new widgets grow slot-level customization in the future, follow the same convention.
- **User Attribute descriptions.** Default behavior pulls the description from the space's `userAttributeDefinitions`. If a definition has no description and no override is provided, the description row is omitted (no empty paragraph).
- **User Profile Attribute defaults.** The widget reads the space's `userProfileAttributeDefinitions` to know what exists and whether each attribute is multi-valued. Definitions need to be deployed before the widget can render their inputs — empty space, empty form.
- **Multi-valued User Attributes** display as a comma-separated read-only list. (User Attributes are never editable; the repeating-field UI is reserved for editable User Profile Attributes.)
- **`required` is widget-enforced.** The Kinetic platform doesn't have a "required" concept for core properties or User Profile Attributes. The widget's `required` flag is the form-author's contract with the user; the platform will accept an empty value if the widget doesn't block the save.
- **Cross-section key collisions warn and drop the later entry.** If a User Attribute and a User Profile Attribute share a name (rare), the widget keeps the first claim and warns in the console. Rename one to disambiguate.
- **Loops back on itself.** If your Profile-rendering form is reachable at `/profile` (via `Default Profile Form Slug`), don't add a link from inside the form back to `/profile` — it re-enters the resolver and loops. Link to `/`, `/kapps`, or wherever else makes sense for your portal.
