import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import clsx from 'clsx';
import {
  fetchForm,
  fetchTeam,
  fetchTeams,
  updateCategory,
  updateForm,
  updateKapp,
  updateProfile,
  updateSpace,
  updateTeam,
} from '@kineticdata/react';
import { registerWidget, resolveContainer, WidgetAPI } from './index.js';
import { store } from '../../../redux.js';
import { appActions, refreshKappForms } from '../../../helpers/state.js';
import { useKappContext } from '../../../helpers/widget-context.js';
import { toastError, toastSuccess } from '../../../helpers/toasts.js';
import { Icon } from '../../../atoms/Icon.jsx';

// Supported resource types this widget can edit. User Attributes are
// intentionally excluded — they're system-controlled and Profile already
// handles the read-only "surface a User Attribute" case.
const ATTRIBUTE_TYPES = [
  'space',
  'userProfile',
  'team',
  'kapp',
  'category',
  'form',
];

// Types that need no `target` at all — there's only one "the" record per
// authenticated session. Provided targets are warned about and dropped.
const SINGLETON_TYPES = new Set(['space', 'userProfile']);

// Per-type human-readable label used in default picker labels and in
// console warnings.
const TYPE_LABELS = {
  space: 'Space',
  userProfile: 'User Profile',
  team: 'Team',
  kapp: 'Kapp',
  category: 'Category',
  form: 'Form',
};

// Default classes for every styleable slot. The full set covers both the
// picker (rendered only when target === 'picker') and the editing form.
// Designers layer overrides via `config.classNames[slot]`; see Profile's
// `cn()` convention — strings are additive, objects support
// `{ add?, remove? }` for surgical control.
const SLOT_DEFAULTS = {
  // Outer wrapper around the picker + form. Column layout with a small
  // gap so the picker sits cleanly above the field list.
  container: 'flex-c-st gap-6 w-full',
  // The picker's outer `.field` wrapper. Picker only renders when
  // target === 'picker'.
  picker: 'field',
  // The picker's `<label>`.
  pickerLabel: '',
  // The picker's `<select>`.
  pickerSelect: 'min-w-48',
  // Each editable field row.
  field: 'field',
  // Each field's `<label>`.
  label: '',
  // Every editable `<input>` element (text, Other text).
  input: 'min-w-48',
  // Every `<select>` element (attribute select).
  select: 'min-w-48',
  // Descriptive helper text under a field.
  description: 'text-sm text-base-content/60',
  // "Add another" button on multi-value attributes.
  addAnother: 'kbtn kbtn-ghost kbtn-xs self-start',
  // Per-row remove button on multi-value rows.
  removeRow: 'kbtn kbtn-ghost kbtn-sm kbtn-circle',
  // The Save button at the bottom.
  saveButton: 'kbtn kbtn-primary self-end',
  // Inline error message under a field.
  error: 'flex-sc gap-2 text-base-content/60',
  // The `<section>` wrapping each ordered group of fields.
  group: 'flex-c-st gap-6',
  // The `<h3>` rendered above a named group (omitted on empty title).
  groupHeader: 'text-base font-semibold text-base-content',
  // Pre-render states (loading target data, no target selected, etc.).
  loading: 'text-sm text-base-content/60',
  empty: 'text-sm text-base-content/60',
};

const SLOT_NAMES = Object.keys(SLOT_DEFAULTS);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

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

// Per-type validator for the `target` config. Returns true on success,
// false on hard error (widget refuses to mount); a missing target is
// fine — render will surface "Pick a <Type>" until one is provided via
// API or picker. Singleton types (space/userProfile) warn about provided
// targets but don't fail.
const validateTarget = (type, target, widgetName) => {
  if (SINGLETON_TYPES.has(type)) {
    if (target != null) {
      console.warn(
        `${widgetName} Widget Warning: config.target is ignored for type="${type}" — the ${TYPE_LABELS[type]} is a singleton.`,
      );
    }
    return true;
  }
  if (target == null) return true;
  if (target === 'picker') return true;
  if (typeof target === 'string') {
    if (type === 'kapp' || type === 'team') return true;
    console.error(
      `${widgetName} Widget Error: config.target for type="${type}" must be an object (e.g. { kappSlug, ${type === 'category' ? 'categorySlug' : 'formSlug'} }) or "picker". Bare slug strings are only valid for type="kapp" or type="team".`,
    );
    return false;
  }
  if (typeof target === 'object' && !Array.isArray(target)) {
    if (type === 'kapp') {
      if (typeof target.kappSlug !== 'string' || target.kappSlug === '') {
        console.error(
          `${widgetName} Widget Error: config.target for type="kapp" must include a non-empty "kappSlug".`,
        );
        return false;
      }
      return true;
    }
    if (type === 'team') {
      if (typeof target.teamSlug !== 'string' || target.teamSlug === '') {
        console.error(
          `${widgetName} Widget Error: config.target for type="team" must include a non-empty "teamSlug".`,
        );
        return false;
      }
      return true;
    }
    if (type === 'category') {
      if (
        typeof target.kappSlug !== 'string' ||
        target.kappSlug === '' ||
        typeof target.categorySlug !== 'string' ||
        target.categorySlug === ''
      ) {
        console.error(
          `${widgetName} Widget Error: config.target for type="category" must include non-empty "kappSlug" and "categorySlug".`,
        );
        return false;
      }
      return true;
    }
    if (type === 'form') {
      if (
        typeof target.kappSlug !== 'string' ||
        target.kappSlug === '' ||
        typeof target.formSlug !== 'string' ||
        target.formSlug === ''
      ) {
        console.error(
          `${widgetName} Widget Error: config.target for type="form" must include non-empty "kappSlug" and "formSlug".`,
        );
        return false;
      }
      return true;
    }
  }
  console.error(
    `${widgetName} Widget Error: config.target shape is not valid for type="${type}".`,
  );
  return false;
};

