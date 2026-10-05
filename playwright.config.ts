import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', use: { baseURL: 'http://127.0.0.1:5173', launchOptions: { executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined, args: ['--no-sandbox'] } }, webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI } });
