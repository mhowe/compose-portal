import { forwardRef, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import clsx from 'clsx';
import { updateProfile } from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { appActions } from '../../../helpers/state.js';
import { validateEmail } from '../../../helpers/index.js';
import { toastError, toastSuccess } from '../../../helpers/toasts.js';
import { Icon } from '../../../atoms/Icon.jsx';
import { isKnownLocale } from './profile-locales.js';
import { isKnownTimezone } from './profile-timezones.js';
import {
  ClickActionWrapper,
  useInternalLinkInterceptor,
  validateClickAction,
  validateTarget,
} from './chrome-utils.jsx';

// Core profile property keys this widget knows how to render. Text keys
// render as `<input>`; select keys render as `<select>` and require a
// curated `values` list to show at all.
const CORE_TEXT_KEYS = ['displayName', 'email'];
const CORE_SELECT_KEYS = ['preferredLocale', 'timezone'];
const CORE_KEYS = [...CORE_TEXT_KEYS, ...CORE_SELECT_KEYS];
const CORE_DEFAULT_LABELS = {
  displayName: 'Display Name',
  email: 'Email',
  preferredLocale: 'Language',
  timezone: 'Timezone',
};
// Validator per select key; consulted at config-time only to warn the
// designer about typos. Unknown values still render — validation is
// advisory, not blocking.
const SELECT_VALUE_VALIDATORS = {
  preferredLocale: isKnownLocale,
  timezone: isKnownTimezone,
};

// Section ranks for the alphabetical-fallback tiebreaker when a field
// isn't named in `config.order`. Lower wins.
const SECTION_RANK = {
  core: 0,
  userAttribute: 1,
  userProfileAttribute: 2,
};

// Normalizes a `values` config entry into a stable `{ value, label }`
// object. Accepts bare strings (label = value) and explicit
// `{ value, label? }` objects. Invalid entries are dropped silently —
// validateConfig has already warned about them.
const normalizeOption = entry => {
  if (typeof entry === 'string') return { value: entry, label: entry };
  if (entry && typeof entry === 'object' && typeof entry.value === 'string') {
    return {
      value: entry.value,
      label: typeof entry.label === 'string' ? entry.label : entry.value,
    };
  }
  return null;
};

const resolveCoreConfig = (key, caller = {}) => {
  const base = {
    hide: caller.hide === true,
    readOnly: caller.readOnly === true,
    required: caller.required === true,
    label: typeof caller.label === 'string' ? caller.label : CORE_DEFAULT_LABELS[key],
  };
  if (CORE_SELECT_KEYS.includes(key)) {
    const rawValues = Array.isArray(caller.values) ? caller.values : null;
    base.options = rawValues ? rawValues.map(normalizeOption).filter(Boolean) : [];
  }
  return base;
};

const resolveUserAttrConfig = (entry, definition) => {
  // The `action` config is the optional clickable affordance a form
  // designer can attach to an otherwise read-only User Attribute row
  // (e.g. "submit a change request" → opens a kapp form in a modal).
  // Shape: { label, clickAction, target? }. Reuses the CHROME_ACTIONS
  // system so target supports current/new/modal/container natively.
  let action = null;
  if (
    entry.action &&
    typeof entry.action === 'object' &&
    !Array.isArray(entry.action) &&
    typeof entry.action.label === 'string' &&
    entry.action.label !== '' &&
    entry.action.clickAction &&
    entry.action.clickAction.type &&
    entry.action.clickAction.type !== 'none'
  ) {
    action = {
      label: entry.action.label,
      clickAction: entry.action.clickAction,
      target: entry.action.target,
    };
  }
  return {
    name: entry.name,
    label: typeof entry.label === 'string' ? entry.label : entry.name,
    description:
      typeof entry.description === 'string'
        ? entry.description
        : definition?.description || '',
    action,
  };
};

// Sentinel value used inside <select> elements to mean "the user explicitly
// picked Other…". Lives only in the UI representation — the actual field
// state stores the free-text value the user types. Chosen to be unlikely
// to collide with any real attribute value.
const OTHER_SENTINEL = '__profile_widget_other__';

// Default classes for every styleable slot in the widget. Designers can
// layer additional classes onto any slot via `config.classNames[slot]`;
// the resolved className is `defaults + extras + designer overrides`,
// concatenated via clsx. Tailwind's specificity rules apply — designers
// who want to win against a default of `bg-base-100` write `bg-red-500`
// and it overrides naturally. The convention parallels the existing
// `config.className` singular on chrome widgets: those override the
// whole widget; this slot-keyed plural overrides specific parts.
const SLOT_DEFAULTS = {
  // The outer `<form>` element. Lays out children in a column with gap.
  container: 'flex-c-st gap-6 w-full',
  // Each field row (`.field` div wrapping label, input, description, etc.).
  // The `required` / `has-error` modifier classes are added per-render
  // and aren't part of the slot default.
  field: 'field',
  // The `<label>` element of each field. Default empty — Kinetic's
  // `.field label { ... }` CSS already styles labels via the parent.
  label: '',
  // Every editable `<input>` element (core text, UPA text, UPA Other).
  // Sets the default minimum width so fields don't squish in narrow
  // containers. `kinput w-full` is added by `.field input` CSS already.
  input: 'min-w-48',
  // Every `<select>` element (core select, UPA select). Same min width.
  select: 'min-w-48',
  // Descriptive helper text rendered under a field.
  description: 'text-sm text-base-content/60',
  // The optional action button on a User Attribute row (Phase 5).
  action: 'kbtn kbtn-ghost kbtn-sm self-start',
  // Read-only value display for a User Attribute (the value, not a
  // form input).
  value: 'text-base-content/90',
  // "Add another" button on multi-value User Profile Attribute fields.
  addAnother: 'kbtn kbtn-ghost kbtn-xs self-start',
  // Per-row remove button on multi-value rows.
  removeRow: 'kbtn kbtn-ghost kbtn-sm kbtn-circle',
  // The Save button at the bottom of the form.
  saveButton: 'kbtn kbtn-primary self-end',
  // Inline error message under a field.
  error: 'flex-sc gap-2 text-base-content/60',
  // The `<section>` wrapping each ordered group of fields. Mirrors the
  // container's column-with-gap so inter-field spacing inside a group
  // matches the spacing the widget had before grouping was introduced.
  group: 'flex-c-st gap-6',
  // The `<h3>` title rendered above a named group (omitted when the
  // group's title is empty — that's the "headerless group / visual
  // section break" case).
  groupHeader: 'text-base font-semibold text-base-content',
};

const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

const resolveUserProfileAttrConfig = (entry, definition) => {
  const rawOptions = Array.isArray(entry?.options) ? entry.options : null;
  const options = rawOptions
    ? rawOptions.map(normalizeOption).filter(Boolean)
    : [];
  return {
    name: definition.name,
    label: typeof entry?.label === 'string' ? entry.label : definition.name,
    description:
      typeof entry?.description === 'string'
        ? entry.description
        : definition?.description || '',
    required: entry?.required === true,
    multi: definition?.allowsMultiple === true,
    options,
    allowOther: entry?.allowOther === true,
    kind: options.length > 0 ? 'select' : 'text',
  };
};

// For a UPA select with allowOther, compute the per-row Other-mode flags
// seeded from the user's current values. A value that's non-empty and
// outside the options list (and allowOther is on) starts in Other-mode
// so the user sees a populated text input on first render rather than
// a broken-looking dropdown.
const seedOtherStates = (fields, valueMap) => {
  const result = {};
  for (const f of fields) {
    if (
      f.section !== 'userProfileAttribute' ||
      f.kind !== 'select' ||
      !f.allowOther
    ) {
      continue;
    }
    const arr = valueMap[f.key] ?? [];
    const optionValues = new Set(f.options.map(o => o.value));
    result[f.key] = arr.map(v => v !== '' && !optionValues.has(v));
  }
  return result;
};

const sortBySection = (a, b) => {
  const sa = SECTION_RANK[a.section] ?? 99;
  const sb = SECTION_RANK[b.section] ?? 99;
  if (sa !== sb) return sa - sb;
  return a.label.localeCompare(b.label);
};

const buildRenderOrder = (fields, explicitOrder) => {
  const lookup = new Map(fields.map(f => [f.key, f]));
  const used = new Set();
  const ordered = [];

  if (Array.isArray(explicitOrder)) {
    for (const key of explicitOrder) {
      const field = lookup.get(key);
      if (field && !used.has(field.key)) {
        ordered.push(field);
        used.add(field.key);
      }
    }
  }

  const remaining = fields.filter(f => !used.has(f.key)).sort(sortBySection);
  return [...ordered, ...remaining];
};

// Normalizes `config.order` into a list of groups for rendering. Each
// group: `{ groupTitle: string, fields: [resolvedField...] }`.
//
// Three shapes of `config.order` are accepted:
//   - undefined / empty array  → one untitled group, alphabetical fallback
//   - array of strings (flat)  → one untitled group, listed-then-alphabetical
//   - array of group objects   → multiple groups
//
// In grouped mode, fields the designer didn't list anywhere fall into
// an implicit final untitled group (alphabetical within section), so
// "you forgot to mention this field" never silently hides it.
const buildGroups = (fields, explicitOrder) => {
  // Flat / unspecified — wrap the existing flat-order logic in a single
  // untitled group so the renderer can use the same shape uniformly.
  if (!Array.isArray(explicitOrder) || explicitOrder.length === 0) {
    return [{ groupTitle: '', fields: buildRenderOrder(fields, undefined) }];
  }
  if (typeof explicitOrder[0] === 'string') {
    return [{ groupTitle: '', fields: buildRenderOrder(fields, explicitOrder) }];
  }

  // Grouped mode. Walk each group's `fields` array, claim matching
  // resolved-field objects, leftover at the end.
  const lookup = new Map(fields.map(f => [f.key, f]));
  const used = new Set();
  const groups = [];
  for (const group of explicitOrder) {
    if (!group || typeof group !== 'object') continue;
    const groupFields = [];
    if (Array.isArray(group.fields)) {
      for (const key of group.fields) {
        const field = lookup.get(key);
        if (field && !used.has(field.key)) {
          groupFields.push(field);
          used.add(field.key);
        }
      }
    }
    // A group with a title but no resolved fields still renders an
    // empty section (the title is meaningful on its own — designer's
    // call). A group with no title AND no fields is dropped silently.
    if (groupFields.length === 0 && (!group.groupTitle || group.groupTitle === '')) {
      continue;
    }
    groups.push({
      groupTitle: typeof group.groupTitle === 'string' ? group.groupTitle : '',
      fields: groupFields,
    });
  }
  const unlisted = fields.filter(f => !used.has(f.key)).sort(sortBySection);
  if (unlisted.length > 0) {
    groups.push({ groupTitle: '', fields: unlisted });
  }
  return groups;
};

const filterValues = arr => arr.map(s => s.trim()).filter(s => s !== '');

const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

// Returns the option list to render in a core-select field, prepending
// the current value as an option when it isn't already in the curated
// list — so a user whose `preferredLocale` is `de_AT` but the designer
// curated `['en_US', 'es_MX']` still sees their current value selected
// rather than being silently switched.
const optionsForRender = (options, currentValue) => {
  if (!currentValue) return options;
  if (options.some(o => o.value === currentValue)) return options;
  return [{ value: currentValue, label: `${currentValue} (current)` }, ...options];
};

const ProfileContent = ({ id, config = {} }) => {
  const profile = useSelector(state => state.app?.profile);
  const space = useSelector(state => state.app?.space);
  // Catches internal-link clicks inside the widget's React root and
  // routes them through `window.location.hash` so the parent app's
  // top-level router picks them up — without this, a clickAction with
  // type 'internal' would only navigate the widget's own HashRouter.
  const onClickCapture = useInternalLinkInterceptor();

  // Slot-class helper. Resolves `slot` against the widget defaults plus
  // any conditional extras the caller passes in, then applies the
  // designer's `config.classNames[slot]` override.
  //
  // The override can be either:
  //   - A string  → simple additive layering (clsx-style concat).
  //   - An object `{ add?: string, remove?: string[] }` → first filter
  //     the listed class tokens out of (defaults + extras), then
  //     append `add`. Removal is what makes restyling reliable for
  //     form designers: Tailwind's compile-time content scan doesn't
  //     see classes a designer types in their Kinetic form bundle, so
  //     overrides via new classes can silently no-op; removing an
  //     unwanted default token is pure string surgery and always
  //     works regardless of what's in the compiled CSS.
  const cn = (slot, ...extra) => {
    const base = clsx(SLOT_DEFAULTS[slot], ...extra);
    const override = config.classNames?.[slot];
    if (override == null) return base;
    if (typeof override === 'string') return clsx(base, override);
    // Object form { add?, remove? }
    const removeList = Array.isArray(override.remove) ? override.remove : null;
    const filtered = removeList && removeList.length > 0
      ? base.split(/\s+/).filter(t => t && !removeList.includes(t)).join(' ')
      : base;
    return clsx(filtered, override.add);
  };

  const { fields, initialValues } = useMemo(() => {
    const out = [];
    const initial = {};
    const seenKeys = new Map();

    const claim = (key, field) => {
      if (seenKeys.has(key)) {
        const existing = seenKeys.get(key);
        console.warn(
          `Profile Widget Warning: field key "${key}" is shared between ${existing.section} and ${field.section}. The ${existing.section} entry wins; the later entry is dropped. Rename to disambiguate.`,
        );
        return false;
      }
      seenKeys.set(key, field);
      return true;
    };

    const callerCore = config.core || {};
    for (const key of CORE_KEYS) {
      const c = resolveCoreConfig(key, callerCore[key]);
      if (c.hide) continue;
      // Select-type core props are hidden when no curated values are
      // supplied. Forms that need every locale or timezone should
      // either provide an exhaustive list or surface the field via a
      // separate mechanism — the widget intentionally won't surface a
      // 600-option dropdown by default.
      if (CORE_SELECT_KEYS.includes(key) && c.options.length === 0) continue;
      const field = {
        key,
        section: 'core',
        label: c.label,
        readOnly: c.readOnly,
        required: c.required,
      };
      if (CORE_SELECT_KEYS.includes(key)) {
        field.kind = 'select';
        field.options = c.options;
      } else {
        field.kind = 'text';
      }
      if (!claim(key, field)) continue;
      out.push(field);
      initial[key] = profile?.[key] ?? '';
    }

    const userAttrDefs = space?.userAttributeDefinitions || [];
    const userAttrEntries = Array.isArray(config.userAttributes)
      ? config.userAttributes
      : [];
    for (const entry of userAttrEntries) {
      if (!entry || typeof entry.name !== 'string') continue;
      const def = userAttrDefs.find(d => d.name === entry.name);
      const c = resolveUserAttrConfig(entry, def);
      const field = {
        key: entry.name,
        section: 'userAttribute',
        attributeName: entry.name,
        label: c.label,
        description: c.description,
        action: c.action,
        readOnly: true,
        required: false,
      };
      if (!claim(entry.name, field)) continue;
      out.push(field);
      const values = profile?.attributesMap?.[entry.name] || [];
      initial[entry.name] = values.join(', ');
    }

    const upaDefs = space?.userProfileAttributeDefinitions || [];
    const upaCaller = config.userProfileAttributes || {};
    const excludeList = Array.isArray(upaCaller.exclude)
      ? new Set(upaCaller.exclude)
      : new Set();
    const upaEntries = Array.isArray(upaCaller.entries)
      ? upaCaller.entries
      : [];
    const upaEntryByName = new Map(
      upaEntries.filter(e => e && typeof e.name === 'string').map(e => [e.name, e]),
    );

    for (const def of upaDefs) {
      if (excludeList.has(def.name)) continue;
      const entry = upaEntryByName.get(def.name);
      const c = resolveUserProfileAttrConfig(entry, def);
      const field = {
        key: def.name,
        section: 'userProfileAttribute',
        attributeName: def.name,
        label: c.label,
        description: c.description,
        readOnly: false,
        required: c.required,
        multi: c.multi,
        kind: c.kind,
        options: c.options,
        allowOther: c.allowOther,
      };
      if (!claim(def.name, field)) continue;
      out.push(field);
      const arr = profile?.profileAttributesMap?.[def.name] || [];
      initial[def.name] = [...arr];
    }

    return { fields: out, initialValues: initial };
  }, [config, profile, space]);

  // Groups for rendering. A flat config.order produces a single
  // untitled group; a grouped config.order produces one section per
  // group. `renderOrder` is the flat list across all groups, used for
  // dirty tracking, validation, and the diff-only save payload — the
  // grouping is purely a render-time concern.
  const groups = useMemo(
    () => buildGroups(fields, config.order),
    [fields, config.order],
  );
  const renderOrder = useMemo(
    () => groups.flatMap(g => g.fields),
    [groups],
  );

  const [values, setValues] = useState(initialValues);
  const [otherStates, setOtherStates] = useState(() =>
    seedOtherStates(fields, initialValues),
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const seededKey = useRef(JSON.stringify(initialValues));
  const currentKey = JSON.stringify(initialValues);
  if (seededKey.current !== currentKey) {
    seededKey.current = currentKey;
    setValues(initialValues);
    setOtherStates(seedOtherStates(fields, initialValues));
    setErrors({});
  }

  const isFieldDirty = f => {
    if (f.readOnly) return false;
    if (f.section === 'userProfileAttribute') {
      const cur = filterValues(values[f.key] ?? []);
      const init = filterValues(initialValues[f.key] ?? []);
      return !arraysEqual(cur, init);
    }
    return (values[f.key] ?? '') !== (initialValues[f.key] ?? '');
  };

  const dirty = renderOrder.some(isFieldDirty);

  const validate = () => {
    const next = {};
    for (const f of renderOrder) {
      if (f.readOnly) continue;
      if (f.section === 'userProfileAttribute') {
        if (f.required && filterValues(values[f.key] ?? []).length === 0) {
          next[f.key] = `${f.label} is required.`;
        }
        continue;
      }
      const v = values[f.key] ?? '';
      if (f.required && v.trim() === '') {
        next[f.key] = `${f.label} is required.`;
        continue;
      }
      if (f.key === 'email' && v && !validateEmail(v)) {
        next[f.key] = 'Invalid email format.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async e => {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;

    const profilePayload = {};
    const upaPayload = {};
    for (const f of renderOrder) {
      if (!isFieldDirty(f)) continue;
      if (f.section === 'core') {
        profilePayload[f.key] = values[f.key] ?? '';
      } else if (f.section === 'userProfileAttribute') {
        upaPayload[f.attributeName] = filterValues(values[f.key] ?? []);
      }
    }
    if (Object.keys(upaPayload).length > 0) {
      profilePayload.profileAttributesMap = upaPayload;
    }
    if (Object.keys(profilePayload).length === 0) return;

    setSaving(true);
    try {
      // Mirror the App.jsx fetchProfile include list so the response is a
      // complete profile — otherwise the API omits profileAttributesMap and
      // attributesMap, the shallow merge into redux keeps the *old* values,
      // and the widget reseeds with stale data on remount.
      const { error, profile: updated } = await updateProfile({
        profile: profilePayload,
        include: 'profileAttributesMap,attributesMap,memberships',
      });
      if (error) {
        toastError({
          title: 'Profile update failed.',
          description: error.message || 'Please try again.',
        });
      } else {
        appActions.updateProfile(updated);
        toastSuccess({ title: 'Your profile has been updated.' });
      }
    } catch (err) {
      toastError({
        title: 'Profile update failed.',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <form
      className={cn('container')}
      onSubmit={save}
      onClickCapture={onClickCapture}
    >
      {groups.map((group, gi) => (
        <section key={gi} className={cn('group')}>
          {group.groupTitle && (
            <h3 className={cn('groupHeader')}>{group.groupTitle}</h3>
          )}
          {group.fields.map(f => {
        const error = errors[f.key];

        if (f.section === 'userAttribute') {
          const value = values[f.key] ?? '';
          return (
            <div key={f.key} className={cn('field')}>
              <label className={cn('label')}>{f.label}</label>
              <div className={cn('value')}>{value || '—'}</div>
              {f.description && (
                <p className={cn('description')}>{f.description}</p>
              )}
              {f.action && (
                <ClickActionWrapper
                  clickAction={f.action.clickAction}
                  target={f.action.target}
                  label={f.action.label}
                  widgetName="Profile"
                  instanceId={id}
                  className={cn('action')}
                >
                  <span>{f.action.label}</span>
                </ClickActionWrapper>
              )}
            </div>
          );
        }

        if (f.section === 'userProfileAttribute') {
          const stateValues = values[f.key] ?? [];
          const displayValues =
            f.multi
              ? stateValues.length === 0
                ? ['']
                : stateValues
              : [stateValues[0] ?? ''];

          const setRow = (i, v) =>
            setValues(prev => {
              const arr = [...(prev[f.key] ?? [])];
              while (arr.length <= i) arr.push('');
              arr[i] = v;
              return { ...prev, [f.key]: arr };
            });
          const setOther = (i, on) =>
            setOtherStates(prev => {
              const arr = [...(prev[f.key] ?? [])];
              while (arr.length <= i) arr.push(false);
              arr[i] = on;
              return { ...prev, [f.key]: arr };
            });
          const removeRow = i => {
            setValues(prev => {
              const arr = [...(prev[f.key] ?? [])];
              arr.splice(i, 1);
              return { ...prev, [f.key]: arr };
            });
            setOtherStates(prev => {
              const arr = [...(prev[f.key] ?? [])];
              arr.splice(i, 1);
              return { ...prev, [f.key]: arr };
            });
          };
          const addRow = () => {
            setValues(prev => {
              const arr = [...(prev[f.key] ?? [])];
              arr.push('');
              return { ...prev, [f.key]: arr };
            });
            setOtherStates(prev => {
              const arr = [...(prev[f.key] ?? [])];
              arr.push(false);
              return { ...prev, [f.key]: arr };
            });
          };

          const inputId = `profile-${f.key}`;
          const isSelect = f.kind === 'select';

          const handleSelectChange = (i, newValue) => {
            if (newValue === OTHER_SENTINEL) {
              // Entering Other mode for this row. Clear the value so
              // the freshly revealed text input starts empty rather
              // than holding a stale option value.
              setOther(i, true);
              setRow(i, '');
            } else {
              setOther(i, false);
              setRow(i, newValue);
            }
          };

          return (
            <div
              key={f.key}
              className={cn('field', {
                required: f.required,
                'has-error': !!error,
              })}
            >
              <label
                className={cn('label')}
                htmlFor={f.multi ? undefined : inputId}
              >
                {f.label}
              </label>
              {/* Wrap rows in a flex column with gap so repeating rows
                  (especially Other-mode rows that stack a select on top
                  of a text input) don't run into each other. */}
              <div className="flex-c-st gap-2">
              {displayValues.map((v, i) => {
                if (!isSelect) {
                  return (
                    <div key={i} className={f.multi ? 'flex-sc gap-2' : undefined}>
                      <input
                        id={f.multi ? undefined : inputId}
                        type="text"
                        className={cn('input')}
                        value={v}
                        required={f.required && !f.multi}
                        onChange={e => setRow(i, e.target.value)}
                      />
                      {f.multi && displayValues.length > 1 && (
                        <button
                          type="button"
                          className={cn('removeRow')}
                          onClick={() => removeRow(i)}
                          aria-label={`Remove ${f.label} entry`}
                        >
                          <Icon name="x" />
                        </button>
                      )}
                    </div>
                  );
                }

                // Select-mode rendering. Other-mode is tracked
                // explicitly (otherStates) so that a row the user
                // *just* switched to Other but hasn't typed in yet
                // still shows the text input.
                const inOther = otherStates[f.key]?.[i] === true;
                // When not in explicit Other-mode, a non-empty value
                // outside the curated list keeps the field readable by
                // prepending it as a `(current)` option.
                const opts = inOther ? f.options : optionsForRender(f.options, v);
                const selectValue = inOther ? OTHER_SENTINEL : v;
                return (
                  <div key={i} className="flex-c-st gap-2">
                    <div className={f.multi ? 'flex-sc gap-2' : undefined}>
                      <select
                        id={!f.multi && i === 0 ? inputId : undefined}
                        className={cn('select')}
                        value={selectValue}
                        required={f.required && !f.multi}
                        onChange={e => handleSelectChange(i, e.target.value)}
                      >
                        {!f.required && <option value="">—</option>}
                        {opts.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                        {f.allowOther && (
                          <option value={OTHER_SENTINEL}>Other…</option>
                        )}
                      </select>
                      {f.multi && displayValues.length > 1 && (
                        <button
                          type="button"
                          className={cn('removeRow')}
                          onClick={() => removeRow(i)}
                          aria-label={`Remove ${f.label} entry`}
                        >
                          <Icon name="x" />
                        </button>
                      )}
                    </div>
                    {inOther && (
                      <input
                        type="text"
                        className={cn('input')}
                        value={v}
                        placeholder={`Enter ${f.label.toLowerCase()}`}
                        aria-label={`${f.label} custom value`}
                        onChange={e => setRow(i, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
              </div>
              {f.multi && (
                <button
                  type="button"
                  className={cn('addAnother')}
                  onClick={addRow}
                >
                  <Icon name="plus" />
                  Add another
                </button>
              )}
              {f.description && (
                <p className={cn('description')}>{f.description}</p>
              )}
              {error && (
                <p className={cn('error')}>
                  <span className="kstatus kstatus-error"></span>
                  {error}
                </p>
              )}
            </div>
          );
        }

        // section === 'core'
        const value = values[f.key] ?? '';

        if (f.kind === 'select') {
          const opts = optionsForRender(f.options, value);
          return (
            <div
              key={f.key}
              className={cn('field', {
                required: f.required,
                'has-error': !!error,
              })}
            >
              <label className={cn('label')} htmlFor={`profile-${f.key}`}>
                {f.label}
              </label>
              <select
                id={`profile-${f.key}`}
                name={f.key}
                className={cn('select')}
                value={value}
                disabled={f.readOnly}
                required={f.required}
                onChange={e =>
                  setValues(prev => ({ ...prev, [f.key]: e.target.value }))
                }
              >
                {!f.required && <option value="">—</option>}
                {opts.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {error && (
                <p className={cn('error')}>
                  <span className="kstatus kstatus-error"></span>
                  {error}
                </p>
              )}
            </div>
          );
        }

        return (
          <div
            key={f.key}
            className={cn('field', {
              required: f.required,
              'has-error': !!error,
            })}
          >
            <label className={cn('label')} htmlFor={`profile-${f.key}`}>
              {f.label}
            </label>
            <input
              id={`profile-${f.key}`}
              type="text"
              name={f.key}
              className={cn('input')}
              value={value}
              readOnly={f.readOnly}
              disabled={f.readOnly}
              required={f.required}
              onChange={e =>
                setValues(prev => ({ ...prev, [f.key]: e.target.value }))
              }
            />
            {error && (
              <p className={cn('error')}>
                <span className="kstatus kstatus-error"></span>
                {error}
              </p>
            )}
          </div>
        );
      })}
        </section>
      ))}

      <button
        type="submit"
        className={cn('saveButton')}
        disabled={!dirty || saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
};

const ProfileComponent = forwardRef(({ id, config }, ref) => {
  const api = useRef({});

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={api.current}>
        <ProfileContent id={id} config={config} />
      </WidgetAPI>
    </Provider>
  );
});

const validateValuesEntry = (entry, widgetName, path) => {
  if (typeof entry === 'string') return { ok: true, value: entry };
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    if (typeof entry.value !== 'string' || entry.value === '') {
      console.error(
        `${widgetName} Widget Error: ${path} object entries must have a non-empty string "value".`,
      );
      return { ok: false };
    }
    if (entry.label != null && typeof entry.label !== 'string') {
      console.error(
        `${widgetName} Widget Error: ${path} object entry "label" must be a string when provided.`,
      );
      return { ok: false };
    }
    return { ok: true, value: entry.value };
  }
  console.error(
    `${widgetName} Widget Error: ${path} entries must be strings or { value, label? } objects.`,
  );
  return { ok: false };
};

const validateCoreConfig = (core, widgetName) => {
  if (core == null) return true;
  if (typeof core !== 'object' || Array.isArray(core)) {
    console.error(`${widgetName} Widget Error: config.core must be an object.`);
    return false;
  }
  for (const [key, entry] of Object.entries(core)) {
    if (!CORE_KEYS.includes(key)) {
      console.warn(
        `${widgetName} Widget Warning: config.core.${key} is not a recognized core property (expected one of ${CORE_KEYS.join(', ')}). The entry is ignored.`,
      );
      continue;
    }
    if (entry == null) continue;
    if (typeof entry !== 'object' || Array.isArray(entry)) {
      console.error(
        `${widgetName} Widget Error: config.core.${key} must be an object.`,
      );
      return false;
    }
    if (entry.label != null && typeof entry.label !== 'string') {
      console.error(
        `${widgetName} Widget Error: config.core.${key}.label must be a string.`,
      );
      return false;
    }
    if (entry.values != null) {
      if (!CORE_SELECT_KEYS.includes(key)) {
        console.warn(
          `${widgetName} Widget Warning: config.core.${key}.values is ignored — only ${CORE_SELECT_KEYS.join(' and ')} render as selects.`,
        );
        continue;
      }
      if (!Array.isArray(entry.values)) {
        console.error(
          `${widgetName} Widget Error: config.core.${key}.values must be an array.`,
        );
        return false;
      }
      const validator = SELECT_VALUE_VALIDATORS[key];
      for (const v of entry.values) {
        const check = validateValuesEntry(
          v,
          widgetName,
          `config.core.${key}.values[]`,
        );
        if (!check.ok) return false;
        if (validator && !validator(check.value)) {
          console.warn(
            `${widgetName} Widget Warning: config.core.${key}.values entry "${check.value}" is not in the bundled canonical list. The entry still renders, but check for a typo.`,
          );
        }
      }
    }
  }
  return true;
};

const validateUserAttributes = (userAttributes, widgetName) => {
  if (userAttributes == null) return true;
  if (!Array.isArray(userAttributes)) {
    console.error(
      `${widgetName} Widget Error: config.userAttributes must be an array.`,
    );
    return false;
  }
  const seen = new Set();
  for (const entry of userAttributes) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      console.error(
        `${widgetName} Widget Error: each config.userAttributes entry must be an object.`,
      );
      return false;
    }
    if (typeof entry.name !== 'string' || entry.name === '') {
      console.error(
        `${widgetName} Widget Error: each config.userAttributes entry must have a non-empty string "name".`,
      );
      return false;
    }
    if (seen.has(entry.name)) {
      console.warn(
        `${widgetName} Widget Warning: config.userAttributes contains a duplicate entry for "${entry.name}"; the first wins.`,
      );
    }
    seen.add(entry.name);
    if (entry.label != null && typeof entry.label !== 'string') {
      console.error(
        `${widgetName} Widget Error: config.userAttributes[].label must be a string when provided.`,
      );
      return false;
    }
    if (entry.description != null && typeof entry.description !== 'string') {
      console.error(
        `${widgetName} Widget Error: config.userAttributes[].description must be a string when provided.`,
      );
      return false;
    }
    if (entry.action != null) {
      if (
        typeof entry.action !== 'object' ||
        Array.isArray(entry.action)
      ) {
        console.error(
          `${widgetName} Widget Error: config.userAttributes[].action must be an object with { label, clickAction, target? }.`,
        );
        return false;
      }
      if (typeof entry.action.label !== 'string' || entry.action.label === '') {
        console.error(
          `${widgetName} Widget Error: config.userAttributes[].action.label must be a non-empty string.`,
        );
        return false;
      }
      if (!validateClickAction(entry.action.clickAction, widgetName)) {
        return false;
      }
      if (entry.action.target != null && !validateTarget(entry.action.target, widgetName)) {
        return false;
      }
    }
  }
  return true;
};

const validateUserProfileAttributes = (upa, widgetName) => {
  if (upa == null) return true;
  if (typeof upa !== 'object' || Array.isArray(upa)) {
    console.error(
      `${widgetName} Widget Error: config.userProfileAttributes must be an object with optional "exclude" and "entries" keys.`,
    );
    return false;
  }
  if (upa.exclude != null) {
    if (!Array.isArray(upa.exclude) || !upa.exclude.every(s => typeof s === 'string')) {
      console.error(
        `${widgetName} Widget Error: config.userProfileAttributes.exclude must be an array of strings.`,
      );
      return false;
    }
  }
  if (upa.entries != null) {
    if (!Array.isArray(upa.entries)) {
      console.error(
        `${widgetName} Widget Error: config.userProfileAttributes.entries must be an array.`,
      );
      return false;
    }
    const seen = new Set();
    for (const entry of upa.entries) {
      if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
        console.error(
          `${widgetName} Widget Error: each config.userProfileAttributes.entries entry must be an object.`,
        );
        return false;
      }
      if (typeof entry.name !== 'string' || entry.name === '') {
        console.error(
          `${widgetName} Widget Error: each config.userProfileAttributes.entries entry must have a non-empty string "name".`,
        );
        return false;
      }
      if (seen.has(entry.name)) {
        console.warn(
          `${widgetName} Widget Warning: config.userProfileAttributes.entries has a duplicate for "${entry.name}"; the first wins.`,
        );
      }
      seen.add(entry.name);
      if (entry.label != null && typeof entry.label !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.userProfileAttributes.entries[].label must be a string when provided.`,
        );
        return false;
      }
      if (entry.description != null && typeof entry.description !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.userProfileAttributes.entries[].description must be a string when provided.`,
        );
        return false;
      }
      if (entry.options != null) {
        if (!Array.isArray(entry.options)) {
          console.error(
            `${widgetName} Widget Error: config.userProfileAttributes.entries[].options must be an array when provided.`,
          );
          return false;
        }
        for (const v of entry.options) {
          const check = validateValuesEntry(
            v,
            widgetName,
            `config.userProfileAttributes.entries[${entry.name}].options[]`,
          );
          if (!check.ok) return false;
        }
      }
      if (entry.allowOther != null && typeof entry.allowOther !== 'boolean') {
        console.error(
          `${widgetName} Widget Error: config.userProfileAttributes.entries[].allowOther must be a boolean when provided.`,
        );
        return false;
      }
      if (entry.allowOther && (!Array.isArray(entry.options) || entry.options.length === 0)) {
        console.warn(
          `${widgetName} Widget Warning: config.userProfileAttributes.entries["${entry.name}"] has allowOther: true but no options — the entry will render as a plain text input (allowOther is only meaningful alongside a curated options list).`,
        );
      }
    }
  }
  return true;
};

const validateClassNames = (classNames, widgetName) => {
  if (classNames == null) return true;
  if (typeof classNames !== 'object' || Array.isArray(classNames)) {
    console.error(
      `${widgetName} Widget Error: config.classNames must be an object keyed by slot name.`,
    );
    return false;
  }
  for (const [slot, value] of Object.entries(classNames)) {
    if (!SLOT_NAMES.includes(slot)) {
      console.warn(
        `${widgetName} Widget Warning: config.classNames.${slot} is not a recognized slot (expected one of ${SLOT_NAMES.join(', ')}). The entry is ignored.`,
      );
      continue;
    }
    if (value == null) continue;
    if (typeof value === 'string') continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (value.add != null && typeof value.add !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.classNames.${slot}.add must be a string when provided.`,
        );
        return false;
      }
      if (value.remove != null) {
        if (
          !Array.isArray(value.remove) ||
          !value.remove.every(s => typeof s === 'string')
        ) {
          console.error(
            `${widgetName} Widget Error: config.classNames.${slot}.remove must be an array of strings.`,
          );
          return false;
        }
      }
      continue;
    }
    console.error(
      `${widgetName} Widget Error: config.classNames.${slot} must be a string or { add?, remove? } object.`,
    );
    return false;
  }
  return true;
};

const validateConfig = (config = {}) => {
  const widgetName = 'Profile';
  if (!validateCoreConfig(config.core, widgetName)) return false;
  if (!validateUserAttributes(config.userAttributes, widgetName)) return false;
  if (!validateUserProfileAttributes(config.userProfileAttributes, widgetName)) return false;
  if (!validateClassNames(config.classNames, widgetName)) return false;
  if (config.order != null) {
    if (!Array.isArray(config.order)) {
      console.error(
        `${widgetName} Widget Error: config.order must be an array.`,
      );
      return false;
    }
    if (config.order.length > 0) {
      // Discriminate flat vs grouped by the first entry's type, then
      // require homogeneity — mixing strings and group objects in the
      // same array makes the rendering ambiguous.
      const isFlat = typeof config.order[0] === 'string';
      for (const entry of config.order) {
        if (isFlat) {
          if (typeof entry !== 'string') {
            console.error(
              `${widgetName} Widget Error: config.order entries must all be strings (flat order) or all be { groupTitle, fields } objects (grouped order). Don't mix.`,
            );
            return false;
          }
        } else {
          if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
            console.error(
              `${widgetName} Widget Error: config.order entries must all be { groupTitle, fields } objects when using grouped order.`,
            );
            return false;
          }
          if (typeof entry.groupTitle !== 'string') {
            console.error(
              `${widgetName} Widget Error: config.order[].groupTitle must be a string (use "" for a headerless group).`,
            );
            return false;
          }
          if (
            !Array.isArray(entry.fields) ||
            !entry.fields.every(s => typeof s === 'string')
          ) {
            console.error(
              `${widgetName} Widget Error: config.order[].fields must be an array of strings.`,
            );
            return false;
          }
        }
      }
    }
  }
  return true;
};

/**
 * Initializes a Profile widget instance.
 *
 * Renders the logged-in user's editable profile, themed to look like
 * Kinetic form fields. The widget composes three sections:
 *
 *   - Core properties (displayName, email, preferredLocale, timezone) —
 *     editable. Text inputs for displayName/email; selects for
 *     preferredLocale/timezone (curated `values` list required to
 *     render).
 *   - User Attributes — read-only display rows, opt-in allow-list.
 *   - User Profile Attributes — editable, default-show with optional
 *     exclude list; multi-valued attributes render as repeating rows.
 *
 * A single Save button at the bottom commits changes. Only fields the
 * user actually edited are sent to the server.
 *
 * Future phases will extend this widget to cover select-value
 * configuration on User Profile Attributes (with "Other…" reveal),
 * clickAction-aware descriptions on User Attributes, and visual /
 * Save-button configuration.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.Profile({
 *     container: K('content[Profile]').element(),
 *     id: 'profile',
 *   });
 *
 * With curated language + timezone selects:
 *   bundle.widgets.Profile({
 *     container: K('content[Profile]').element(),
 *     config: {
 *       core: {
 *         preferredLocale: {
 *           values: [
 *             { value: 'en_US', label: 'English (United States)' },
 *             { value: 'es_MX', label: 'Español (México)' },
 *             { value: 'fr_FR', label: 'Français (France)' },
 *           ],
 *           required: true,
 *         },
 *         timezone: {
 *           values: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
 *         },
 *       },
 *     },
 *     id: 'profile',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} [config] All fields optional.
 * @param {Object} [config.core] Per-core-property config keyed by
 *   property name. Recognized keys: 'displayName', 'email',
 *   'preferredLocale', 'timezone'. Each entry may set `hide` (bool),
 *   `readOnly` (bool), `required` (bool), and `label` (string).
 *   `preferredLocale` and `timezone` additionally accept `values` — an
 *   array of strings or `{ value, label }` objects. Without `values`,
 *   the field hides (no implicit "show all available" — the widget
 *   refuses to render a 600-option default dropdown).
 * @param {Array<Object>} [config.userAttributes] Allow-list of User
 *   Attributes (system-controlled) to show as read-only rows. Each
 *   entry: `{ name, label?, description?, action? }`. The optional
 *   `action` is `{ label, clickAction, target? }` and renders a small
 *   button or link below the description — the clickAction and target
 *   shapes are the standard CHROME_ACTIONS system (internal / external
 *   / event / home / openSearch, with current / new / modal / container
 *   targets). Defaults: empty — nothing shown.
 * @param {Object} [config.userProfileAttributes] User Profile Attributes
 *   (editable) configuration. Two keys: `exclude` (array of names to
 *   omit) and `entries` (array of per-attribute overrides). Each entry:
 *   `{ name, label?, description?, required?, options?, allowOther? }`.
 *   When `options` is provided, the attribute renders as a select (or
 *   one select per row for multi-valued definitions). `allowOther: true`
 *   appends an "Other…" option that reveals a free-text input.
 * @param {Array<string>|Array<Object>} [config.order] Explicit render
 *   order. Accepts two shapes (pick one, don't mix):
 *
 *   - **Flat array of field keys** — e.g. `['email', 'Manager', 'Phone']`.
 *     Each entry is a core-prop key, User Attribute name, or User
 *     Profile Attribute name. Anything not listed falls alphabetical
 *     at the end, grouped by section.
 *
 *   - **Array of group objects** — e.g.
 *     `[{ groupTitle: 'Account', fields: ['displayName', 'email'] }, …]`.
 *     Each group renders as a `<section>` with an optional `<h3>`
 *     title (empty `groupTitle` = headerless visual section break).
 *     Unlisted fields fall into an implicit untitled group at the end.
 *
 *   The `group` and `groupHeader` `classNames` slots style the
 *   section wrapper and header respectively.
 * @param {Object} [config.classNames] Per-slot class overrides. Keys
 *   are slot names. Each value is either a string (additive — concatenated
 *   on top of widget defaults) or an object `{ add?: string, remove?:
 *   string[] }` for surgical control: `remove` strips the listed tokens
 *   from defaults+conditional-extras before `add` appends. Removal is
 *   the more reliable customization mechanism — Tailwind's compile-time
 *   content scan doesn't see classes typed in form bundles, so adding
 *   new classes can silently fail to take effect; removing unwanted
 *   defaults always works. Recognized slots: container, group,
 *   groupHeader, field, label, input, select, description, value,
 *   action, addAnother, removeRow, saveButton, error. Unknown slot
 *   names produce a warning and are ignored.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const Profile = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Profile');
  if (resolved && validateConfig(config)) {
    return registerWidget(Profile, {
      container: resolved,
      Component: ProfileComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The Profile widget parameters are invalid. See the console for more details.',
  );
};
