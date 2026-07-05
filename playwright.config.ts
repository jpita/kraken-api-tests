import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // One retry absorbs genuine network blips against a live API; anything retried is
  // logged to flake-report.json by the custom reporter (see TEST_PLAN.md §6).
  retries: 1,
  // Public REST allows ~1 req/s per IP; the client-side queue only serialises within a
  // process, so parallel workers would defeat it (TEST_PLAN.md §5).
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }], ['./src/reporting/flake-reporter.ts']],
  projects: [
    { name: 'rest', testDir: './tests/rest' },
    { name: 'contract', testDir: './tests/contract' },
    { name: 'ws', testDir: './tests/ws' },
    { name: 'cross', testDir: './tests/cross' },
  ],
});
