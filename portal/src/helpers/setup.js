import { BUNDLE_MANIFEST } from './bundle-manifest.js';
import { ADMIN_KAPP_SLUG } from './constants.js';

/**
 * Checks whether a space record has the attribute definitions and kapps the
 * bundle requires. Looks at *definition presence*, not attribute values — a
 * defined-but-empty attribute is a valid configured state.
 *
 * @param {Object} space The fetched space record. Must have been fetched with
 *   `include: spaceAttributeDefinitions,userProfileAttributeDefinitions,kapps`.
 * @returns {{ ok: boolean, missing: Array<{scope: string, name: string, description: string, kind?: string}> }}
 */
export const checkSetup = space => {
  if (!space) return { ok: false, missing: [] };

  const spaceDefs = (space.spaceAttributeDefinitions || []).map(d => d.name);
  const userDefs = (space.userProfileAttributeDefinitions || []).map(
    d => d.name,
  );
  const kappSlugs = (space.kapps || []).map(k => k.slug);

  const missing = [];

  for (const attr of BUNDLE_MANIFEST.space.attributes) {
    if (attr.required && !spaceDefs.includes(attr.name)) {
      missing.push({ scope: 'space', kind: 'attribute', ...attr });
    }
  }
  for (const attr of BUNDLE_MANIFEST.userProfile.attributes) {
    if (attr.required && !userDefs.includes(attr.name)) {
      missing.push({ scope: 'userProfile', kind: 'attribute', ...attr });
    }
  }
  if (!kappSlugs.includes(ADMIN_KAPP_SLUG)) {
    missing.push({
      scope: 'kapp',
      kind: 'kapp',
      name: ADMIN_KAPP_SLUG,
      description:
        "The bundle looks for configuration forms (e.g., the custom space landing form) in a kapp with slug 'admin'. Create this kapp on the space.",
    });
  }

  return { ok: missing.length === 0, missing };
};

/**
 * Reads an attribute value from a record's attributesMap or
 * profileAttributesMap. Returns the first value or undefined.
 */
export const readAttribute = (record, name, map = 'attributesMap') =>
  record?.[map]?.[name]?.[0];

/**
 * Reads all values of a multi-valued attribute from a record's attributesMap
 * or profileAttributesMap. Returns an array (empty when the attribute is
 * absent or has no values).
 */
export const readAttributeValues = (record, name, map = 'attributesMap') =>
  record?.[map]?.[name] || [];

/**
 * Resolves the landing kapp slug according to the cascade:
 *   1. user profile 'Default Kapp Slug'
 *   2. space 'Default Kapp Slug'
 *   3. null (embedded landing page)
 *
 * Returns `null` when:
 *   - Neither attribute is set
 *   - The chosen slug doesn't match any kapp the user can see in `space.kapps`
 *     (at that point the caller should fall through to the next level or the
 *     embedded landing page, per the edge cases the user defined)
 *
 * @param {Object} space Fetched space record with `kapps` included.
 * @param {Object} profile Fetched user profile record.
 * @returns {{ slug: string, source: 'user'|'space' } | null}
 */
export const resolveLandingKapp = (space, profile) => {
  const availableSlugs = new Set((space?.kapps || []).map(k => k.slug));

  const userSlug = readAttribute(
    profile,
    'Default Kapp Slug',
    'profileAttributesMap',
  );
  if (userSlug && availableSlugs.has(userSlug)) {
    return { slug: userSlug, source: 'user' };
  }

  const spaceSlug = readAttribute(space, 'Default Kapp Slug');
  if (spaceSlug && availableSlugs.has(spaceSlug)) {
    return { slug: spaceSlug, source: 'space' };
  }

  return null;
};

/**
 * Splits a comma-separated attribute value into an ordered list of slugs.
 * Trims each entry and drops empties. Order is preserved deliberately — the
 * landing resolvers walk the list and render the first slug the user can
 * actually see, so admins can target user-group precedence by sequence
 * (e.g. "vip-form, standard-form" lets space admins land on the VIP form
 * while everyone else falls through to the standard one).
 *
 * Returns an empty array when the value is missing or only whitespace/commas.
 */
