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
      {
        name: 'Default Space Form Slug',
        required: true,
        description:
          "Slug of a form in the 'admin' kapp to render inline as the space landing page (/kapps). May be left empty; the bundle will fall back to the built-in kapp-cards landing.",
      },
      {
        name: 'Capability Registry URLs',
        required: true,
        allowsMultiple: true,
        description:
          'URLs of Compose Portal capability registry index.json files. Multiple allowed; the bundle fetches and merges each. Leave empty to hide the Capabilities section.',
      },
      {
        name: 'Theme',
        required: false,
        description:
          'JSON theme overrides applied to the whole space (colors, radius, logo). Optional — bundle defaults are used when absent. Per-kapp Theme attributes layer on top of this.',
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
      {
        name: 'Theme',
        required: false,
        description:
          "JSON theme overrides applied to this kapp. Layers on top of the space-level Theme; a key set here wins. Optional — falls through to the space's Theme (and then bundle defaults) when absent.",
      },
    ],
  },
  // Form attribute definitions the bundle reads. Each lives on a kapp's
  // formAttributeDefinitions; whether it's defined on the admin kapp,
  // every kapp, or just specific kapps is an installation concern. Kept
  // separately from kapp.attributes so the deploy/setup flow can treat
  // them appropriately when we wire that up.
  form: {
    attributes: [
      {
        name: 'Display Mode',
        required: false,
        description:
          'Controls how the bundle frames a form when it is rendered as a landing page (space landing or kapp landing). "embedded" (default) renders inside the bundle chrome — header, navigation, avatar. "fullscreen" renders the form alone with no bundle chrome; the form is responsible for any chrome it wants via widgets.',
        values: ['embedded', 'fullscreen'],
      },
      {
        name: 'Form Chrome',
        required: false,
        description:
          'Controls how the form is wrapped when loaded inside a BundleContainer. "default" renders the standard page wrapper — icon, form name, settings link (space admins), gutter, max-width container, and bordered content card. "bare" strips all of that and renders just the form content, useful for forms embedded into a host page that owns its own layout. Only consulted in container mode; a BundleContainer with hideFormChrome=true overrides this to bare regardless of attribute value.',
        values: ['default', 'bare'],
      },
    ],
  },
};
