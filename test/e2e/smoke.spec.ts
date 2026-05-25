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
});
