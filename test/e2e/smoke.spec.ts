import { test, expect } from "@playwright/test";

test.describe("BrainMix smoke", () => {
  test("home loads, header brand visible, bottom tab nav present", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/brainmix/i);
    // Bottom tab nav buttons are present.
    await expect(page.getByRole("button", { name: /^Music$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Studio$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Timer$/ })).toBeVisible();
  });

  test("switching to Music tab shows the hub", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Music$/ }).click();
    await expect(page.getByText(/Your music/i)).toBeVisible();
  });

  test("/api/engineer responds to an empty state", async ({ request }) => {
    const r = await request.post("/api/engineer", {
      data: { state: {} },
      headers: { "content-type": "application/json" },
    });
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body.length).toBeGreaterThan(20);
  });

  test("unknown share token returns 404", async ({ page }) => {
    const r = await page.goto("/m/definitely-not-a-real-token");
    expect(r?.status()).toBe(404);
  });

  test("unknown playlist token returns 404", async ({ page }) => {
    const r = await page.goto("/p/not-a-real-playlist-token");
    expect(r?.status()).toBe(404);
  });

  test("/console renders the wide DJ-console layout", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/console");
    await expect(page.getByText(/Neuro-Acoustic Matrix · DJ Studio/i)).toBeVisible();
    await expect(page.getByText(/Deck A · empty/i)).toBeVisible();
    await expect(page.getByText(/Crossfader · 0/i)).toBeVisible();
    await expect(page.getByText(/The turntables/i)).toBeVisible();
  });

  test("/stats (unauth) shows sign-in prompt", async ({ page }) => {
    const r = await page.goto("/stats");
    expect(r?.status()).toBe(200);
    await expect(page.getByText(/Sign in on the main app/i)).toBeVisible();
  });

  test("/live/host renders broadcast page", async ({ page }) => {
    await page.goto("/live/host");
    await expect(page.getByText(/Live broadcast/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Start broadcast/i })).toBeVisible();
  });

  test("/live/[token] listener page renders", async ({ page }) => {
    await page.goto("/live/test-token");
    await expect(page.getByText(/Listening room/i)).toBeVisible();
    await expect(page.getByText(/Token · test-token/i)).toBeVisible();
  });
});
