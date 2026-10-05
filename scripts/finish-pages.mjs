import { writeFileSync } from 'node:fs';
// Serve Vite's static assets directly, without GitHub's Jekyll processing.
writeFileSync(new URL('../docs/.nojekyll', import.meta.url), '');
