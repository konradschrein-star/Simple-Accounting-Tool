import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { BatchStatusBadge } from "@/components/imports/batch-status"
import { StatementUploader } from "@/components/imports/uploader"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { pdfImportsThisMonth } from "@/ingest/service"
import { env } from "@/lib/env"
import { requireReadyOrg } from "@/server/context"
import { listBatches } from "@/server/repos/imports"

export const metadata: Metadata = { title: "Imports" }

const SAMPLES: Record<string, { file: string; label: string }[]> = {
  de: [{ file: "sparkasse.csv", label: "Sparkasse CSV" }, { file: "dkb.csv", label: "DKB CSV" }, { file: "sparkasse-camt053.xml", label: "CAMT.053 XML" }],
  uk: [{ file: "monzo.csv", label: "Monzo CSV" }, { file: "barclays.csv", label: "Barclays CSV" }, { file: "barclays.ofx", label: "Barclays OFX" }],
  us: [{ file: "chase.csv", label: "Chase CSV" }],
  je: [{ file: "paid-in-out.csv", label: "Paid in / out CSV" }],
}

export default async function ImportsPage() {
  const ctx = await requireReadyOrg()
  const batches = listBatches(db, ctx.orgId)
  const remaining = Math.max(0, env().PDF_IMPORTS_PER_MONTH - pdfImportsThisMonth(ctx.orgId, ctx.today))
  return (
    <PageBody>
      <PageHeader title="Bank imports" description="Upload a statement, check the parsed lines, then book them into your ledger." />
      <StatementUploader pdfRemaining={remaining} />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>No statement handy? Try a sample:</span>
        {[...(SAMPLES[ctx.jurisdiction.code] ?? []), { file: "sample-statement.pdf", label: "PDF statement" }].map((s) => (
          <a key={s.file} href={`/samples/${s.file}`} download className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <DownloadIcon className="size-3" /> {s.label}
          </a>
        ))}
      </p>
      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">History</CardTitle>
          <CardDescription>{batches.length ? `${batches.length} imports` : "Nothing imported yet."}</CardDescription>
        </CardHeader>
        {batches.length ? (
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id} className="relative">
                    <TableCell className="max-w-64 truncate pl-6 font-medium">
                      <Link href={`/imports/${b.id}`} className="after:absolute after:inset-0">
                        {b.filename}
                      </Link>
                    </TableCell>
                    <TableCell className="uppercase text-muted-foreground">{b.source}</TableCell>
                    <TableCell className="tabular-nums">{b.rowCount || "—"}</TableCell>
                    <TableCell>
                      <BatchStatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="pr-6 text-right text-muted-foreground">
                      {b.createdAt.toLocaleDateString(ctx.settings.locale, { dateStyle: "medium" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : null}
      </Card>
    </PageBody>
  )
}
