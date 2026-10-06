import { PageBody, PageHeader } from "@/components/shell/page-header"
import { requireReadyOrg } from "@/server/context"

export default async function DashboardPage() {
  const ctx = await requireReadyOrg()
  return (
    <PageBody>
      <PageHeader title="Dashboard" description={`Cash-flow overview for ${ctx.orgName}`} />
    </PageBody>
  )
}
