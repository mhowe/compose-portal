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

## Status

Early-stage scaffold. The immediate roadmap:

- **Landing-page resolver** — at `/`, read space attribute `Default Kapp Slug`, then that kapp's `Default Form Slug`, then redirect to the resolved form/kapp. Fall back to a built-in embedded landing page when nothing is configured.
- **Theme widget** — port from `momentum-portal-dataprise`, rebuilt with a generic preview strategy (not customer-specific components).
- **Component class layer (`kd-*`)** — Tailwind `@layer components` classes form designers can apply as single class names (Bootstrap-style), alongside DaisyUI's built-in vocabulary.
- **Additional widgets** — navigation variants, kapp/form/submission renderers, timelines, and others discovered by putting the bundle through its paces.

## Outstanding Infra Cleanup

The following still reference `momentum-portal` and will be addressed before deployment:

- `install.rb` (`template_name = "momentum-portal"`)
- `template/export/core/space.json` (space slug/URL)
- `.github/workflows/*.yaml` (pipeline names, AWS IAM role `momentum-portal-github-oidc`)
- `frontend-testing/constants.ts` (test space URI)
