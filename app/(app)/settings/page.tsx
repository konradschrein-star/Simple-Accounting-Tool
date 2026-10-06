import { DownloadIcon, Trash2Icon } from "lucide-react"
import type { Metadata } from "next"
import { LogoUpload } from "@/components/settings/logo-upload"
import { SettingsForm } from "@/components/settings/settings-form"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireReadyOrg } from "@/server/context"
import { deleteWorkspace } from "@/server/actions/settings"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const ctx = await requireReadyOrg()
  return (
    <PageBody className="max-w-4xl">
      <PageHeader title="Settings" description={`${ctx.jurisdiction.name} workspace · ${ctx.settings.currency}${ctx.settings.currencyLocked ? " (locked after first invoice)" : ""}`} />
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Shown at the top of your invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUpload hasLogo={!!ctx.settings.logoPath} />
        </CardContent>
      </Card>
      <SettingsForm
        orgName={ctx.orgName}
        settings={ctx.settings}
        jurisdiction={ctx.jurisdiction.code}
        taxLabel={ctx.jurisdiction.taxLabel}
        taxIdLabel={ctx.jurisdiction.taxIdLabel}
        bankFields={ctx.jurisdiction.bankFields}
      />
      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Download everything we store about this workspace, or delete it permanently (GDPR).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/api/settings/export">
              <DownloadIcon /> Export data (JSON)
            </a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive">
                <Trash2Icon /> Delete workspace
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this workspace permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  All invoices, imports, transactions and files are erased immediately and cannot be recovered (backups expire within 14 days). Export your
                  data first if you need it for your tax records.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <form action={deleteWorkspace}>
                  <AlertDialogAction type="submit" className="bg-destructive text-white hover:bg-destructive/90">
                    Delete everything
                  </AlertDialogAction>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </PageBody>
  )
}
