// End-to-end smoke test of the demo flow. Needs the dev server on :3000.
//   node scripts/demo-e2e.mjs [screenshotDir]
import { createRequire } from "node:module";

// Uses a globally installed Playwright if the project does not have one.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const out = process.argv[2];
const browser = await chromium.launch();

async function shoot(page, name) {
  if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

// Desktop run does the whole flow.
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(BASE);
await shoot(page, "01-landing-desktop");
await page.getByRole("button", { name: "Try the demo" }).click();
await page.waitForURL("**/sources");
// Start clean so the run is repeatable.
await page.getByRole("button", { name: "Clear my data" }).click();
await page.waitForTimeout(800);
await page.reload();

await page.getByRole("button", { name: /Scan sample inbox|Scan again/ }).click();
await page.getByText(/Read \d+ emails/).waitFor({ timeout: 120_000 });
console.log("scan:", await page.getByText(/Read \d+ emails/).innerText());

await page.getByRole("button", { name: "or use the sample M-Pesa statement" }).click();
await page.getByText(/transactions and spotted/).waitFor({ timeout: 60_000 });
console.log("mpesa:", await page.getByText(/transactions and spotted/).innerText());
await shoot(page, "02-sources-desktop");

await page.goto(`${BASE}/review`);
await shoot(page, "03-review-desktop");
const toReview = await page.locator("li.card").count();
console.log("review rows:", toReview);

// Dismiss one, edit one, add one manually.
await page.locator("li.card", { hasText: "Zuku" }).getByRole("button", { name: "Dismiss" }).click();
await page.waitForTimeout(800);
await page.locator("li.card", { hasText: "Iron Paradise Gym" }).getByRole("button", { name: "Edit" }).click();
await page.locator(".fixed input[name=amount]").fill("4000");
await page.locator(".fixed").getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(800);
const add = page.locator("section", { hasText: "Add one we missed" });
await add.locator("input[name=name]").fill("Kenya Power Tokens Plan");
await add.locator("input[name=amount]").fill("1500");
await add.getByRole("button", { name: "Add subscription" }).click();
await page.getByText("Added Kenya Power Tokens Plan").waitFor();
await page.getByRole("button", { name: /Confirm all/ }).click();
await page.waitForTimeout(800);

await page.goto(`${BASE}/dashboard`);
await shoot(page, "04-dashboard-desktop");
console.log("monthly:", await page.locator("text=/month/").first().innerText());

// Dark mode, desktop.
await page.getByRole("button", { name: "Switch to dark mode" }).click();
await page.waitForTimeout(300);
await shoot(page, "05-dashboard-desktop-dark");
await page.getByRole("button", { name: "Switch to light mode" }).click();
const cookies = await ctx.cookies();

// Phone, light and dark.
for (const scheme of ["light", "dark"]) {
  const phone = await browser.newContext({ ...devices["iPhone 14"], colorScheme: scheme });
  await phone.addCookies(cookies);
  const p = await phone.newPage();
  await p.goto(`${BASE}/dashboard`);
  await shoot(p, `06-dashboard-phone-${scheme}`);
  if (scheme === "light") {
    await p.goto(`${BASE}/review`);
    await shoot(p, "07-review-phone");
    await p.goto(`${BASE}/sources`);
    await shoot(p, "08-sources-phone");
    await p.context().clearCookies();
    await p.goto(BASE);
    await shoot(p, "09-landing-phone");
  }
  await phone.close();
}

// Reminder cron endpoint.
const cron = await fetch(`${BASE}/api/cron/reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET || "dev-cron-secret"}` } });
console.log("cron:", cron.status, JSON.stringify(await cron.json()));

await browser.close();
