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
//   GET /widget-docs/index.json  -> [{ id, file, title }]
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
  // back-link line at the top of each widget doc.
  const titleFrom = content => {
    const h2 = content.match(/^##\s+(.+?)(?:\s+Widget)?\s*$/m);
    if (h2) return h2[1].trim();
    const h1 = content.match(/^#\s+(.+?)\s*$/m);
    if (h1) return h1[1].trim();
    return null;
  };

  const collect = () => {
    if (!fs.existsSync(widgetsDir)) return { docs: [], index: [] };
    const files = fs
      .readdirSync(widgetsDir)
      .filter(f => f.toLowerCase().endsWith('.md'))
      .sort();
    const docs = files.map(file => {
      const content = fs.readFileSync(path.join(widgetsDir, file), 'utf8');
      return {
        id: slug(file),
        file,
        title: titleFrom(content) || slug(file),
        content,
      };
    });
    const index = docs.map(({ content, ...meta }) => meta);
    return { docs, index };
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
        const match = docs.find(d => `/${d.file}` === url);
        if (match) {
          res.setHeader('content-type', 'text/markdown; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          return res.end(match.content);
        }
        next();
      });
    },

    generateBundle() {
      const { docs, index } = collect();
      this.emitFile({
        type: 'asset',
        fileName: 'widget-docs/index.json',
        source: JSON.stringify(index, null, 2),
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
