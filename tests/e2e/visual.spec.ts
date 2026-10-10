import { test } from "@playwright/test";

import { signInAs } from "./helpers/auth";

/**
 * Not a pass/fail test: captures screenshots and browser console problems for
 * a manual look. Runs only when asked for:
 *
 *   SHOTS=1 pnpm exec playwright test visual
 *   SHOTS=1 SHOT_PAGES=/app/orders,/store pnpm exec playwright test visual
 */
const enabled = Boolean(process.env.SHOTS);

// Written without leading slashes so Git Bash on Windows does not rewrite them
// as file paths: SHOT_PAGES=home,login,app/orders
const DEFAULT_PAGES = ["home", "store", "app", "app/orders"];
const pages = (process.env.SHOT_PAGES ?? DEFAULT_PAGES.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => (value === "home" ? "/" : value.startsWith("/") ? value : `/${value}`));

// SHOT_ROLE=none captures pages signed out.
const role = process.env.SHOT_ROLE ?? "owner";

const viewports = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;

function fileName(path: string, size: string): string {
  const slug = path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home";
  return `.data/shots/${slug}-${size}.png`;
}

test.describe("screenshots", () => {
  test.skip(!enabled, "Set SHOTS=1 to capture screenshots");

  for (const [size, viewport] of Object.entries(viewports)) {
    if (process.env.SHOT_SIZE && process.env.SHOT_SIZE !== size) continue;

    test(`capture pages (${size})`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      if (role !== "none") {
        await signInAs(context, role as "owner" | "agent" | "packer", baseURL!);
      }
      const page = await context.newPage();

      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          problems.push(`[${message.type()}] ${message.text().slice(0, 600)}`);
        }
      });
      page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message.slice(0, 600)}`));

      for (const path of pages) {
        problems.length = 0;
        const response = await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(900);
        await page.screenshot({ path: fileName(path, size), fullPage: true, animations: "disabled" });
        console.log(`${path} (${size}) -> ${response?.status()} ${page.url()}`);
        for (const problem of problems) console.log(`   ${problem}`);
      }

      await context.close();
    });
  }
});
