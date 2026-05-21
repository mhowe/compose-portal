[⬅ Back to Kinetic Form Widgets](README.md#available-widgets)

## Global Functions

Customer-defined JS functions stored as Kinetic submissions, compiled at bundle bootstrap, and exposed on `bundle.functions.<name>(...)` for use from any form's bundle code, any widget, or the browser console — no bundle rebuild required.

```js
// Call a registered function from form bundle code or a widget
bundle.functions.formatPersonName(profile);
```

### Where functions live

Each function is one submission on the `admin/global-functions` form.

| Field    | Type      | Required | Purpose                                                                                                                |
| -------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Name`   | text      | yes      | Identifier used as the key on `bundle.functions`. **Unique** (recommend a uniqueness index on the field).              |
| `Body`   | paragraph | yes      | The JS function body — the code between the implicit `{` and `}`. No `function () { … }` wrapper.                       |
| `Args`   | text      | no       | Comma-separated parameter list, e.g. `submission, ctx` or `name, locale`. Leave blank for `...args`.                    |
| `Status` | text      | yes      | Only rows with `Status = "Active"` are registered. Lets you stage / disable functions without deleting them.            |

The form is treated as a capability — if it doesn't exist in a space, `bundle.functions` stays empty and the bundle proceeds normally. No errors, no warnings.

### How they're loaded

At bootstrap, after login and after the space record is fetched, the bundle queries the form for `coreState = "Submitted" AND values[Status] = "Active"` (an indexed query — keep the compound index on `(coreState, Status)` in place), then for each submission compiles:

```js
new Function(...argList, body)
```

…and stashes the result on `window.bundle.functions[Name]`. The React private-route mount is gated on this completing, so any form bundle code can assume `bundle.functions.<name>` is defined when it runs. Per-function compile is isolated — a syntactically broken body logs the function name to the console and the rest of the registry still loads.

### Naming rules

`Name` becomes a key on `bundle.functions`, so it must be a valid JS identifier for dot-access (`bundle.functions.foo()`) to work.

**Recommended pattern (regex):**

```
^[A-Za-z_][A-Za-z0-9_]{0,63}$
```

- Must start with a letter or underscore.
- Letters, digits, and underscores only.
- 1–64 characters.

If you want to allow `$` in names (jQuery-style convention), use `^[A-Za-z_$][A-Za-z0-9_$]{0,63}$` instead — both still produce valid JS identifiers. Reserved words (`return`, `class`, etc.) technically work as object keys but read poorly; convention should rule them out, not the regex.

Put a uniqueness index on `Name` so two rows can't claim the same identifier. The loader's behavior on duplicates is last-write-wins, which is rarely what you want.

### Args field

The Args field is a comma-separated parameter list that becomes the function signature.

- `Args:` `submission, ctx` → `bundle.functions.fn(submission, ctx)`
- `Args:` `name` → `bundle.functions.fn(name)`
- `Args:` blank or missing → compiled as `(...args)`, so the body can grab whatever was passed via the rest array.

Validation pattern for the field (each entry must be a valid identifier):

```
^(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*(,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*)*)?$
```

### Examples

#### Mild — formatter with sensible fallbacks

`Name:` `formatPersonName`
`Args:` `profile`
`Body:`

```js
if (!profile) return '';
const first = profile.firstName || '';
const last = profile.lastName || '';
const full = `${first} ${last}`.trim();
return full || profile.displayName || profile.username || '';
```

Called as `bundle.functions.formatPersonName(profile)`.

#### Moderate — business-rule logic on a submission

`Name:` `shouldShowField`
`Args:` `submission, fieldName`
`Body:`

```js
const v = submission?.values || {};
const amount = Number(v['Amount']) || 0;
switch (fieldName) {
  case 'Manager Approval':    return amount > 500;
  case 'Executive Approval':  return amount > 5000;
  case 'CFO Approval':        return amount > 50000;
  default:                    return true;
}
```

Use from form bundle code:

```js
if (bundle.functions.shouldShowField(K(), 'Manager Approval')) {
  K('Manager Approval').show();
}
```

The thresholds live in one editable submission. Admins tune the rules without touching the form definition or the bundle.

#### Spicy — async lookup against the platform API

`Name:` `lookupManagerEmail`
`Args:` `username`
`Body:`

```js
return (async () => {
  if (!username) return null;
  const userUrl = `/app/api/v1/users/${encodeURIComponent(username)}?include=attributesMap`;
  const res = await fetch(userUrl, { credentials: 'include' });
  if (!res.ok) return null;
  const { user } = await res.json();
  const mgr = user?.attributesMap?.['Manager']?.[0];
  if (!mgr) return null;
  const mgrRes = await fetch(`/app/api/v1/users/${encodeURIComponent(mgr)}`, { credentials: 'include' });
  if (!mgrRes.ok) return null;
  const data = await mgrRes.json();
  return data?.user?.email || null;
})();
```

Called as `await bundle.functions.lookupManagerEmail('jdoe')`. Two API hops, error-tolerant, no bundle redeploy when the lookup shape changes.

### Advanced — nested helpers and cross-function calls

A function body is just a JS function body, so anything legal inside a function works — including defining inner helpers, closures, classes, and lookup tables:

```js
// Args: submission
const RULES = {
  amount:    v => Number(v) > 500,
  priority:  v => v === 'High' || v === 'Critical',
  approver:  v => Boolean(v && v.length),
};
const check = (field, fn) => {
  const value = submission?.values?.[field];
  return fn(value);
};
return Object.entries(RULES).every(([f, fn]) => check(f, fn));
```

You can also call other registry functions from inside a function — every entry lands on the same `bundle.functions` object, so order of compilation doesn't matter:

```js
// Args: submission
const name = bundle.functions.formatPersonName(submission?.values?.Requester);
const email = await bundle.functions.lookupManagerEmail(submission?.values?.Requester);
return { name, email };
```

This is "free" — the registry doesn't track dependencies. As long as the function you're calling exists at runtime, it works.

### Calling `K()` from a registry function

The form runtime exposes `K` as a global, so a registry function's body can reference `K(...)` directly — but **that global resolves to the outermost form's K context**. If your function is called from inside a Subform or any embedded form, a bare `K(...)` reference inside the body targets the parent form, not the embedded one. This is the kind of bug that "works" until the same function is reused inside a subform and silently reads the wrong field.

To reliably target the *calling* form's K context, pass `K` in as an explicit argument:

`Name:` `getFieldValue`
`Args:` `K, fieldName`
`Body:`

```js
const field = K('field[' + fieldName + ']');
return field ? field.value() : null;
```

From the form's bundle code:

```js
// `K` here is the calling form's own local K — passing it explicitly
// carries that scope into the registry function.
const email = bundle.functions.getFieldValue(K, 'Email');
```

Each form's bundle script gets its own local `K` bound to that form's context, so passing it as an argument is the only way to guarantee the function operates against the right form. The bare-global pattern is fine when the function will only ever run from a non-embedded form (or from a chrome widget / the browser console, where there is no `K` to inherit) — for anything that might be reused inside a subform, declare `K` in Args and pass it in.

### Async functions

The compile uses the regular `Function` constructor, so the body can't use top-level `await` directly. The convention is the IIFE-return-promise pattern shown in the spicy example: `return (async () => { … })();`. Callers `await` the returned promise. This keeps synchronous functions synchronous and lets async ones opt in per row.

### Trust model

Function bodies have full runtime access — same model as bundle-JS edits. Whoever can create or edit `global-functions` submissions in your space can execute arbitrary JS in every user's browser. Treat the form's CRUD permissions accordingly. The bundle does not sandbox the bodies, and there is no AST-level review of submitted code.

### Current limitations

These are intentional scope cuts on the POC; revisit when they hurt:

- No localStorage cache. Every page load re-fetches the registry.
- No management UI — the Kinetic submission console is the v1 editor.
- No per-function permissions or team scoping.
- No versioning beyond the standard submission audit trail.
- Template-engine integration (e.g. `{{function:name}}` in widget configs) is deferred; functions are reachable from form bundle code and widget code today.
