/* One requestAnimationFrame loop for every landing animation. Each frame runs all `read`s (layout
 * queries) before any `write` (style changes), so the browser lays the page out at most once per
 * frame instead of once per animation. The loop stops when nothing is subscribed. */

type Job = { read?: (now: number) => void; write?: (now: number) => void };

const jobs = new Set<Job>();
let raf = 0;

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  for (const job of jobs) job.read?.(now);
  for (const job of jobs) job.write?.(now);
}

export function onFrame(job: Job) {
  jobs.add(job);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    jobs.delete(job);
    if (!jobs.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
