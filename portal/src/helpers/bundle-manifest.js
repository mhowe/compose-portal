/*
 * Bundle Manifest
 *
 * Declares the attribute definitions the bundle expects to exist on the space
 * in order to work correctly. Values may be empty (admin hasn't configured
 * yet) — we only require the *definitions* to exist.
 *
 * Adding a new expected setting later means adding it here once; the setup
 * check, Space Settings page, and (eventually) Deploy action all read from
 * this single source of truth.
 *
 * Each entry:
 *   - name: the attribute definition name as it appears in Kinetic
 *   - description: what Kinetic should show as the definition's description
 *     (used when deploying missing definitions)
 *   - required: if true, the setup check flags this as missing when absent
 */

export const BUNDLE_MANIFEST = {
  space: {
    attributes: [
      {
        name: 'Default Kapp Slug',
        required: true,
        description:
          'Slug of the kapp the portal lands on by default. May be left empty; the bundle will fall through to its embedded landing page.',
      },
    ],
  },
  userProfile: {
    attributes: [
      {
        name: 'Default Kapp Slug',
        required: true,
        description:
          "Slug of the user's preferred landing kapp. Overrides the space-level default when set.",
      },
    ],
  },
  kapp: {
    // Not part of the setup check today — these are optional per-kapp overrides
    // that the resolver reads when present. Listed here so the Space Settings
    // page can surface them as "available on each kapp" later.
    attributes: [
      {
        name: 'Default Form Slug',
        required: false,
        description:
          'Slug of the form rendered as the landing page for this kapp. When absent, the bundle shows the default kapp page.',
      },
    ],
  },
};
