import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* base config */
};

// Sentry wrapping is opt-in: only applies the upload-source-maps integration
// when the org/project envs are present. Without them, this is a no-op.
const sentryWrapped =
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? withSentryConfig(nextConfig, {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        silent: true,
        widenClientFileUpload: true,
        disableLogger: true,
      })
    : nextConfig;

export default sentryWrapped;
