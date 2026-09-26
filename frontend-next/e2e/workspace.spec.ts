import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./mock-api";

const loaded = "year=2024&race=Italian+Grand+Prix&drivers=LEC,NOR&loaded=1";
const pages = {
  empty: "/",
  session: `/?session=FP2&tab=session&${loaded}`,
  qualifying: `/?session=Q&tab=qualifying&${loaded}`,
  laps: `/?session=FP2&tab=laps&${loaded}`,
  longruns: `/?session=FP2&tab=longruns&${loaded}`,
  telemetry: `/telemetry?session=FP2&tab=telemetry&${loaded}`,
};

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const [name, path] of Object.entries(pages)) {
  test(`${name} renders without errors or horizontal overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await mockApi(page);
    await page.goto(path);
    await expect(page.locator(".data-loading")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test.describe("desktop only", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "sidebar interactions are laid out for desktop");

  test("loads a session from an empty page", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");
    await expect(page.getByText("Choose a year, track, and session")).toBeVisible();
    await page.getByRole("button", { name: /2026/ }).click();
    await page.getByRole("option", { name: "2024" }).click();
    await page.getByRole("button", { name: /Select track/ }).click();
    await page.getByRole("option", { name: "Monaco Grand Prix" }).click();
    await page.getByRole("button", { name: "Q", exact: true }).click();
    await page.getByRole("button", { name: "Load data" }).click();
    await page.locator("summary", { hasText: "Add driver" }).click();
    await page.locator(".driver-menu button", { hasText: "VER" }).click();
    await page.getByRole("button", { name: "Driver laps" }).first().click();

    await expect(page).toHaveURL(/year=2024&race=Monaco\+Grand\+Prix&session=Q&drivers=VER&tab=laps&loaded=1/);
    await expect(page.locator(".nav-rail-status")).toHaveText(/API connected/i);
    await expect(page.getByText("Lap register")).toBeVisible();
    expect(api.calls.filter((call) => call === "driver-analysis")).toHaveLength(1);
  });

  test("switching tabs reuses cached data", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto(pages.session);
    await expect(page.locator(".timing-table tbody tr")).toHaveCount(20);
    api.calls.length = 0;
    await page.getByRole("button", { name: "Driver laps" }).first().click();
    await page.getByRole("button", { name: "Session" }).first().click();
    await expect(page.locator(".timing-table tbody tr")).toHaveCount(20);
    expect(api.calls).toEqual([]);
  });

  test("shows API errors instead of loading forever", async ({ page }) => {
    const api = await mockApi(page);
    api.fail.add("session-analysis");
    api.fail.add("driver-analysis");
    await page.goto(pages.session);
    await expect(page.locator(".primary-column [role=alert]")).toHaveText(/Timing classification unavailable: F1 timing data is temporarily unavailable/);
    await expect(page.locator(".nav-rail-status")).toHaveText(/temporarily unavailable/i);
  });

  test("explains a metadata outage on the start screen", async ({ page }) => {
    const api = await mockApi(page);
    api.fail.add("seasons");
    await page.goto("/");
    await expect(page.locator(".session-selection-empty p")).toHaveText(/The data service is unavailable/);
  });
});

test.describe("qualifying", () => {
  test("classification ranks by the last segment reached", async ({ page }) => {
    await mockApi(page);
    await page.goto(pages.qualifying);
    const rows = page.locator(".qualifying-table tbody tr:not(.quali-cutoff)");
    await expect(rows).toHaveCount(20);
    await expect(rows.nth(0)).toContainText("LEC");
    // P11 is the fastest driver knocked out in Q2.
    await expect(rows.nth(10)).toContainText("HAM");
    await expect(rows.nth(10)).toContainText("Q2");
    await expect(page.locator("tr.quali-cutoff")).toHaveCount(2);
  });

  test("segment view marks the elimination cut", async ({ page }) => {
    await mockApi(page);
    await page.goto(pages.qualifying);
    await page.getByRole("button", { name: "Q1", exact: true }).click();
    await expect(page.locator("tr.quali-out")).toHaveCount(5);
    await expect(page.locator("tr.quali-cutoff")).toHaveCount(1);
    await expect(page.locator(".quali-hero")).toContainText("Margin at the cut");
  });

  test("falls back to best laps when segments are unavailable", async ({ page }) => {
    await mockApi(page);
    await page.goto(pages.qualifying.replace("Italian", "Monaco"));
    await expect(page.locator(".quali-segments small")).toHaveText(/Segment split unavailable/);
    await expect(page.locator(".quali-segments button")).toHaveCount(1);
  });

  test("asks for a qualifying session on practice sessions", async ({ page }) => {
    await mockApi(page);
    await page.goto(pages.qualifying.replace("session=Q", "session=FP2"));
    await expect(page.getByText("Load a qualifying session (Q, SQ or SS)")).toBeVisible();
  });
});

test("telemetry page loads a trace for each selected driver", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto(pages.telemetry);
  await expect(page.locator(".trace-card")).toHaveCount(2);
  await expect(page.locator(".telemetry-lap-chip")).toHaveCount(2);
  await expect(page.locator(".trace-card [role=alert]")).toHaveCount(0);
  expect(api.calls.filter((call) => call === "driver-analysis")).toHaveLength(2);
});
