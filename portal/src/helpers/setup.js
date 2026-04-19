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
 * Given a kapp record (with attributesMap included), reads its
 * 'Default Form Slug' attribute value. Returns the slug or undefined.
 */
export const readKappDefaultFormSlug = kapp =>
  readAttribute(kapp, 'Default Form Slug');

/**
 * Given a space record (with attributesMap included), reads its
 * 'Default Space Form Slug' attribute value. Returns the slug or undefined.
 *
 * That form is always expected to live in the admin kapp (ADMIN_KAPP_SLUG).
 */
export const readSpaceDefaultFormSlug = space =>
  readAttribute(space, 'Default Space Form Slug');
