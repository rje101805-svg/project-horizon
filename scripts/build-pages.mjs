import { build, loadEnv } from 'vite';
import { writeFileSync } from 'node:fs';
const configured = loadEnv('production', process.cwd(), 'VITE_').VITE_SERVER_URL;
if (!configured) throw new Error('Pages build requires the real HTTPS Render URL in VITE_SERVER_URL. No localhost or placeholder will be published.');
// Keep authored docs/art-reference evidence; this directory also holds the Pages release.
// vite.config.ts validates the URL before any output files are changed.
await build({ base: '/project-horizon/', build: { outDir: 'docs', emptyOutDir: false } });
writeFileSync(new URL('../docs/.nojekyll', import.meta.url), '');