// `parent` is only meaningful for picker mode on category / form. For
// other types it's ignored with a warning.
const validateParent = (type, target, parent, widgetName) => {
  if (parent == null) return true;
  if (target !== 'picker' || (type !== 'category' && type !== 'form')) {
    console.warn(
      `${widgetName} Widget Warning: config.parent is only meaningful when target="picker" and type is "category" or "form"; the entry is ignored.`,
    );
    return true;
  }
  if (parent === 'current') return true;
  if (typeof parent === 'string') {
    if (parent === '') {
      console.error(
        `${widgetName} Widget Error: config.parent string must be a non-empty kapp slug or "current".`,
      );
      return false;
    }
    return true;
  }
  if (typeof parent === 'object' && !Array.isArray(parent)) {
    if (typeof parent.kappSlug !== 'string' || parent.kappSlug === '') {
      console.error(
        `${widgetName} Widget Error: config.parent object must include a non-empty "kappSlug".`,
      );
      return false;
    }
    return true;
  }
  console.error(
    `${widgetName} Widget Error: config.parent must be "current", a kapp slug string, or { kappSlug } object.`,
  );
  return false;
};

const validateAttributes = (attributes, widgetName) => {
  if (attributes == null) return true;
  if (typeof attributes !== 'object' || Array.isArray(attributes)) {
    console.error(
      `${widgetName} Widget Error: config.attributes must be an object with optional "exclude" and "entries" keys.`,
    );
    return false;
  }
  if (attributes.exclude != null) {
    if (
      !Array.isArray(attributes.exclude) ||
      !attributes.exclude.every(s => typeof s === 'string')
    ) {
      console.error(
        `${widgetName} Widget Error: config.attributes.exclude must be an array of strings.`,
      );
      return false;
    }
  }
  if (attributes.entries != null) {
    if (!Array.isArray(attributes.entries)) {
      console.error(
        `${widgetName} Widget Error: config.attributes.entries must be an array.`,
      );
      return false;
    }
    const seen = new Set();
    for (const entry of attributes.entries) {
      if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
        console.error(
          `${widgetName} Widget Error: each config.attributes.entries entry must be an object.`,
        );
        return false;
      }
      if (typeof entry.name !== 'string' || entry.name === '') {
        console.error(
          `${widgetName} Widget Error: each config.attributes.entries entry must have a non-empty string "name".`,
        );
        return false;
      }
      if (seen.has(entry.name)) {
        console.warn(
          `${widgetName} Widget Warning: config.attributes.entries has a duplicate for "${entry.name}"; the first wins.`,
        );
      }
      seen.add(entry.name);
      if (entry.label != null && typeof entry.label !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.attributes.entries[].label must be a string when provided.`,
        );
        return false;
      }
      if (entry.description != null && typeof entry.description !== 'string') {
        console.error(
          `${widgetName} Widget Error: config.attributes.entries[].description must be a string when provided.`,
        );
        return false;
      }
      if (entry.required != null && typeof entry.required !== 'boolean') {
        console.error(
          `${widgetName} Widget Error: config.attributes.entries[].required must be a boolean when provided.`,
        );
        return false;
      }
      if (entry.options != null) {
        if (!Array.isArray(entry.options)) {
          console.error(
            `${widgetName} Widget Error: config.attributes.entries[].options must be an array when provided.`,
          );
          return false;
        }
        for (const v of entry.options) {
          const check = validateValuesEntry(
            v,
            widgetName,
            `config.attributes.entries[${entry.name}].options[]`,
          );
          if (!check.ok) return false;
        }
      }
      if (entry.allowOther != null && typeof entry.allowOther !== 'boolean') {
        console.error(
          `${widgetName} Widget Error: config.attributes.entries[].allowOther must be a boolean when provided.`,
        );
        return false;
      }
      if (
        entry.allowOther &&
        (!Array.isArray(entry.options) || entry.options.length === 0)
      ) {
        console.warn(
          `${widgetName} Widget Warning: config.attributes.entries["${entry.name}"] has allowOther: true but no options — the entry will render as a plain text input (allowOther is only meaningful alongside a curated options list).`,
        );
      }
    }
  }
  return true;
};

const validateOrder = (order, widgetName) => {
  if (order == null) return true;
  if (!Array.isArray(order)) {
    console.error(`${widgetName} Widget Error: config.order must be an array.`);
    return false;
  }
  if (order.length === 0) return true;
  const isFlat = typeof order[0] === 'string';
  for (const entry of order) {
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
  const widgetName = 'Attributes';
  if (typeof config.type !== 'string' || !ATTRIBUTE_TYPES.includes(config.type)) {
    console.error(
      `${widgetName} Widget Error: config.type is required and must be one of ${ATTRIBUTE_TYPES.join(', ')}.`,
    );
    return false;
  }
  if (!validateTarget(config.type, config.target, widgetName)) return false;
  if (!validateParent(config.type, config.target, config.parent, widgetName)) {
    return false;
  }
  if (!validateAttributes(config.attributes, widgetName)) return false;
  if (!validateOrder(config.order, widgetName)) return false;
  if (!validateClassNames(config.classNames, widgetName)) return false;
  if (config.pickerLabel != null && typeof config.pickerLabel !== 'string') {
    console.error(
      `${widgetName} Widget Error: config.pickerLabel must be a string when provided.`,
    );
    return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Sentinel value used inside <select> elements to mean "the user explicitly
// picked Other…". Lives only in the UI representation — the actual field
// state stores the free-text value the user types. Mirrors Profile's
// sentinel; the name is namespaced so the two widgets don't accidentally
// share state.
const OTHER_SENTINEL = '__attributes_widget_other__';

// Normalizes a `values`/`options` config entry into a stable
// `{ value, label }` object. Accepts bare strings (label = value) and
// explicit `{ value, label? }` objects. Invalid entries are dropped
// silently — validateConfig has already warned about them.
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

const filterValues = arr => arr.map(s => s.trim()).filter(s => s !== '');

const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

// Returns the option list to render in a select field, prepending the
// current value as an option when it isn't already in the curated list —
// so a user whose attribute value is `Operations` but the designer
// curated `['Engineering', 'Sales']` still sees their current value
// selected rather than being silently switched.
const optionsForRender = (options, currentValue) => {
  if (!currentValue) return options;
  if (options.some(o => o.value === currentValue)) return options;
  return [
    { value: currentValue, label: `${currentValue} (current)` },
    ...options,
  ];
};

const resolveAttributeConfig = (definition, entry) => {
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

// For a select field with allowOther, compute the per-row Other-mode flags
// seeded from the user's current values. A value non-empty and outside the
// options list (and allowOther on) starts in Other-mode so the user sees a
// populated text input on first render rather than a broken-looking
// dropdown.
const seedOtherStates = (fields, valueMap) => {
  const result = {};
  for (const f of fields) {
    if (f.kind !== 'select' || !f.allowOther) continue;
    const arr = valueMap[f.key] ?? [];
    const optionValues = new Set(f.options.map(o => o.value));
    result[f.key] = arr.map(v => v !== '' && !optionValues.has(v));
  }
  return result;
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
  // Unlike Profile, this widget has only one section (attributes only —
  // no core props vs UA vs UPA distinction), so the fallback is a simple
  // alphabetical sort by label.
  const remaining = fields
    .filter(f => !used.has(f.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...ordered, ...remaining];
};

// Normalizes `config.order` into a list of groups for rendering.
//   - undefined / empty array  → one untitled group, alphabetical fallback
//   - array of strings (flat)  → one untitled group, listed-then-alphabetical
//   - array of group objects   → multiple groups (mirrors Profile)
const buildGroups = (fields, explicitOrder) => {
  if (!Array.isArray(explicitOrder) || explicitOrder.length === 0) {
    return [{ groupTitle: '', fields: buildRenderOrder(fields, undefined) }];
  }
  if (typeof explicitOrder[0] === 'string') {
    return [
      { groupTitle: '', fields: buildRenderOrder(fields, explicitOrder) },
    ];
  }
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
    if (
      groupFields.length === 0 &&
      (!group.groupTitle || group.groupTitle === '')
    ) {
      continue;
    }
    groups.push({
      groupTitle: typeof group.groupTitle === 'string' ? group.groupTitle : '',
      fields: groupFields,
    });
  }
  const unlisted = fields
    .filter(f => !used.has(f.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (unlisted.length > 0) {
    groups.push({ groupTitle: '', fields: unlisted });
  }
  return groups;
};

// Dispatches the save call appropriate to the resource type. Each branch
// passes `include` so the response carries the updated `attributesMap`
// (or `profileAttributesMap` for userProfile), avoiding the stale-redux
// trap from the kinetic-profile-update-include memory. Returns
// `{ error, applied }` where `applied` is a fn to call on success that
// merges the response into redux.
const dispatchSave = async ({ type, target, attributesMap }) => {
  if (type === 'space') {
    const result = await updateSpace({
      space: { attributesMap },
      include: 'attributesMap',
    });
    return {
      error: result.error,
      applied: () => {
        if (result.space?.attributesMap) {
          appActions.updateSpaceData({
            attributesMap: result.space.attributesMap,
          });
        }
      },
    };
  }
  if (type === 'userProfile') {
    const result = await updateProfile({
      profile: { profileAttributesMap: attributesMap },
      include: 'profileAttributesMap,attributesMap,memberships',
    });
    return {
      error: result.error,
      applied: () => {
        if (result.profile) appActions.updateProfile(result.profile);
      },
    };
  }
  if (type === 'kapp') {
    const result = await updateKapp({
      kappSlug: target.kappSlug,
      kapp: { attributesMap },
      include: 'attributesMap',
    });
    return {
      error: result.error,
      applied: () => {
        if (result.kapp?.attributesMap) {
          appActions.updateKappData({
            slug: target.kappSlug,
            attributesMap: result.kapp.attributesMap,
          });
        }
      },
    };
  }
  if (type === 'category') {
    const result = await updateCategory({
      kappSlug: target.kappSlug,
      categorySlug: target.categorySlug,
      category: { attributesMap },
      include: 'attributesMap',
    });
    return {
      error: result.error,
      // Targeted patch into the kapp's cached categories array — same
      // shape as the updateKappData / updateSpaceData merges. No need to
      // refresh the whole kapp; the response carries the fresh
      // attributesMap because we passed `include` above.
      applied: () => {
        if (result.category?.attributesMap) {
          appActions.updateKappCategoryData({
            kappSlug: target.kappSlug,
            categorySlug: target.categorySlug,
            attributesMap: result.category.attributesMap,
          });
        }
      },
    };
  }
  if (type === 'form') {
    const result = await updateForm({
      kappSlug: target.kappSlug,
      formSlug: target.formSlug,
      form: { attributesMap },
      include: 'attributesMap',
    });
    return {
      error: result.error,
      // Forms aren't cached in redux's kappCache — the caller patches
      // the local fetched-record via the returned `fresh` map so dirty
      // tracking re-seeds against the post-save server state.
      applied: () => {},
      fresh: result.form?.attributesMap || null,
    };
  }
  if (type === 'team') {
    const result = await updateTeam({
      teamSlug: target.teamSlug,
      team: { attributesMap },
      include: 'attributesMap',
    });
    return {
      error: result.error,
      applied: () => {},
      fresh: result.team?.attributesMap || null,
    };
  }
  return {
    error: { message: `Save is not implemented for type="${type}" yet.` },
    applied: () => {},
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Normalizes whatever the caller passed as `target` into a canonical
// internal shape used for rendering and API calls. Returns null when no
// target has been resolved yet (singleton bypass handled separately).
//
// Canonical shapes:
//   space, userProfile  → null  (no target)
//   kapp                → { kappSlug }
//   team                → { teamSlug }
//   category            → { kappSlug, categorySlug }
//   form                → { kappSlug, formSlug }
//
// The string 'current' and bare-slug shortcuts are expanded by the
// caller (component body) so this helper only sees concrete data.
const normalizeTarget = (type, target) => {
  if (SINGLETON_TYPES.has(type)) return null;
  if (target == null || target === 'picker') return null;
  if (typeof target === 'string') {
    if (type === 'kapp') return { kappSlug: target };
    if (type === 'team') return { teamSlug: target };
    return null;
  }
  if (typeof target === 'object') {
    if (type === 'kapp' && target.kappSlug) {
      return { kappSlug: target.kappSlug };
    }
    if (type === 'team' && target.teamSlug) {
      return { teamSlug: target.teamSlug };
    }
    if (type === 'category' && target.kappSlug && target.categorySlug) {
      return {
        kappSlug: target.kappSlug,
        categorySlug: target.categorySlug,
      };
    }
    if (type === 'form' && target.kappSlug && target.formSlug) {
      return {
        kappSlug: target.kappSlug,
        formSlug: target.formSlug,
      };
    }
  }
  return null;
};

const AttributesContent = ({ config = {}, apiRef }) => {
  // Slot-class helper. Same shape as Profile's `cn`: defaults + conditional
  // extras + designer override (string additive, or { add?, remove? } for
  // surgical control). See Profile's `cn` for the "remove" rationale.
  const cn = (slot, ...extra) => {
    const base = clsx(SLOT_DEFAULTS[slot], ...extra);
    const override = config.classNames?.[slot];
    if (override == null) return base;
    if (typeof override === 'string') return clsx(base, override);
    const removeList = Array.isArray(override.remove) ? override.remove : null;
    const filtered =
      removeList && removeList.length > 0
        ? base
            .split(/\s+/)
            .filter(t => t && !removeList.includes(t))
            .join(' ')
        : base;
    return clsx(filtered, override.add);
  };

  // Resolve `target === "current"` for type=kapp via useKappContext —
  // this picks up an enclosing BundleContainer's kapp scope when present
  // and falls through to the URL kapp otherwise. Only meaningful for
  // type=kapp; other types use their own resolution paths.
  const currentKappCtx = useKappContext({ kappSlug: 'auto' });

  // Expand any "current" sentinel in the caller's target into a concrete
  // target object the rest of the widget can consume uniformly.
  const expandedTarget = useMemo(() => {
    if (config.type !== 'kapp') return config.target;
    if (config.target !== 'current') return config.target;
    return currentKappCtx.slug ? { kappSlug: currentKappCtx.slug } : null;
  }, [config.type, config.target, currentKappCtx.slug]);

  // Track the *resolved* target — starts from caller config, can be
  // updated via picker or imperative API. P5 wires the setters; P1 just
  // initializes state from config.
  const [resolvedTarget, setResolvedTarget] = useState(() =>
    normalizeTarget(config.type, expandedTarget),
  );

  // Keep the resolved target in sync when the caller's config.target
  // changes via re-render (e.g. designer re-invokes the widget with new
  // config). Picker / API-driven changes take precedence by replacing the
  // ref below before the effect re-fires; the effect compares against the
  // last config-derived target to avoid clobbering user-driven changes.
  const lastConfigTargetKey = useRef(JSON.stringify(expandedTarget));
  useEffect(() => {
    const key = JSON.stringify(expandedTarget);
    if (key !== lastConfigTargetKey.current) {
      lastConfigTargetKey.current = key;
      setResolvedTarget(normalizeTarget(config.type, expandedTarget));
    }
  }, [config.type, expandedTarget]);

  // Read data from redux based on the type + resolvedTarget. Each
  // branch returns one of: { loading }, { noTarget }, { error }, or
  // the loaded { definitions, currentValues }.
  const space = useSelector(s => s.app?.space);
  const profile = useSelector(s => s.app?.profile);
  const targetKappSlug = resolvedTarget?.kappSlug || null;
  const targetKapp = useSelector(s =>
    targetKappSlug ? s.app?.kappCache?.[targetKappSlug] || null : null,
  );

  // String key identifying the current target for form/team fetches. We
  // tag every fetched record with the key in flight so a stale resolve
  // can't leak attribute values into a freshly-switched target.
  const targetKey = useMemo(() => {
    if (!resolvedTarget) return null;
    if (config.type === 'form') {
      return `form:${resolvedTarget.kappSlug}/${resolvedTarget.formSlug}`;
    }
    if (config.type === 'team') {
      return `team:${resolvedTarget.teamSlug}`;
    }
    return null;
  }, [config.type, resolvedTarget]);

  // Fetched record for types whose value-bearing data isn't pre-cached
  // in redux. Shape: { key, attributesMap, error? }. Forms and teams
  // both go through this path.
  const [fetchedRecord, setFetchedRecord] = useState(null);

  useEffect(() => {
    if (config.type !== 'form' && config.type !== 'team') {
      // Reset between targeted types so we don't carry stale data after
      // a runtime type switch.
      setFetchedRecord(null);
      return undefined;
    }
    if (!targetKey || !resolvedTarget) {
      setFetchedRecord(null);
      return undefined;
    }
    let stale = false;
    const promise =
      config.type === 'form'
        ? fetchForm({
            kappSlug: resolvedTarget.kappSlug,
            formSlug: resolvedTarget.formSlug,
            include: 'attributesMap',
          })
        : fetchTeam({
            teamSlug: resolvedTarget.teamSlug,
            include: 'attributesMap',
          });
    promise.then(result => {
      if (stale) return;
      if (result.error) {
        setFetchedRecord({
          key: targetKey,
          attributesMap: {},
          error: result.error,
        });
        return;
      }
      const record = result.form || result.team;
      setFetchedRecord({
        key: targetKey,
        attributesMap: record?.attributesMap || {},
      });
    });
    return () => {
      stale = true;
    };
  }, [config.type, targetKey, resolvedTarget]);

  const dataState = useMemo(() => {
    if (config.type === 'space') {
      if (!space) return { loading: true, definitions: [], currentValues: {} };
      return {
        loading: false,
        definitions: space.spaceAttributeDefinitions || [],
        currentValues: space.attributesMap || {},
      };
    }
    if (config.type === 'userProfile') {
      if (!space || !profile) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      return {
        loading: false,
        definitions: space.userProfileAttributeDefinitions || [],
        currentValues: profile.profileAttributesMap || {},
      };
    }
    if (config.type === 'kapp') {
      if (!resolvedTarget) {
        return {
          loading: false,
          noTarget: true,
          definitions: [],
          currentValues: {},
        };
      }
      if (!targetKapp) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      return {
        loading: false,
        definitions: targetKapp.kappAttributeDefinitions || [],
        currentValues: targetKapp.attributesMap || {},
      };
    }
    if (config.type === 'category') {
      if (!resolvedTarget) {
        return {
          loading: false,
          noTarget: true,
          definitions: [],
          currentValues: {},
        };
      }
      if (!targetKapp) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      const cat = (targetKapp.categories || []).find(
        c => c.slug === resolvedTarget.categorySlug,
      );
      if (!cat) {
        return {
          loading: false,
          error: `Category "${resolvedTarget.categorySlug}" not found in kapp "${resolvedTarget.kappSlug}".`,
          definitions: [],
          currentValues: {},
        };
      }
      return {
        loading: false,
        definitions: targetKapp.categoryAttributeDefinitions || [],
        currentValues: cat.attributesMap || {},
      };
    }
    if (config.type === 'form') {
      if (!resolvedTarget) {
        return {
          loading: false,
          noTarget: true,
          definitions: [],
          currentValues: {},
        };
      }
      if (!targetKapp) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      if (!fetchedRecord || fetchedRecord.key !== targetKey) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      if (fetchedRecord.error) {
        return {
          loading: false,
          error:
            fetchedRecord.error.message ||
            `Failed to load form "${resolvedTarget.kappSlug}/${resolvedTarget.formSlug}".`,
          definitions: [],
          currentValues: {},
        };
      }
      return {
        loading: false,
        definitions: targetKapp.formAttributeDefinitions || [],
        currentValues: fetchedRecord.attributesMap || {},
      };
    }
    if (config.type === 'team') {
      if (!resolvedTarget) {
        return {
          loading: false,
          noTarget: true,
          definitions: [],
          currentValues: {},
        };
      }
      if (!space) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      if (!fetchedRecord || fetchedRecord.key !== targetKey) {
        return { loading: true, definitions: [], currentValues: {} };
      }
      if (fetchedRecord.error) {
        return {
          loading: false,
          error:
            fetchedRecord.error.message ||
            `Failed to load team "${resolvedTarget.teamSlug}".`,
          definitions: [],
          currentValues: {},
        };
      }
      return {
        loading: false,
        definitions: space.teamAttributeDefinitions || [],
        currentValues: fetchedRecord.attributesMap || {},
      };
    }
    return {
      loading: false,
      error: `Unknown type "${config.type}".`,
      definitions: [],
      currentValues: {},
    };
  }, [
    config.type,
    space,
    profile,
    resolvedTarget,
    targetKapp,
    targetKey,
    fetchedRecord,
  ]);

  // Resolve attribute definitions + caller overrides into a flat field
  // list and an `initialValues` map. Same shape as Profile, simpler
  // because there's only one section.
  const { fields, initialValues } = useMemo(() => {
    const out = [];
    const initial = {};
    const seenKeys = new Map();

    const claim = (key, field) => {
      if (seenKeys.has(key)) {
        console.warn(
          `Attributes Widget Warning: duplicate field "${key}" — first wins, later dropped.`,
        );
        return false;
      }
      seenKeys.set(key, field);
      return true;
    };

    const attrCfg = config.attributes || {};
    const excludeList = Array.isArray(attrCfg.exclude)
      ? new Set(attrCfg.exclude)
      : new Set();
    const entries = Array.isArray(attrCfg.entries) ? attrCfg.entries : [];
    const entriesByName = new Map(
      entries
        .filter(e => e && typeof e.name === 'string')
        .map(e => [e.name, e]),
    );

    for (const def of dataState.definitions) {
      if (excludeList.has(def.name)) continue;
      const entry = entriesByName.get(def.name);
      const c = resolveAttributeConfig(def, entry);
      const field = {
        key: def.name,
        attributeName: def.name,
        label: c.label,
        description: c.description,
        required: c.required,
        multi: c.multi,
        kind: c.kind,
        options: c.options,
        allowOther: c.allowOther,
      };
      if (!claim(def.name, field)) continue;
      out.push(field);
      const arr = dataState.currentValues?.[def.name] || [];
      initial[def.name] = [...arr];
    }

    return { fields: out, initialValues: initial };
  }, [config.attributes, dataState.definitions, dataState.currentValues]);

  const groups = useMemo(
    () => buildGroups(fields, config.order),
    [fields, config.order],
  );
  const renderOrder = useMemo(() => groups.flatMap(g => g.fields), [groups]);

  // Editing state — current per-field values, per-row Other-mode flags,
  // validation errors, and an in-flight save flag.
  const [values, setValues] = useState(initialValues);
  const [otherStates, setOtherStates] = useState(() =>
    seedOtherStates(fields, initialValues),
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Re-seed when initialValues change (target swap, fresh data after save,
  // etc.). Uses the same JSON-key trick as Profile to detect change without
  // a useEffect (so the next render uses the new seed immediately).
  const seededKey = useRef(JSON.stringify(initialValues));
  const currentKey = JSON.stringify(initialValues);
  if (seededKey.current !== currentKey) {
    seededKey.current = currentKey;
    setValues(initialValues);
    setOtherStates(seedOtherStates(fields, initialValues));
    setErrors({});
  }

  const isFieldDirty = f => {
    const cur = filterValues(values[f.key] ?? []);
    const init = filterValues(initialValues[f.key] ?? []);
    return !arraysEqual(cur, init);
  };
  const dirty = renderOrder.some(isFieldDirty);

  const validate = () => {
    const next = {};
    for (const f of renderOrder) {
      if (f.required && filterValues(values[f.key] ?? []).length === 0) {
        next[f.key] = `${f.label} is required.`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const reset = () => {
    setValues(initialValues);
    setOtherStates(seedOtherStates(fields, initialValues));
    setErrors({});
  };

  // Routes a target change through the dirty-check confirm. Returns
  // true if the swap was applied, false if the user cancelled. Used by
  // both the picker (onChange) and the imperative API (setTarget).
  const requestTarget = next => {
    const normalized = normalizeTarget(config.type, next);
    if (dirty) {
      const ok = window.confirm(
        'You have unsaved changes. Discard them and switch?',
      );
      if (!ok) return false;
    }
    setResolvedTarget(normalized);
    return true;
  };

  const performSave = async () => {
    if (saving) return;
    if (!validate()) return;

    const attributesMap = {};
    for (const f of renderOrder) {
      if (!isFieldDirty(f)) continue;
      attributesMap[f.attributeName] = filterValues(values[f.key] ?? []);
    }
    if (Object.keys(attributesMap).length === 0) return;

    setSaving(true);
    try {
      const { error, applied, fresh } = await dispatchSave({
        type: config.type,
        target: resolvedTarget,
        attributesMap,
      });
      if (error) {
        toastError({
          title: `${TYPE_LABELS[config.type]} attributes update failed.`,
          description: error.message || 'Please try again.',
        });
      } else {
        applied();
        // For form/team — types not cached in redux — patch the local
        // fetched-record so dirty tracking re-seeds against the
        // post-save server state. Guarded by targetKey equality so a
        // late-arriving save into a since-switched target can't poison
        // the new target's seed.
        if (fresh && fetchedRecord?.key === targetKey) {
          setFetchedRecord(prev =>
            prev && prev.key === targetKey
              ? { ...prev, attributesMap: fresh }
              : prev,
          );
        }
        toastSuccess({
          title: `${TYPE_LABELS[config.type]} attributes updated.`,
        });
      }
    } catch (err) {
      toastError({
        title: `${TYPE_LABELS[config.type]} attributes update failed.`,
        description: err?.message || 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    performSave();
  };

  // Imperative API. Re-attached on every render so each method closes
  // over the latest state (dirty, resolvedTarget, etc.). Callers reach
  // this object via `bundle.widgets.Attributes.get(id)`.
  useEffect(() => {
    if (!apiRef) return;
    Object.assign(apiRef.current, {
      getTarget: () => resolvedTarget,
      setTarget: requestTarget,
      isDirty: () => dirty,
      reset,
      save: performSave,
    });
  });

  // === Picker (target === 'picker') =====================================

  const isPicker = config.target === 'picker';

  // For category / form pickers, resolve the "parent" kapp that scopes
  // the option list. "current" → enclosing BundleContainer / URL kapp;
  // string or { kappSlug } → explicit. Other types ignore parent.
  const resolvedParentSlug = useMemo(() => {
    if (!isPicker) return null;
    if (config.type !== 'category' && config.type !== 'form') return null;
    const p = config.parent;
    if (p === 'current') return currentKappCtx.slug || null;
    if (typeof p === 'string' && p !== '') return p;
    if (p && typeof p === 'object' && typeof p.kappSlug === 'string') {
      return p.kappSlug;
    }
    return null;
  }, [isPicker, config.type, config.parent, currentKappCtx.slug]);

  // Kapp picker — options straight from the preloaded space.kapps.
  const kappList = useSelector(s => s.app?.space?.kapps || []);

  // Team picker — fetched once on mount. null = loading, [] = empty.
  const [teamList, setTeamList] = useState(null);
  useEffect(() => {
    if (!isPicker || config.type !== 'team') return undefined;
    let stale = false;
    fetchTeams({ limit: 1000 }).then(result => {
      if (stale) return;
      if (result.error) {
        setTeamList([]);
        return;
      }
      setTeamList(result.teams || []);
    });
    return () => {
      stale = true;
    };
  }, [isPicker, config.type]);

  // Form / category pickers read from the parent kapp's cache slot. For
  // forms, the bulk space fetch deliberately skips the per-form metadata
  // (too heavy); we ask refreshKappForms to lazy-load just when picker
  // mode demands it. The selector is also used by the category picker
  // (which reads `parentKapp.categories` from the preloaded space fetch).
  const parentKapp = useSelector(s =>
    resolvedParentSlug
      ? s.app?.kappCache?.[resolvedParentSlug] || null
      : null,
  );
  useEffect(() => {
    if (!isPicker || config.type !== 'form') return;
    if (!resolvedParentSlug) return;
    if (parentKapp?.forms) return;
    refreshKappForms(resolvedParentSlug);
  }, [isPicker, config.type, resolvedParentSlug, parentKapp?.forms]);

  // Resolves the picker's UI state into a single shape the render can
  // consume. `ready` means options are available; `loading` means a
  // fetch is in flight; `unavailable` means a parent dependency is
  // missing (e.g. category picker without a kapp).
  const pickerState = useMemo(() => {
    if (!isPicker) return { hidden: true };
    const label = config.pickerLabel || TYPE_LABELS[config.type];
    if (config.type === 'kapp') {
      return {
        ready: true,
        label,
        options: kappList.map(k => ({ value: k.slug, label: k.name || k.slug })),
      };
    }
    if (config.type === 'team') {
      if (teamList === null) return { loading: true, label };
      return {
        ready: true,
        label,
        options: teamList.map(t => ({
          value: t.slug || t.name,
          label: t.name || t.slug,
        })),
      };
    }
    if (config.type === 'category') {
      if (!resolvedParentSlug) {
        return { unavailable: true, label, message: 'Pick a kapp first.' };
      }
      const cats = parentKapp?.categories || null;
      if (cats === null) return { loading: true, label };
      return {
        ready: true,
        label,
        options: cats.map(c => ({
          value: c.slug,
          label: c.name || c.slug,
        })),
      };
    }
    if (config.type === 'form') {
      if (!resolvedParentSlug) {
        return { unavailable: true, label, message: 'Pick a kapp first.' };
      }
      const forms = parentKapp?.forms || null;
      if (forms === null) return { loading: true, label };
      return {
        ready: true,
        label,
        options: forms.map(f => ({
          value: f.slug,
          label: f.name || f.slug,
        })),
      };
    }
    return { hidden: true };
  }, [
    isPicker,
    config.type,
    config.pickerLabel,
    kappList,
    teamList,
    resolvedParentSlug,
    parentKapp,
  ]);

  const pickerValue = useMemo(() => {
    if (!resolvedTarget) return '';
    if (config.type === 'kapp') return resolvedTarget.kappSlug || '';
    if (config.type === 'team') return resolvedTarget.teamSlug || '';
    if (config.type === 'category') return resolvedTarget.categorySlug || '';
    if (config.type === 'form') return resolvedTarget.formSlug || '';
    return '';
  }, [config.type, resolvedTarget]);

  const handlePickerChange = slug => {
    if (!slug) {
      requestTarget(null);
      return;
    }
    if (config.type === 'kapp') requestTarget({ kappSlug: slug });
    else if (config.type === 'team') requestTarget({ teamSlug: slug });
    else if (config.type === 'category' && resolvedParentSlug) {
      requestTarget({
        kappSlug: resolvedParentSlug,
        categorySlug: slug,
      });
    } else if (config.type === 'form' && resolvedParentSlug) {
      requestTarget({ kappSlug: resolvedParentSlug, formSlug: slug });
    }
  };

  const pickerNode = (() => {
    if (!isPicker || pickerState.hidden) return null;
    const inputId = `attributes-picker-${config.type}`;
    return (
      <div className={cn('picker')}>
        <label className={cn('pickerLabel')} htmlFor={inputId}>
          {pickerState.label}
        </label>
        {pickerState.unavailable ? (
          <div className={cn('empty')}>{pickerState.message}</div>
        ) : (
          <select
            id={inputId}
            className={cn('pickerSelect')}
            value={pickerValue}
            disabled={pickerState.loading || saving}
            onChange={e => handlePickerChange(e.target.value)}
          >
            <option value="">
              {pickerState.loading
                ? 'Loading…'
                : `— Select a ${pickerState.label.toLowerCase()} —`}
            </option>
            {(pickerState.options || []).map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  })();

  // === Render ===========================================================

  const wrap = body => (
    <div className={cn('container')}>
      {pickerNode}
      {body}
    </div>
  );

  if (isPicker && !resolvedTarget) {
    return wrap(
      <div className={cn('empty')}>
        Select a {TYPE_LABELS[config.type].toLowerCase()} to edit attributes.
      </div>,
    );
  }

  if (dataState.noTarget) {
    return wrap(
      <div className={cn('empty')}>
        No {TYPE_LABELS[config.type].toLowerCase()} selected.
      </div>,
    );
  }

  if (dataState.error) {
    return wrap(<div className={cn('empty')}>{dataState.error}</div>);
  }

  if (dataState.loading) {
    return wrap(<div className={cn('loading')}>Loading…</div>);
  }

  if (renderOrder.length === 0) {
    return wrap(
      <div className={cn('empty')}>No attribute definitions to display.</div>,
    );
  }

  return wrap(
    <form className="flex-c-st gap-6" onSubmit={handleSubmit}>
      {groups.map((group, gi) => (
        <section key={gi} className={cn('group')}>
          {group.groupTitle && (
            <h3 className={cn('groupHeader')}>{group.groupTitle}</h3>
          )}
          {group.fields.map(f => {
            const error = errors[f.key];
            const stateValues = values[f.key] ?? [];
            const displayValues = f.multi
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

            const inputId = `attributes-${f.key}`;
            const isSelect = f.kind === 'select';

            const handleSelectChange = (i, newValue) => {
              if (newValue === OTHER_SENTINEL) {
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
                <div className="flex-c-st gap-2">
                  {displayValues.map((v, i) => {
                    if (!isSelect) {
                      return (
                        <div
                          key={i}
                          className={f.multi ? 'flex-sc gap-2' : undefined}
                        >
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
                    const inOther = otherStates[f.key]?.[i] === true;
                    const opts = inOther
                      ? f.options
                      : optionsForRender(f.options, v);
                    const selectValue = inOther ? OTHER_SENTINEL : v;
                    return (
                      <div key={i} className="flex-c-st gap-2">
                        <div className={f.multi ? 'flex-sc gap-2' : undefined}>
                          <select
                            id={!f.multi && i === 0 ? inputId : undefined}
                            className={cn('select')}
                            value={selectValue}
                            required={f.required && !f.multi}
                            onChange={e =>
                              handleSelectChange(i, e.target.value)
                            }
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
          })}
        </section>
      ))}

      <button
        type="button"
        className={cn('saveButton')}
        onClick={handleSubmit}
        disabled={!dirty || saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>,
  );
};

const AttributesComponent = forwardRef(({ config }, ref) => {
  const apiRef = useRef({});

  return (
    <Provider store={store}>
      <WidgetAPI ref={ref} api={apiRef.current}>
        <AttributesContent config={config} apiRef={apiRef} />
      </WidgetAPI>
    </Provider>
  );
});

/**
 * Initializes an Attributes widget instance.
 *
 * Edits attributes on any Kinetic resource type the user has permission
 * to modify: space, userProfile, team, kapp, category, or form. User
 * Attributes are intentionally excluded — Profile already handles the
 * read-only "surface a User Attribute" case.
 *
 * The widget composes:
 *
 *   - Attribute definitions for the configured type, sourced from redux
 *     wherever possible (the bulk space fetch pre-loads space / userProfile
 *     / team / kapp / category / form attribute definitions) and falling
 *     back to a targeted fetch for the few types whose values aren't
 *     pre-cached (form, team).
 *   - Editable inputs per definition — text by default; a `<select>` (with
 *     optional "Other…" reveal) when the entry config provides an options
 *     list; repeating rows for multi-valued definitions.
 *   - An optional auto-rendered picker for kapp / team / category / form
 *     (target="picker"), styled as a Kinetic form field.
 *
 * A single Save button at the bottom commits changes. Only fields the user
 * actually edited are sent to the server, with `include` set on the update
 * call so redux can shallow-merge the response without dropping fields.
 *
 * Usage from a Kinetic form's bundle script:
 *   bundle.widgets.Attributes({
 *     container: K('content[Attrs]').element(),
 *     config: { type: 'kapp', target: 'current' },
 *     id: 'kapp-attrs',
 *   });
 *
 * @param {HTMLElement|ArrayLike<HTMLElement>} container Either a DOM
 *   element or an array-like whose first entry is one (e.g.
 *   `K('content[...]').element()`).
 * @param {Object} config All fields optional except `type`.
 * @param {string} config.type Required. One of 'space', 'userProfile',
 *   'team', 'kapp', 'category', 'form'.
 * @param {(string|Object)} [config.target] Shape depends on type. For
 *   type=kapp: 'current' | '<slug>' | { kappSlug } | 'picker'. For
 *   type=team: '<slug>' | { teamSlug } | 'picker'. For type=category:
 *   { kappSlug, categorySlug } | 'picker'. For type=form:
 *   { kappSlug, formSlug } | 'picker'. Ignored for space and userProfile.
 * @param {(string|Object)} [config.parent] Only meaningful for picker
 *   mode on category / form. 'current' resolves the current kapp via the
 *   enclosing BundleContainer (or the URL kapp); a string is treated as
 *   an explicit kapp slug; `{ kappSlug }` is the object form.
 * @param {Object} [config.attributes] Per-attribute configuration. Two
 *   keys: `exclude` (array of names to omit) and `entries` (array of
 *   per-attribute overrides). Each entry:
 *   `{ name, label?, description?, required?, options?, allowOther? }`.
 *   Same shape as Profile's `userProfileAttributes`.
 * @param {Array<string>|Array<Object>} [config.order] Explicit render
 *   order. Flat array of attribute names, or array of
 *   `{ groupTitle, fields }` objects for sectioned layout. Unlisted
 *   fields fall into an implicit untitled group at the end.
 * @param {Object} [config.classNames] Per-slot class overrides. Same
 *   convention as Profile — strings are additive, objects support
 *   `{ add?, remove? }` for surgical control.
 * @param {string} [config.pickerLabel] Override for the picker's label
 *   text. Defaults to the type's human label ("Kapp", "Team", etc.).
 *   Only meaningful when target === 'picker'.
 * @param {string} [id] Optional id used by registerWidget for instance
 *   tracking.
 */
export const Attributes = ({ container, config = {}, id } = {}) => {
  const resolved = resolveContainer(container, 'Attributes');
  if (resolved && validateConfig(config)) {
    return registerWidget(Attributes, {
      container: resolved,
      Component: AttributesComponent,
      props: { id, config },
      id,
    });
  }
  return Promise.reject(
    'The Attributes widget parameters are invalid. See the console for more details.',
  );
};
