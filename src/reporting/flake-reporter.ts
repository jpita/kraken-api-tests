import { writeFileSync } from 'node:fs';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface FlakeEntry {
  title: string;
  project: string;
  retries: number;
  outcome: string;
  errors: string[];
}

/**
 * Flake policy (TEST_PLAN.md §6): retries make a run green but must never make a
 * flaky test invisible. Any test that needed a retry is written to flake-report.json,
 * which CI uploads as an artifact. Repeat offenders get redesigned, not re-retried.
 */
export default class FlakeReporter implements Reporter {
  private readonly flaky: FlakeEntry[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.retry === 0) return;
    this.flaky.push({
      title: test.titlePath().join(' › '),
      project: test.parent.project()?.name ?? 'unknown',
      retries: result.retry,
      outcome: result.status,
      errors: result.errors.map((e) => e.message ?? 'unknown error'),
    });
  }

  onEnd(): void {
    if (this.flaky.length === 0) return;
    writeFileSync('flake-report.json', JSON.stringify(this.flaky, null, 2));
    console.log(`\n[flake-reporter] ${this.flaky.length} test(s) needed a retry — see flake-report.json`);
  }
}
