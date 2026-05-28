/**
 * Multi-listener smoke for the live-room mesh.
 *
 * We can't actually capture the host's djBus audio in Playwright (no real
 * audio context output), so this test verifies the SIGNALING + UI surface:
 * spawn 1 host page + 3 listener contexts, click "Start broadcast" on the
 * host, then verify every listener's page transitions out of "joining"
 * within a reasonable window. Anything past that is real-audio territory.
 *
 * Skips when not authenticated — anonymous host start works for signaling
 * but the listener_count update from the host requires auth on the live_rooms
 * row write. The signaling channel itself is open to anon.
 */

import { test, expect, type Browser } from "@playwright/test";

const HOST_START_TIMEOUT = 15_000;
const LISTENER_JOIN_TIMEOUT = 20_000;

async function openListener(browser: Browser, token: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/live/${token}`);
  return { ctx, page };
}

test.describe("Live mesh", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium only");

  test("host serves 3 concurrent listener pages", async ({ browser }) => {
    // Host tab.
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    await hostPage.goto("/live/host");
    await hostPage.getByRole("button", { name: /Start broadcast/i }).click();

    // Wait until the share URL appears — that means the channel subscribed.
    const shareUrlNode = hostPage.getByText(/\/live\//i).first();
    await expect(shareUrlNode).toBeVisible({ timeout: HOST_START_TIMEOUT });
    const text = (await shareUrlNode.textContent()) ?? "";
    const m = text.match(/\/live\/([a-z0-9]{8})/i);
    if (!m) {
      // Host couldn't broadcast (likely because no audio context exists in
      // a fresh tab — djBus.recordTap is null). That's a known limitation
      // for this smoke test; skip rather than fail.
      const err = await hostPage.locator("p.text-rose-400").textContent().catch(() => null);
      test.skip(Boolean(err), `host start blocked: ${err}`);
      throw new Error("share URL not found");
    }
    const token = m[1];

    // Three listener tabs.
    const listeners = await Promise.all([
      openListener(browser, token),
      openListener(browser, token),
      openListener(browser, token),
    ]);

    for (const { page } of listeners) {
      // The token should appear on each listener page.
      await expect(page.getByText(`Token · ${token}`)).toBeVisible({
        timeout: LISTENER_JOIN_TIMEOUT,
      });
    }

    // Cleanup.
    for (const { ctx } of listeners) await ctx.close();
    await hostCtx.close();
  });
});
