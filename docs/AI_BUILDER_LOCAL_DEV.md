# AI Builder — Local Development & Production Strategy

How the AI Builder Assistant is wired together in local dev, how to test it end-to-end, and how the same architecture lifts into production.

## What "AI Builder" is

A Claude-powered assistant for building Kinetic Platform spaces — kapps, forms, workflows, themes — through natural language. Surfaces inside any bundle via widgets; everything else is back-end services and skills.

The system is shipped, not a plan. It runs against the playground space today.

## The three moving parts

| Part | What it is | Local port | Deployed where (target) |
|---|---|---|---|
| **Bundle** (compose-portal) | React frontend exposing the AI Builder widgets to forms. Also serves bundle-specific skills and widget API docs over HTTP. | 3000 (Vite) | S3/CloudFront per tenant (existing pattern) |
| **MCP server** (`kinetic-platform-mgnt-mcp-server`) | Generic Kinetic Platform API surface as MCP tools. Auto-generated from `oas/core.json`. Auth: HTTP Basic. | 3001 (HTTP) | EKS pod per tenant |
| **Companion service** (`ai-builder-companion`) | Node/Express agent loop. Owns the Anthropic SDK, settings, skills, project memory, conversation persistence. Talks to MCP for Kinetic operations. | 4000 | EKS pod per tenant |

Plus two content sources the companion loads:
- **Skills repo** — `kinetic-platform-ai-skills` (separate GitHub repo, generic platform reasoning)
- **Bundle skills + widget docs** — served by Vite from the running bundle at `/skills` and `/widget-docs`

## Local layout (current)

```
~/dev/
├── ai-builder-companion/                      # Node service, port 4000 (on GitHub: mhowe/ai-builder-companion)
├── bundle-development/
│   ├── compose-portal/                        # The bundle (Vite, port 3000)
│   │   └── portal/
│   │       ├── src/components/kinetic-form/widgets/
│   │       │   ├── ai-builder-chat.jsx
│   │       │   ├── ai-builder-settings.js
│   │       │   └── ai-builder-workspace.jsx
│   │       └── public/skills/                 # Bundle-specific skills, served at /skills
│   └── kinetic-platform-ai-skills/            # Generic skills (separate GitHub repo)
└── mcpservers/kineticplatform/
    └── kinetic-platform-mgnt-mcp-server/      # MCP server, port 3001 (on GitHub: kineticdata/kinetic-platform-mgnt-mcp-server)
```

**Repo status as of 2026-05-13:**
- `compose-portal` → on GitHub
- `kinetic-platform-mgnt-mcp-server` → on GitHub (`kineticdata/kinetic-platform-mgnt-mcp-server`). Started from one of the community/internal forks; has local mods.
- `kinetic-platform-ai-skills` → on GitHub
- `ai-builder-companion` → on GitHub (`mhowe/ai-builder-companion`). Initialized and published 2026-05-13. Long-term home (personal vs. `kineticdata` org, and how it ships to customers — standalone install vs. bundled into a "capability package") is still to be decided.

## Prerequisites

- Node 20+
- Anthropic API key (BYO — companion never carries inference cost; customer pays Anthropic directly)
- A Kinetic space with the AI Builder storage kapp installed:
  - Kapp slug: `capability-ai-builder-assistant` (renameable per tenant — widget passes `storage_kapp_slug` per request)
  - Forms: `ai-builder-conversations`, `ai-builder-projects`
  - Service account: e.g. `ai-builder-companion` (used by the MCP server to read/write submissions)
- Playground space available for development: `playground-matthew-howe.kinopsdev.io`

## Startup order

**Bundle first → MCP server → companion service.** Order matters because the companion reads skills + widget docs over HTTP from the bundle when it boots and on every `read_skill` call.

### 1. Bundle (port 3000)

```bash
cd ~/dev/bundle-development/compose-portal/portal
yarn start
```

When prompted, point at the playground space URL.

Confirm the bundle skill roots are reachable:
- `http://localhost:3000/skills/CLAUDE.md` → bundle skills index
- `http://localhost:3000/widget-docs/CLAUDE.md` → auto-generated widget API index

If either of these returns the SPA HTML shell instead of markdown, something's off — the companion has a guard for this (`fetchTextOrNull` detects `<!doctype`/`<html>` and falls through to the next skill root), but you want the bundle correct anyway.

### 2. MCP server (port 3001)