export const parseSlugCsv = value =>
  typeof value === 'string'
    ? value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];

/**
 * Given a kapp record (with attributesMap included), reads its
 * 'Default Form Slug' attribute as an ordered list of candidate slugs.
 * The kapp landing page walks this list and renders the first form the
 * user can access (and that is Active or New). Returns an empty array
 * when the attribute is absent or empty.
 */
export const readKappDefaultFormSlugs = kapp =>
  parseSlugCsv(readAttribute(kapp, 'Default Form Slug'));

/**
 * Given a space record (with attributesMap included), reads its
 * 'Default Space Form Slug' attribute as an ordered list of candidate
 * slugs. Forms are always expected to live in the admin kapp
 * (ADMIN_KAPP_SLUG). The space landing walks this list and renders
 * the first form the user can access (and that is Active or New).
 * Returns an empty array when the attribute is absent or empty.
 */
export const readSpaceDefaultFormSlugs = space =>
  parseSlugCsv(readAttribute(space, 'Default Space Form Slug'));

/**
 * Given a space record (with attributesMap included), reads its
 * 'Default Profile Form Slug' attribute as an ordered list of candidate
 * slugs. Forms are always expected to live in the admin kapp
 * (ADMIN_KAPP_SLUG). The /profile resolver walks this list and renders
 * the first form the user can access (and that is Active or New),
 * falling through to the built-in profile page when none resolve.
 * Returns an empty array when the attribute is absent or empty.
 */
export const readSpaceDefaultProfileFormSlugs = space =>
  parseSlugCsv(readAttribute(space, 'Default Profile Form Slug'));

// Bundle's chrome-or-not decision for landing forms. Anything other than
// 'fullscreen' (case-insensitive, trimmed) is treated as embedded so the
// default — and any typo — keeps today's behavior.
export const FORM_DISPLAY_MODE_EMBEDDED = 'embedded';
export const FORM_DISPLAY_MODE_FULLSCREEN = 'fullscreen';

/**
 * Given a form record (with attributesMap included), reads its 'Display Mode'
 * attribute. Returns FORM_DISPLAY_MODE_FULLSCREEN or FORM_DISPLAY_MODE_EMBEDDED
 * (the default).
 */
export const readFormDisplayMode = form => {
  const raw = readAttribute(form, 'Display Mode');
  return raw && raw.trim().toLowerCase() === FORM_DISPLAY_MODE_FULLSCREEN
    ? FORM_DISPLAY_MODE_FULLSCREEN
    : FORM_DISPLAY_MODE_EMBEDDED;
};

// Per-form preference for how a form renders when loaded inside a
// BundleContainer. 'bare' strips PageHeading + the page wrappers (gutter,
// max-width centering, bordered content card). 'default' (any other value or
// missing) preserves today's full chrome. Only consulted in container mode;
// has no effect on top-level page routes.
export const FORM_CHROME_DEFAULT = 'default';
export const FORM_CHROME_BARE = 'bare';

/**
 * Given a form record (with attributesMap included), reads its 'Form Chrome'
 * attribute. Returns FORM_CHROME_BARE or FORM_CHROME_DEFAULT (the default).
 */
export const readFormChrome = form => {
  const raw = readAttribute(form, 'Form Chrome');
  return raw && raw.trim().toLowerCase() === FORM_CHROME_BARE
    ? FORM_CHROME_BARE
    : FORM_CHROME_DEFAULT;
};

/**
 * Returns the full status of every manifest item against the live space,
 * including optional items. Used by Space Settings to render every row the
 * admin can inspect or deploy — a superset of checkSetup's `missing` array
 * (which only includes blocking / required items).
 *
 * Shape of each returned item:
 *   {
 *     scope: 'space' | 'userProfile' | 'kapp-existence' | 'kapp-attribute' | 'category-attribute' | 'form-attribute',
 *     scopeLabel: string,       // human label for UI
 *     kind: 'attribute' | 'kapp',
 *     name: string,             // attribute name or kapp slug
 *     description: string,
 *     required: boolean,        // true if this item blocks setup.ok
 *     present: boolean,
 *     attributeType?: string,   // SDK attribute type when kind === 'attribute'
 *     kappSlug?: string,        // which kapp this applies to, for kapp-attribute / category-attribute / form-attribute
 *   }
 *
 * @param {Object} space Fetched space record. Must include space,
 *   userProfile, and kapp attribute definitions, plus kapps.
 * @returns {Array<Object>}
 */
