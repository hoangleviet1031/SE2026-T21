import { performance } from 'node:perf_hooks';
import { createTestServer } from '../server/test/fixtures';

async function main() {

  const CONCURRENCY = 150;
  const LIMIT_MS = 4_000;
  const server = await createTestServer();
  try {
    const token = server.tokens.minh;
    const project = server.projects.yte;
    const durations = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (_, index) => {
        const started = performance.now();
        const response = await fetch(`${server.base}/api/projects/${project}/records/${crypto.randomUUID()}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            formId: 'household-survey',
            formVersion: 1,
            baseVersion: 0,
            deleted: false,
            data: { householdName: `VT-084 load ${index}` },
          }),
        });
        if (response.status !== 201) throw new Error(`task ${index} returned ${response.status}: ${await response.text()}`);
        return performance.now() - started;
      }),
    );
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!;
    const result = { concurrentTasks: CONCURRENCY, completed: durations.length, p95Ms: Number(p95.toFixed(1)), targetMs: LIMIT_MS };
    console.log(JSON.stringify(result, null, 2));
    if (p95 > LIMIT_MS) process.exitCode = 1;
  } finally {
    server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
