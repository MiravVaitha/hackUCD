import { expect, test } from "@playwright/test";

import { createTemporaryUser, signInAs } from "./helpers/auth";

test.describe("access", () => {
  test("the merchant app redirects to sign-in without a session", async ({ page }) => {
    await page.goto("/app/orders");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Forders$/);
    await expect(page.getByRole("heading", { name: "Sign in to the merchant app" })).toBeVisible();
  });

  test("signing in with the form opens the overview, and signing out ends the session", async ({ page }) => {
    const account = await createTemporaryUser("agent");
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(account.email);
      await page.getByLabel("Password").fill(account.password);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("heading", { name: /^Hello, / })).toBeVisible();

      await page.getByRole("button", { name: "Sign out" }).first().click();
      await expect(page).toHaveURL(/\/login$/);

      await page.goto("/app");
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await account.remove();
    }
  });

  test("a wrong password is rejected without saying which part was wrong", async ({ page }) => {
    const account = await createTemporaryUser("agent");
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(account.email);
      await page.getByLabel("Password").fill("definitely-not-the-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText("That email and password do not match.");
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await account.remove();
    }
  });

  test("a forged session cookie does not grant access", async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: "ps_session", value: "forged-token-value", domain: new URL(baseURL!).hostname, path: "/" },
    ]);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a packer is kept out of the console", async ({ page, context, baseURL }) => {
    await signInAs(context, "packer", baseURL!);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/pack$/);
  });
});
