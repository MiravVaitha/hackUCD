"use server";

import { redirect } from "next/navigation";

import { requireUserForAction } from "@/lib/auth/guards";
import { CarrierError, recordHandover } from "@/lib/carriers/demo-carrier";
import { findOrderNumberByCode } from "@/lib/packing/service";

/** Open an order from a typed order number on the queue screen. */
export async function openOrderAction(formData: FormData): Promise<void> {
  const session = await requireUserForAction();
  const typed = String(formData.get("order") ?? "").trim();
  const number = typed ? await findOrderNumberByCode(session.merchant.id, typed) : null;
  redirect(number ? `/app/pack/${number}` : `/app/pack?notfound=${encodeURIComponent(typed.slice(0, 40))}`);
}

/** Record that a packed parcel was given to the courier. */
export async function handoverAction(formData: FormData): Promise<void> {
  const session = await requireUserForAction();
  const orderId = String(formData.get("orderId") ?? "");
  try {
    await recordHandover(session, orderId);
  } catch (error) {
    if (!(error instanceof CarrierError)) throw error;
    redirect(`/app/pack?problem=${encodeURIComponent(error.message)}`);
  }
  redirect("/app/pack");
}
