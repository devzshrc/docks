import { Pool } from "pg";

const {
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: run,
  GITHUB_RUN_ATTEMPT: attempt,
  GITHUB_ACTOR: actor,
  GITHUB_REPOSITORY: repository,
  DATABASE_URL: connectionString,
} = process.env;
if (
  !/^[a-f0-9]{40}$/.test(sha ?? "") ||
  !/^\d+$/.test(run ?? "") ||
  !/^\d+$/.test(attempt ?? "") ||
  !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository ?? "") ||
  !actor ||
  !connectionString
) {
  throw new Error("Invalid deployment marker configuration");
}
const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});
try {
  await pool.query(
    `INSERT INTO deploy_mark (id, sha, environment, actor, run_url)
    VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [
      `${repository}:${run}:${attempt}`,
      sha,
      "production",
      actor,
      `https://github.com/${repository}/actions/runs/${run}`,
    ],
  );
  console.log(`Recorded production release ${sha}`);
} catch {
  throw new Error(
    "Application deployed, but deployment marker failed. Retry the marker step; do not redeploy blindly.",
  );
} finally {
  await pool.end();
}
