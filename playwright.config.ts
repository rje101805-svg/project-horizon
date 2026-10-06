import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5175', launchOptions: { executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined, args: ['--no-sandbox', '--disable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } },
  webServer: [
    { command: 'npm run dev -- --port 5175 --strictPort', url: 'http://127.0.0.1:5175' },
    { command: 'npm run server', url: 'http://127.0.0.1:3002/health', env: { PORT: '3002', CLIENT_ORIGINS: 'http://127.0.0.1:5175' } },
  ],
});