```bash
cd ~/dev/mcpservers/kineticplatform/kinetic-platform-mgnt-mcp-server

MCP_HTTP_HOST=127.0.0.1 \
MCP_HTTP_PORT=3001 \
MCP_HTTP_USER=companion \
MCP_HTTP_PASS=devpass-change-me \
KINETIC_SERVER_URL=https://playground-matthew-howe.kinopsdev.io \
KINETIC_USERNAME=ai-builder-companion \
KINETIC_PASSWORD='...redacted...' \
npm run start:http
```

The MCP server's `KINETIC_*` env vars provide a default connection; per-session `connect` tool calls can override. The companion only needs the HTTP creds plus URL.

**Caveats** to remember:
- In-memory event store — not horizontally scalable. Fine in dev, needs Redis/etc. for prod scale.
- HTTP Basic auth only. Acceptable behind a service mesh; not for public exposure.
- Default bind is `127.0.0.1` (loopback) — explicit `MCP_HTTP_HOST=0.0.0.0` needed for inter-pod traffic in K8s.

### 3. Companion service (port 4000)

```bash
cd ~/dev/ai-builder-companion
npm run dev   # or: npm start
```

`.env` config (see `.env.example` for the full list):
- `ANTHROPIC_API_KEY` — bootstrap value; once set via the AIBuilderSettings widget, `data/settings.json` takes precedence
- `MCP_URL=http://127.0.0.1:3001/mcp`, `MCP_USER`, `MCP_PASS` — must match step 2
- `SKILLS_DIRS=/Users/matthewhowe/dev/bundle-development/kinetic-platform-ai-skills,http://localhost:3000/skills,http://localhost:3000/widget-docs`
- `STORAGE_KAPP_SLUG=capability-ai-builder-assistant` (fallback only; widget overrides per-request)
- `ALLOWED_ORIGINS` — leave empty in dev (defaults to `localhost:3000/4000/5173`)

## Testing the stack

### Smoke tests (no bundle required)

```bash
# Companion alive
curl http://localhost:4000/health

# MCP tools enumerated through companion
curl http://localhost:4000/mcp/tools

# Settings (model, max_tokens, max_iterations, available_models)
curl http://localhost:4000/settings
```

### Test page (no bundle required)

`http://localhost:4000/test/chat.html` — vanilla HTML chat client served by the companion. Useful for verifying the agent loop, MCP tool calls, and skill loading without involving widgets, kapps, or CORS.

### End-to-end through the bundle

1. In the playground space, create or open a form that includes the AI Builder widgets. The simplest harness is one form rendering `AIBuilderWorkspace` (which composes the project picker, conversation list, and `AIBuilderChat` internally).
2. Pass the companion endpoint into the widget. The convention is a kapp attribute (e.g. `Companion Service URL`) that resolves to `http://localhost:4000/chat/stream` in dev. The widget reads it via `kapp('attribute:Companion Service URL')`.
3. Settings page: a separate form using the `AIBuilderSettings` widget exposes the imperative API for runtime config (API key, model, token limits). Admin-only by permission.
4. Try a prompt that exercises an MCP call (e.g. "list the kapps in this space") — should see a tool-call card render in the chat and a list come back.

### What "working" looks like

- Companion logs show: settings loaded, MCP client connected, skills index loaded from all three roots
- `/health` returns `{"status":"ok"}`
- Chat sends a message; SSE stream returns text + tool-call cards
- A conversation row appears in `ai-builder-conversations` in the playground space
- The model pill in the chat header matches what's saved in settings

## Production strategy

Same architecture, different deployment substrate.

### Per-tenant EKS namespace

Each customer gets their own namespace running:
- One companion service pod (Node)
- One MCP server pod (Node)
- Both behind an internal ingress; only the companion is reachable from the customer's bundle origin (CORS-pinned)

The MCP server is **not** exposed externally. Companion ↔ MCP traffic stays inside the namespace.

### Secrets via K8s Secrets

- `ANTHROPIC_API_KEY` — bootstrap secret, overrideable via settings (and ultimately via encrypted kapp attribute in v0.6.5b)
- `MCP_USER` / `MCP_PASS` — Basic auth between companion and MCP server
- `KINETIC_USERNAME` / `KINETIC_PASSWORD` — service account credentials for the MCP server to act in the customer's space

