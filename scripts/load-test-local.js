#!/usr/bin/env node
// Local-only load smoke test (QA-03). Refuses non-local targets so it can
// never load production or paid services. Uses read-only endpoints only.
// Usage: BASE_URL=http://localhost:3000 REQUESTS=500 CONCURRENCY=20 node scripts/load-test-local.js
const base = new URL(process.env.BASE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(base.hostname)) {
  console.error(`Refusing non-local target ${base.hostname}.`);
  process.exit(2);
}
const total = Number(process.env.REQUESTS || 500);
const concurrency = Number(process.env.CONCURRENCY || 20);
const paths = (process.env.PATHS || '/health,/api/privacy/notice?lang=th,/chat.html').split(',');

async function main() {
  const times = [];
  const statuses = {};
  let next = 0;
  async function worker() {
    while (next < total) {
      const p = paths[next++ % paths.length];
      const start = process.hrtime.bigint();
      let status = 'ERR';
      try {
        const res = await fetch(new URL(p, base));
        await res.arrayBuffer();
        status = res.status;
      } catch (_) { /* counted as ERR */ }
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
      statuses[status] = (statuses[status] || 0) + 1;
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const secs = (Date.now() - t0) / 1000;
  times.sort((a, b) => a - b);
  const pct = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(1);
  console.log(JSON.stringify({ requests: total, concurrency, seconds: secs, rps: Math.round(total / secs), p50_ms: pct(0.5), p95_ms: pct(0.95), p99_ms: pct(0.99), statuses }, null, 2));
  const failed = Object.entries(statuses).filter(([s]) => !(Number(s) < 500)).reduce((n, [, c]) => n + c, 0);
  process.exit(failed ? 1 : 0);
}
main();
