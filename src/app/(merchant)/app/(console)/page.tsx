import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { SetupNotice } from "@/components/setup-notice";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CONSOLE_ROLES, requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await requireUser(CONSOLE_ROLES);

  return (
    <>
      <PageHeader
        title={`Hello, ${session.user.name.split(" ")[0]}`}
        description={`${session.merchant.name} · order evidence, complaints and disputes`}
        actions={
          <LinkButton href="/store" variant="secondary" target="_blank">
            Open the demo store
          </LinkButton>
        }
      />
      <SetupNotice className="mb-6" />
      <Card>
        <CardHeader title="Getting started" description="The order record fills in as these happen." />
        <CardBody>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-700">
            <li>Place a test order in the demo store.</li>
            <li>Pack it at the packing station: scan the items, photograph the parcel.</li>
            <li>Hand it to the courier and mark it delivered.</li>
            <li>File a complaint as the customer, then resolve it here.</li>
            <li>Escalate it to a chargeback and respond from the evidence record.</li>
          </ol>
        </CardBody>
      </Card>
    </>
  );
}
