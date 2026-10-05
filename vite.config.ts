import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { validateServerUrl } from './src/config';
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configured = env.VITE_SERVER_URL ?? '';
  // No default localhost fallback in any production bundle. Reject bad supplied URLs.
  const serverUrl = configured ? validateServerUrl(configured, command === 'serve') : '';
  const hash = createHash('sha256');
  for (const path of [...sourceFiles('src'), ...sourceFiles('shared'), 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json'].sort()) hash.update(path).update(readFileSync(path));
  hash.update(serverUrl).update(mode);
  let revision = 'unknown';
  try { revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* source ZIP builds also work */ }
  const info = { buildId: `client-${hash.digest('hex').slice(0, 12)}`, sourceRevisionAtBuild: revision, serverUrl, builtAt: new Date().toISOString() };
  return {
    define: { __HORIZON_BUILD__: JSON.stringify(info) },
    plugins: [{ name: 'horizon-build-stamp', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify(info, null, 2) + '\n' });
    } }],
  };
});
