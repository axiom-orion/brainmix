import type { Instrumentation } from "next";

// Sentry's server SDK is only loaded when a DSN is configured. On Cloudflare
// Workers its Node instrumentation (import-in-the-middle / WebAssembly lexer)
// can't initialise, so importing it eagerly just logs an unhandled rejection
// on every cold start. Loading it lazily keeps DSN-less deploys clean.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
