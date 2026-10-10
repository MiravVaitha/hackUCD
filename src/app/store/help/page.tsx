import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createHelpCase } from "./actions";

export const metadata = { title: "Help with an order" };
export default function HelpPage() {
  return <main className="mx-auto max-w-2xl px-5 py-12">
    <p className="text-sm font-medium text-seal-700">VOLTBOX CUSTOMER CARE</p>
    <h1 className="mt-3 font-display text-4xl">Let’s put it right.</h1>
    <p className="mt-3 mb-8 text-ink-600">Tell us what happened. You’ll receive a private case link where you can read our reply and continue the conversation. Use fictional details for this demo.</p>
    <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
      <ActionForm action={createHelpCase} submit="Open a support case" pending="Opening your case…">
        <Field label="Order number (optional)" htmlFor="orderNumber"><Input id="orderNumber" name="orderNumber" placeholder="VB-1001" maxLength={40} /></Field>
        <Field label="Email used for your order" htmlFor="email"><Input id="email" name="email" type="email" required maxLength={200} /></Field>
        <Field label="Your name" htmlFor="name"><Input id="name" name="name" required maxLength={120} /></Field>
        <Field label="What went wrong?" htmlFor="message"><Textarea id="message" name="message" required minLength={10} maxLength={5000} /></Field>
      </ActionForm>
    </div>
  </main>;
}