The companion's current local-file settings store (`data/settings.json`) becomes a transitional artifact:
- **v0.6.5a (now):** local JSON file, 0600 perms, gitignored
- **v0.6.5b (planned):** encrypted kapp attribute, removing the persistent disk requirement entirely so pods can be ephemeral

### Bundle and skills delivery

- Bundle ships skills (`portal/public/skills/`) and widget docs (`portal/build/widget-docs/`) as static assets via the existing S3/CloudFront pipeline. No special deploy step — Vite copies `public/` verbatim into `build/`.
- The companion's `SKILLS_DIRS` config points at the deployed bundle URL in production (e.g. `https://customer.kinopsdev.io/skills,https://customer.kinopsdev.io/widget-docs`) instead of `localhost:3000`. Same multi-source loader; same HTTP fetch path.
- Customer-specific skills can be layered by prepending another path to `SKILLS_DIRS` (filesystem mount or HTTP URL).

### Auth between widget and companion

**Currently:** CORS + open endpoints. Acceptable for dev, not for production.

**Production target (open):** Kinetic-issued tokens. The bundle is already authenticated against the space; pass a short-lived token in the request to the companion, and the companion validates it against the space before serving. Listed under "Open items" in the AI Builder Assistant project memory.

### Why this shape

- **Per-tenant deploy, not multi-tenant SaaS:** customer data, API keys, and MCP credentials never cross tenant boundaries. Easier compliance story, simpler blast radius.
- **BYO Anthropic key:** we don't pay for inference. Removes a whole category of cost-control machinery from our side and aligns customer spend with customer usage.
- **Storage in the customer's own space:** conversations and project memory live in the customer's Kinetic space, not in our infra. Customer keeps their AI history; we don't.
- **Skills shipped with the bundle:** the bundle is the source of truth for both what UI ships and how AI reasons about it. One deploy, both artifacts updated.

## Open questions / strategic decisions still pending

- **Companion service repo home.** Now published at `mhowe/ai-builder-companion`. Still TBD: whether it stays under a personal account or moves to the `kineticdata` org, and whether it ships to customers as a standalone install or gets packaged into a "capability bundle" alongside the storage kapp + skills.
- **Encrypted settings storage** (v0.6.5b) — moves Anthropic API key out of the local JSON file
- **Kinetic-issued auth tokens** between widget and companion
- **MCP server event store** — current in-memory implementation doesn't survive pod restarts or horizontal scaling. Needs Redis or equivalent before serious prod load.
- **Cost dashboards + budget caps** (v0.9 on the AI Builder roadmap) — needed before any per-user or per-conversation cap can be designed without guessing thresholds.
- **Bedrock / Vertex AI support** — for enterprise customers with cloud spend commits who can't or won't use the Anthropic API directly.

## References

### Code paths
- Companion service: `~/dev/ai-builder-companion/src/server.js` (single-file agent loop)
- Widgets: `compose-portal/portal/src/components/kinetic-form/widgets/ai-builder-{chat,settings,workspace}.{jsx,js}`
- Widget docs (HTTP): `compose-portal/portal/vite.config.js` → `widgetDocsPlugin`
- Skills index (bundle): `compose-portal/portal/public/skills/CLAUDE.md`
- MCP server: `~/dev/mcpservers/kineticplatform/kinetic-platform-mgnt-mcp-server/`

### Companion HTTP surface

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET /mcp/tools` | List the curated MCP tool allowlist |
| `GET /settings` | Current settings (model, max_tokens, max_iterations, available_models) |
| `POST /settings` | Update settings; per-field clearing via `null` / `''` |
| `POST /settings/test-api-key` | Validate an Anthropic API key without saving |
| `POST /chat` | One-shot JSON chat |
| `POST /chat/stream` | SSE-streamed chat (what the widget uses) |
| `GET /conversations/:id` | Resume a stored conversation |
| `PATCH /conversations/:id` | Update title / project link / status |
| `GET /conversations` | List (filter by `project_slug`, including `__none__` for orphans) |
| `GET /projects` | List projects in the storage kapp |
| `POST /projects` | Create a project |

### Widget endpoints

The widgets are wired to read the companion URL from a kapp attribute (typical name: `Companion Service URL`). In dev, set the attribute value to `http://localhost:4000/chat/stream`. The widget derives `/settings`, `/conversations`, etc. by string-replacing the suffix. See `AI_BUILDER_CHAT.md` for the full props and `AI_BUILDER_WORKSPACE.md` for the wrapper.
