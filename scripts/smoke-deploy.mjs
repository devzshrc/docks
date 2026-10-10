const checks = [
  { url: "https://api.devzshrc.in/readyz", status: 200, validate: async (r) => (await r.json()).status === "ok" },
  {
    url: "https://api.devzshrc.in/healthz",
    status: 200,
    validate: async (r) => (await r.json()).status === "ok",
  },
  {
    url: "https://api.devzshrc.in/trpc/admin.access",
    status: 401,
    validate: async (r) =>
      JSON.stringify(await r.json()).includes("UNAUTHORIZED"),
  },
  { url: "https://docks.devzshrc.in/admin", status: 200 },
  { url: "https://docks.devzshrc.in/login?next=%2Fadmin", status: 200 },
];
for (const check of checks) {
  let passed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(check.url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      passed =
        response.status === check.status &&
        (!check.validate || (await check.validate(response)));
      if (passed) break;
    } catch {
      /* Retry propagation/network failures, without logging response secrets. */
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!passed)
    throw new Error(
      `Production verification failed: ${check.url} (expected ${check.status})`,
    );
  console.log(`Verified ${check.url}: ${check.status}`);
}
