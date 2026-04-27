# Compose Portal

A form-driven Kinetic Platform bundle: one reusable portal where forms compose the UI via widgets the bundle exposes. Designed so customers configure their experience through Kinetic forms, attributes, and widgets rather than through per-customer React forks.

Forked from [momentum-portal](https://github.com/kineticdata/momentum-portal) as the base and diverged from there.

## Directory Layout

- [`portal/`](portal/) — front-end code (React + Vite). [Getting Started](portal/README.md).
- [`portal/src/components/kinetic-form/widgets/`](portal/src/components/kinetic-form/widgets/README.md) — widgets exposed to Kinetic forms.
- [`template/`](template/) — Kinetic Platform template export data (forms, kapps, space config). Still references the upstream momentum-portal install until Compose Portal's own template artifacts are generated.
- [`frontend-testing/`](frontend-testing/) — Playwright tests against a live Kinetic environment.

## Quick Start

```bash
cd portal
yarn install
yarn start
```

You'll be prompted for a Kinetic Platform space URL (e.g. `https://your-space.kinops.io`). The dev server proxies API calls to that space and serves the portal on [http://localhost:3000](http://localhost:3000).

## Reference Material

The original momentum-portal home page is preserved and accessible in the running app at [`/_reference/legacy-home`](http://localhost:3000/#/_reference/legacy-home) (requires login). Use it as a visual/UX reference when building the form-driven replacement — especially when designing a form-based landing page for the service-portal kapp. The underlying components live at `portal/src/pages/home/` and `portal/src/components/home/` and are not linked from production UI.

The momentum tickets pages (`/actions`, `/requests`) also remain in place as reference implementations; remove or modularize them once Compose Portal's own equivalents land.

## Status

Early-stage scaffold. What's working:

- **Landing-page resolver** at `/` — cascades through user profile `Default Kapp Slug` → space `Default Kapp Slug` → embedded landing. Redirects to `/kapps/:slug` when a target kapp resolves; the kapp page handles form rendering from there.
- **Inline form rendering** driven by attributes:
  - `/kapps` renders the form named by space attribute `Default Space Form Slug` (expected to live in the `admin` kapp) when set; otherwise renders the kapp-cards landing.
  - `/kapps/:slug` renders the form named by the kapp's `Default Form Slug` attribute when set; otherwise renders the forms table.
  - In both cases, if the configured slug doesn't exist, the bundle falls through to its built-in view.
- **Admin kapp convention** — a kapp with slug `admin` is expected on the space and is where bundle-level configuration forms live. Flagged by the setup check when missing.
- **Setup check + Deploy action** — Space Settings detects missing attribute definitions and the admin kapp; clicking Deploy creates them via the SDK. Required-missing items block setup; optional items (per-kapp `Default Form Slug`) are surfaced informationally.
- **Capability registry** — Space Settings reads registry URLs from the `Capability Registry URLs` space attribute, fetches index + manifests, displays available capabilities with installed-status detection (via `Capability Metadata` attribute on each kapp).
- **Capability installer** — installs spaceConfiguration (user/team attrs), connections + their operations, the kapp from `kapp.json`, the kapp's `Capability Metadata` definition, forms + CSV seed data, and writes the canonical `Capability Metadata` value. Idempotent: re-installs replace bundle-scoped content (kapp, forms, operations) but leave admin-scoped content (connection credentials, seeded form submissions) alone.
- **Header navigation** — logo links to `/` (personalized home via resolver), a "grid" icon to the right of the logo links to `/kapps` (space home), hamburger menu is reserved for kapp-driven navigation.
- **Component class layer (`kd-*`)** — Tailwind `@layer components` classes form designers can apply as single class names (Bootstrap-style), alongside DaisyUI's built-in `k*` vocabulary.

Roadmap:

- **Capability installer Phase 4c** — task handler upload + properties PUT, workflow trees + routines, post-install manual_steps UI.
- **Capability upgrade flow** — version-aware re-install with diff detection on bundle-scoped content; surface what changed before applying.
- **Force-overwrite toggle on install** — explicit checkbox in the install modal to opt into overwriting kapps/forms that aren't currently tagged with this capability's metadata. Today the installer's slug fallback handles the common re-install case; this toggle covers genuinely-conflicting admin work.
- **Customization detection** — SHA-256 checksums on capability assets so admins see which parts of an installed capability have been modified locally.
- **Kapp-driven hamburger menu** — read a kapp attribute (likely JSON) to populate the within-kapp navigation.
- **Theme editor rebuild** — cascade between space and kapp `Theme` attributes; entry points from Space Settings and (future) Kapp Settings pages.
- **Additional widgets** — navigation variants, kapp/form/submission renderers, timelines, and others discovered by putting the bundle through its paces.

## Outstanding Infra Cleanup

The following still reference `momentum-portal` and will be addressed before deployment:

- `install.rb` (`template_name = "momentum-portal"`)
- `template/export/core/space.json` (space slug/URL)
- `.github/workflows/*.yaml` (pipeline names, AWS IAM role `momentum-portal-github-oidc`)
- `frontend-testing/constants.ts` (test space URI)
