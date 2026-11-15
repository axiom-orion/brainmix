/**
 * Canonical public origin of the deployed app (no trailing slash).
 *
 * Override with NEXT_PUBLIC_SITE_URL at build time (it is inlined into the
 * bundle); defaults to the Cloudflare Workers address.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://brainmix.racason.workers.dev"
).replace(/\/+$/, "");

/** Bare host, e.g. for display in the footer. */
export const SITE_HOST = new URL(SITE_URL).host;
