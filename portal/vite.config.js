import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Exposes every .md file in src/components/kinetic-form/widgets at
// /widget-docs/* so Kinetic forms (and the AI Builder companion) can fetch
// widget reference docs without us hand-mirroring files into public/.
//   GET /widget-docs/index.json  -> [{ id, file, title, description }]
//   GET /widget-docs/CLAUDE.md   -> auto-generated skill index (loaded by the
//                                   AI Builder companion when /widget-docs is
//                                   configured as a SKILLS_DIRS root)
//   GET /widget-docs/<FILE>.md   -> raw markdown
function widgetDocsPlugin() {
  const widgetsDir = path.resolve(
    __dirname,
    'src/components/kinetic-form/widgets',
  );

  const slug = file =>
    file.replace(/\.md$/i, '').toLowerCase().replace(/_/g, '-');

  // First "## <Name> Widget" wins; falls back to first "# " heading;
  // falls back to the slug. Keeps title extraction tolerant of the
  // back-link line at the top of each widget doc. Also reports whether
  // the source heading ended with " Widget", so the generated index can
  // distinguish widget docs from reference docs (Styles / Utils / etc.).
  const titleFrom = content => {
    const h2 = content.match(/^##\s+(.+?)\s*$/m);
    if (h2) {
      const raw = h2[1].trim();
      const isWidget = / Widget$/.test(raw);
      return { title: raw.replace(/\s+Widget$/, '').trim(), isWidget };
    }
    const h1 = content.match(/^#\s+(.+?)\s*$/m);
    if (h1) return { title: h1[1].trim(), isWidget: false };
    return { title: null, isWidget: false };
  };

  // First paragraph after the first H2 (or H1). Used as the one-line
  // description in the generated CLAUDE.md skill index. Returns null when
  // the doc opens with a list / table / heading instead of prose — those
  // are filtered out of the index (notably README.md, which is a TOC).
  const descriptionFrom = content => {
    let idx = content.search(/^##\s+/m);
    if (idx === -1) idx = content.search(/^#\s+/m);
    if (idx === -1) return null;
    const afterTitle = content.slice(idx).replace(/^#{1,6}\s+.+\n/, '');
    const lines = afterTitle.split('\n');
    const para = [];
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (para.length === 0) {
        if (line.trim() === '') continue;
        if (
          line.startsWith('```') ||
          line.startsWith('#') ||
          line.startsWith('- ') ||
          line.startsWith('* ') ||
          line.startsWith('|') ||
          line.startsWith('> ')
        ) {
          return null;
        }
        para.push(line.trim());
      } else {
        if (line.trim() === '') break;
        if (line.startsWith('```') || line.startsWith('#')) break;
        para.push(line.trim());
      }
    }
    if (para.length === 0) return null;
    return para.join(' ').replace(/\s+/g, ' ').trim();
  };

  const collect = () => {
    if (!fs.existsSync(widgetsDir)) return { docs: [], index: [] };
    const files = fs
      .readdirSync(widgetsDir)
      .filter(f => f.toLowerCase().endsWith('.md'))
      .sort();
    const docs = files.map(file => {
      const content = fs.readFileSync(path.join(widgetsDir, file), 'utf8');
      const { title, isWidget } = titleFrom(content);
      return {
        id: slug(file),
        file,
        title: title || slug(file),
        isWidget,
        description: descriptionFrom(content),
        content,
      };
    });
    const index = docs.map(({ content, ...meta }) => meta);
    return { docs, index };
  };

  // Generates the skill-index markdown the AI Builder companion loads at
  // startup. Only docs with an extractable description are listed — docs
  // like README.md (TOC, not prose) are omitted intentionally. Widgets and
  // reference docs (Styles / Utils / Chrome Widget Actions) are split into
  // separate tables so the assistant has a clear picture of what's a widget
  // vs. what's supporting documentation.
  const buildClaudeMd = index => {
    // Escape pipes inside description text so they don't break the table.
    // Backticks alone don't protect pipes in GFM table cells.
    const escape = s => s.replace(/\|/g, '\\|');
    const toRow = d =>
      `| \`${d.title}\` | \`${d.file}\` | ${escape(d.description)} |`;
    const widgetRows = index
      .filter(d => d.description && d.isWidget)
      .map(toRow)
      .join('\n');
    const refRows = index
      .filter(d => d.description && !d.isWidget)
      .map(toRow)
      .join('\n');
    return `# Widget API Reference

Auto-generated index of every widget doc in \`compose-portal/portal/src/components/kinetic-form/widgets/\`. Loaded by the AI Builder companion service when \`/widget-docs/\` is configured as a \`SKILLS_DIRS\` root.

These are **API references** — they document what each widget does and how to call it. For *when* and *why* to compose widgets into common surfaces, see the bundle skills index at \`portal/public/skills/CLAUDE.md\` (a separate skill root).

When you need a widget's full API (parameters, config, examples), load the doc via \`read_skill('<FILE>.md')\` — paths are relative to this root.

## Widgets

| Widget | File | Description |
|---|---|---|
${widgetRows}

## Reference docs

Cross-cutting documentation shared across widgets — load these when you need to understand a system that multiple widgets reference.

| Doc | File | Description |
|---|---|---|
${refRows}

## Notes for the assistant

- Every entry above is a full API spec. Load on demand — don't speculate about a widget's signature.
- Widget docs cross-reference each other by relative \`.md\` link (e.g. \`[BundleLogo](BUNDLE_LOGO.md)\`). When you see one, you can follow it with \`read_skill('BUNDLE_LOGO.md')\`.
- The widget call signature is always \`bundle.widgets.<Name>({ container, config, id, ... })\`. The \`container\` accepts either a raw \`HTMLElement\` or the array-like wrapper from \`K('content[Name]').element()\`.
`;
  };

  return {
    name: 'widget-docs',

    configureServer(server) {
      server.middlewares.use('/widget-docs', (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const { docs, index } = collect();
        if (url === '/' || url === '' || url === '/index.json') {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          return res.end(JSON.stringify(index, null, 2));
        }
        if (url === '/CLAUDE.md') {
          res.setHeader('content-type', 'text/markdown; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          return res.end(buildClaudeMd(index));
        }
        const match = docs.find(d => `/${d.file}` === url);
        if (match) {
          res.setHeader('content-type', 'text/markdown; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          return res.end(match.content);
        }
        // The /widget-docs prefix is owned by this plugin — falling through
        // to Vite's SPA fallback would return index.html for missing files,
        // which the AI Builder companion's read_skill tool would then mistake
        // for a real skill. 404 keeps the prefix honest.
        res.statusCode = 404;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        return res.end('widget-docs: not found');
      });
    },

    generateBundle() {
      const { docs, index } = collect();
      this.emitFile({
        type: 'asset',
        fileName: 'widget-docs/index.json',
        source: JSON.stringify(index, null, 2),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'widget-docs/CLAUDE.md',
        source: buildClaudeMd(index),
      });
      docs.forEach(({ file, content }) => {
        this.emitFile({
          type: 'asset',
          fileName: `widget-docs/${file}`,
          source: content,
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const removeSecure = cookie => cookie.replace(/;\s*Secure/i, '');
  const removeSameSiteNone = cookie => cookie.replace(/;\s*SameSite=None/i, '');

  return {
    build: {
      outDir: 'build',
    },
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
      charset: 'ascii',
    },
    optimizeDeps: {
      force: true,
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    plugins: [react(), svgr(), tailwindcss(), widgetDocsPlugin()],
    base: env.PUBLIC_URL,
    server: {
      port: 3000,
      proxy: {
        // In order for the Core canonical routes to work you must assume that
        // everything gets proxied to Core, absolutely everything, except the
        // things which are expressly served from the dev server. So we will
        // bypass proxying only for the following:
        // /@*, /src*, /node_modules*, /index.html, /skills* (bundle skills
        // served from public/skills for the companion service),
        // /widget-docs* (widget reference markdown served by the
        // widgetDocsPlugin), and /
        '^(?!(/@|/src|/node_modules|/index.html|/skills|/widget-docs|/$)).*$': {
          target: env.REACT_APP_PROXY_HOST,
          changeOrigin: true,
          secure: false,
          configure: proxy => {
            proxy.on('error', err => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', proxyReq => {
              if (proxyReq.getHeader('origin')) {
                proxyReq.setHeader('origin', env.REACT_APP_PROXY_HOST);
              }
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              const setCookie = proxyRes.headers['set-cookie'];
              if (setCookie && req.protocol === 'http') {
                proxyRes.headers['set-cookie'] = Array.isArray(setCookie)
                  ? setCookie.map(removeSecure).map(removeSameSiteNone)
                  : removeSameSiteNone(removeSecure(setCookie));
              }
            });
          },
        },
      },
    },
    define: {
      'process.env': env,
    },
  };
});