export const getManifestStatus = space => {
  if (!space) return [];

  const spaceDefs = new Set(
    (space.spaceAttributeDefinitions || []).map(d => d.name),
  );
  const userDefs = new Set(
    (space.userProfileAttributeDefinitions || []).map(d => d.name),
  );
  const kapps = space.kapps || [];
  const kappSlugs = new Set(kapps.map(k => k.slug));

  const rows = [];

  for (const attr of BUNDLE_MANIFEST.space.attributes) {
    rows.push({
      scope: 'space',
      scopeLabel: 'Space',
      kind: 'attribute',
      attributeType: 'spaceAttributeDefinitions',
      name: attr.name,
      description: attr.description,
      required: !!attr.required,
      allowsMultiple: !!attr.allowsMultiple,
      present: spaceDefs.has(attr.name),
    });
  }
  for (const attr of BUNDLE_MANIFEST.userProfile.attributes) {
    rows.push({
      scope: 'userProfile',
      scopeLabel: 'User Profile',
      kind: 'attribute',
      attributeType: 'userProfileAttributeDefinitions',
      name: attr.name,
      description: attr.description,
      required: !!attr.required,
      allowsMultiple: !!attr.allowsMultiple,
      present: userDefs.has(attr.name),
    });
  }
  rows.push({
    scope: 'kapp-existence',
    scopeLabel: 'Kapp',
    kind: 'kapp',
    name: ADMIN_KAPP_SLUG,
    description:
      "The bundle looks for configuration forms (e.g., the custom space landing form) in a kapp with slug 'admin'. Create this kapp on the space.",
    required: true,
    present: kappSlugs.has(ADMIN_KAPP_SLUG),
  });
  for (const attr of BUNDLE_MANIFEST.kapp.attributes) {
    for (const kapp of kapps) {
      const kappDefs = new Set(
        (kapp.kappAttributeDefinitions || []).map(d => d.name),
      );
      rows.push({
        scope: 'kapp-attribute',
        scopeLabel: `Kapp: ${kapp.slug}`,
        kind: 'attribute',
        attributeType: 'kappAttributeDefinitions',
        kappSlug: kapp.slug,
        name: attr.name,
        description: attr.description,
        required: !!attr.required,
        allowsMultiple: !!attr.allowsMultiple,
        present: kappDefs.has(attr.name),
      });
    }
  }
  for (const attr of (BUNDLE_MANIFEST.category?.attributes || [])) {
    for (const kapp of kapps) {
      const catDefs = new Set(
        (kapp.categoryAttributeDefinitions || []).map(d => d.name),
      );
      rows.push({
        scope: 'category-attribute',
        scopeLabel: `Kapp: ${kapp.slug} — Categories`,
        kind: 'attribute',
        attributeType: 'categoryAttributeDefinitions',
        kappSlug: kapp.slug,
        name: attr.name,
        description: attr.description,
        required: !!attr.required,
        allowsMultiple: !!attr.allowsMultiple,
        present: catDefs.has(attr.name),
      });
    }
  }
  for (const attr of (BUNDLE_MANIFEST.form?.attributes || [])) {
    for (const kapp of kapps) {
      const formDefs = new Set(
        (kapp.formAttributeDefinitions || []).map(d => d.name),
      );
      rows.push({
        scope: 'form-attribute',
        scopeLabel: `Kapp: ${kapp.slug} — Forms`,
        kind: 'attribute',
        attributeType: 'formAttributeDefinitions',
        kappSlug: kapp.slug,
        name: attr.name,
        description: attr.description,
        required: !!attr.required,
        allowsMultiple: !!attr.allowsMultiple,
        present: formDefs.has(attr.name),
      });
    }
  }

  return rows;
};
