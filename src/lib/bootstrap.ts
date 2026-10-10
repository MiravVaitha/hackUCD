import { and, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { merchants, products, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { catalogBarcode, DEMO_MERCHANT, DEMO_PRODUCTS, DEMO_USERS } from "@/lib/catalog";

export type BootstrapResult = {
  merchantId: string;
  products: number;
  usersCreated: number;
  usersUpdated: number;
  usersUnchanged: number;
  /** True when no demo password was available, so no accounts were touched. */
  usersSkipped: boolean;
};

/**
 * Idempotently create the demo merchant, its catalogue and its logins.
 * Safe to run on every deploy. Never prints the password.
 */
export async function bootstrapDemoMerchant(
  db: Db,
  demoPassword: string | undefined,
): Promise<BootstrapResult> {
  await db
    .insert(merchants)
    .values({
      slug: DEMO_MERCHANT.slug,
      name: DEMO_MERCHANT.name,
      currency: DEMO_MERCHANT.currency,
      supportEmail: DEMO_MERCHANT.supportEmail,
      settings: DEMO_MERCHANT.settings,
    })
    .onConflictDoNothing({ target: merchants.slug });

  const [existingMerchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.slug, DEMO_MERCHANT.slug))
    .limit(1);
  if (!existingMerchant) throw new Error("Demo merchant could not be created");

  // Fill in any settings added since the merchant was created, keeping the
  // values the merchant has already chosen.
  const [merchant] = await db
    .update(merchants)
    .set({ settings: { ...DEMO_MERCHANT.settings, ...existingMerchant.settings } })
    .where(eq(merchants.id, existingMerchant.id))
    .returning();

  for (const [index, product] of DEMO_PRODUCTS.entries()) {
    const values = {
      merchantId: merchant.id,
      sku: product.sku,
      barcode: catalogBarcode(product),
      name: product.name,
      description: product.description,
      priceMinor: product.priceMinor,
      art: product.art,
      sortOrder: index,
      active: true,
    };
    await db
      .insert(products)
      .values(values)
      .onConflictDoUpdate({
        target: [products.merchantId, products.sku],
        set: {
          barcode: values.barcode,
          name: values.name,
          description: values.description,
          priceMinor: values.priceMinor,
          art: values.art,
          sortOrder: values.sortOrder,
          active: true,
        },
      });
  }

  const result: BootstrapResult = {
    merchantId: merchant.id,
    products: DEMO_PRODUCTS.length,
    usersCreated: 0,
    usersUpdated: 0,
    usersUnchanged: 0,
    usersSkipped: !demoPassword,
  };
  if (!demoPassword) return result;

  for (const demoUser of DEMO_USERS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, demoUser.email)))
      .limit(1);

    if (!existing) {
      await db.insert(users).values({
        merchantId: merchant.id,
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        passwordHash: await hashPassword(demoPassword),
      });
      result.usersCreated++;
      continue;
    }

    // Keep the stored hash in step with the configured demo password.
    if (await verifyPassword(demoPassword, existing.passwordHash)) {
      result.usersUnchanged++;
    } else {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(demoPassword), name: demoUser.name, role: demoUser.role })
        .where(eq(users.id, existing.id));
      result.usersUpdated++;
    }
  }

  return result;
}
