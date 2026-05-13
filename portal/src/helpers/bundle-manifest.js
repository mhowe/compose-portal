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
          "Slug of a form in the 'admin' kapp to render inline as the space landing page (/kapps). Accepts a single slug or a comma-separated, ordered list — the bundle renders the first form in the list the current user can see (and that is Active or New), so admins can give different user groups different landing forms (e.g. 'vip-home, standard-home'). May be left empty; the bundle will fall back to the built-in kapp-cards landing.",
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
          "Slug of the form rendered as the landing page for this kapp. Accepts a single slug or a comma-separated, ordered list — the bundle renders the first form in the list the current user can see (and that is Active or New), so admins can give different user groups different landing forms (e.g. 'vip-home, standard-home'). When absent or no candidate resolves, the bundle shows the default kapp page.",
      },
      {
        name: 'Theme',
        required: false,
        description:
          "JSON theme overrides applied to this kapp. Layers on top of the space-level Theme; a key set here wins. Optional — falls through to the space's Theme (and then bundle defaults) when absent.",
      },
      {
        name: 'Display - Category',
        required: false,
        allowsMultiple: true,
        description:
          "Category labels used to group or filter kapps in the Kapps widget. A kapp with multiple categories appears in each of its groups when grouped, and matches any of its categories when filtered. Free text — e.g. 'Admin', 'Tools', 'Capabilities'.",
      },
      {
        name: 'Display - Description',
        required: false,
        description:
          'Short description shown on the Kapps widget card type. Falls back to the kapp record description when empty.',
      },
      {
        name: 'Display - Icon',
        required: false,
        description:
          'Tabler icon name rendered for this kapp by the Kapps widget (e.g. "settings", "users", "chart-bar").',
      },
      {
        name: 'Display - Color',
        required: false,
        description:
          'Accent color for this kapp in the Kapps widget. One of primary, secondary, accent, success, warning, error, info, neutral — or a hex string. Renders as an accent border on cards / tiles.',
      },
      {
        name: 'Display - Hidden',
        required: false,
        description:
          "When 'true', the Kapps widget hides this kapp by default. Honored unless the widget is configured with includeHidden=true.",
      },
      {
        name: 'Display - Order',
        required: false,
        description:
          'Numeric sort key for the Kapps widget when sort="order". Lower values appear first. Missing or non-numeric values sort to the end (alphabetical fallback).',
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
        name: 'Icon',
        required: false,
        description:
          'Tabler icon name rendered for this form across the bundle (form header, settings/datastore lists, tickets, home submission cards, search results). Falls back to a sensible default per surface when empty (e.g. "forms", "checklist").',
      },
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
  // Category attribute definitions the bundle reads. Each lives on a kapp's
  // categoryAttributeDefinitions. Used by the search modal's category
  // navigation; typically deployed on any kapp whose categories drive that UI.
  category: {
    attributes: [
      {
        name: 'Icon',
        required: false,
        description:
          'Tabler icon name rendered for this category in the search modal navigation (e.g. "category", "settings", "tag"). Falls back to "category" when empty.',
      },
      {
        name: 'Hidden',
        required: false,
        description:
          'When "true", the search modal omits this category from its category navigation. The category and its forms remain reachable via other entry points.',
      },
      {
        name: 'Parent',
        required: false,
        description:
          'Slug of another category in the same kapp. When set, this category is rendered as a subcategory of the parent in the search modal\'s nested navigation. Empty means top-level.',
      },
    ],
  },
};
