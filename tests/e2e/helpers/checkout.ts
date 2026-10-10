import { expect, type Page } from "@playwright/test";

export const TEST_CARDS = {
  normal: "4242424242424242",
  disputeNotReceived: "4000000000002685",
  disputeFraudulent: "4000000000000259",
} as const;

/**
 * Buy from the demo store through Stripe's hosted Checkout in test mode and
 * return the confirmed order number. Uses the fictional demo shopper, so only
 * card details have to be entered.
 */
export async function buyFromStore(
  page: Page,
  skus: string[],
  cardNumber: string = TEST_CARDS.normal,
): Promise<string> {
  await page.goto("/store");
  for (const sku of skus) {
    await page.locator(`[data-sku="${sku}"]`).getByRole("button", { name: /^Add .* to basket$/ }).click();
  }
  await page.getByRole("button", { name: "Checkout" }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });

  // Stripe lists several payment methods. The card option's button is visually
  // hidden behind its row, so it is clicked through script.
  const cardNumberField = page.locator("#cardNumber");
  const cardOption = page.locator('[data-testid="card-accordion-item-button"]');
  await cardOption.waitFor({ state: "attached", timeout: 45_000 });
  if (!(await cardNumberField.isVisible())) {
    await page.waitForTimeout(1000);
    await cardOption.evaluate((element) => (element as HTMLElement).click());
  }
  await cardNumberField.waitFor({ state: "visible", timeout: 20_000 });

  await cardNumberField.fill(cardNumber);
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");

  const county = page.locator("#shippingAdministrativeArea");
  if ((await county.count()) > 0 && !(await county.inputValue())) {
    await county.selectOption("Galway");
  }

  await page.locator('[data-testid="hosted-payment-submit-button"]').click();

  await page.waitForURL(/\/store\/success\?session_id=/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible({ timeout: 30_000 });

  const orderNumber = (await page.locator("p .font-mono").first().innerText()).trim();
  expect(orderNumber).toMatch(/^[A-Z]{2}-\d+$/);
  return orderNumber;
}
