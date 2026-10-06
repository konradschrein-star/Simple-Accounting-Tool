import { ArchiveIcon, PackageIcon, PencilIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import { ProductDialog } from "@/components/products/product-dialog"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { formatMoney, formatRate } from "@/lib/money"
import { requireReadyOrg } from "@/server/context"
import { archiveProductAction } from "@/server/actions/products"
import { listProducts } from "@/server/repos/products"

export const metadata: Metadata = { title: "Products" }

export default async function ProductsPage() {
  const ctx = await requireReadyOrg()
  const { currency, locale } = ctx.settings
  const taxRatesBp = ctx.settings.smallBusinessExempt || !ctx.settings.taxRegistered ? [0] : ctx.jurisdiction.taxRatesBp
  const products = listProducts(db, ctx.orgId)
  const addButton = (
    <ProductDialog
      taxRatesBp={taxRatesBp}
      locale={locale}
      trigger={
        <Button>
          <PlusIcon /> New product
        </Button>
      }
    />
  )
  return (
    <PageBody>
      <PageHeader title="Products & services" description="Your price list. Add items to invoices and quotes from the catalog — most-used first." actions={addButton} />
      {products.length ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden md:table-cell">{ctx.jurisdiction.taxLabel}</TableHead>
                <TableHead className="hidden text-right md:table-cell">Used</TableHead>
                <TableHead className="w-24 pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-6">
                    <div className="font-medium">{p.name}</div>
                    {p.description ? <div className="line-clamp-1 text-xs text-muted-foreground">{p.description}</div> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(p.unitPriceMinor, currency, locale)}
                    {p.unit ? <span className="text-muted-foreground"> / {p.unit}</span> : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{p.taxRateBp === null ? "Default" : formatRate(p.taxRateBp, locale)}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">{p.usageCount}×</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end gap-1">
                      <ProductDialog
                        product={p}
                        taxRatesBp={taxRatesBp}
                        locale={locale}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`}>
                            <PencilIcon />
                          </Button>
                        }
                      />
                      <form action={async () => {
                        "use server"
                        await archiveProductAction(p.id)
                      }}>
                        <Button variant="ghost" size="icon" aria-label={`Archive ${p.name}`}>
                          <ArchiveIcon />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>Save the things you sell — day rates, packages, retainers — and invoices take seconds.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addButton}</EmptyContent>
        </Empty>
      )}
    </PageBody>
  )
}
