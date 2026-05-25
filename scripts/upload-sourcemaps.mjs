#!/usr/bin/env node
/**
 * Post-build source-map upload to Sentry.
 *
 * Next.js 16's Turbopack builder doesn't trigger withSentryConfig's source-map
 * upload (that's webpack-only). We run sentry-cli directly here as a
 * post-build step. Reads SENTRY_AUTH_TOKEN / ORG / PROJECT from the env.
 *
 * Skips gracefully when env vars are missing so local `npm run build` works
 * without Sentry credentials.
 */

import { spawnSync } from "node:child_process";

const required = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.log(
    `↷ Skipping Sentry source-map upload — missing env: ${missing.join(", ")}`,
  );
  process.exit(0);
}

const release =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.SENTRY_RELEASE ||
  undefined;
const releaseArgs = release ? ["--release", release] : [];

function run(args) {
  const r = spawnSync("npx", ["--yes", "@sentry/cli", ...args], {
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`@sentry/cli ${args.join(" ")} exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

console.log("→ Injecting Sentry debug IDs into bundles + source maps…");
run(["sourcemaps", "inject", ".next"]);

console.log("→ Uploading source maps to Sentry…");
run(["sourcemaps", "upload", ...releaseArgs, ".next"]);

console.log("✓ Source-map upload complete.");
