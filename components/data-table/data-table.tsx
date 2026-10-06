"use client"

import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon, PlusCircleIcon, SearchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type Facet = { columnId: string; title: string; options: { value: string; label: string }[] }

/** Sortable header button for a column. */
export function SortHeader<T>({ column, title, className }: { column: Column<T>; title: string; className?: string }) {
  const sorted = column.getIsSorted()
  return (
    <Button variant="ghost" size="sm" className={cn("-ml-3 h-8", className)} onClick={() => column.toggleSorting(sorted === "asc")}>
      {title}
      {sorted === "asc" ? <ArrowUpIcon /> : sorted === "desc" ? <ArrowDownIcon /> : <ArrowUpDownIcon className="opacity-40" />}
    </Button>
  )
}

/** Multi-select filter chip (shadcn data-table "faceted filter" pattern). */
function FacetFilter<T>({ column, title, options }: { column: Column<T>; title: string; options: Facet["options"] }) {
  const counts = column.getFacetedUniqueValues()
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? [])
  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    column.setFilterValue(next.size ? [...next] : undefined)
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircleIcon /> {title}
          {selected.size ? (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {selected.size > 2 ? `${selected.size} selected` : options.filter((o) => selected.has(o.value)).map((o) => o.label).join(", ")}
              </Badge>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.value} onSelect={() => toggle(option.value)}>
                  <div className={cn("flex size-4 items-center justify-center rounded-sm border", selected.has(option.value) ? "bg-primary text-primary-foreground" : "opacity-50")}>
                    {selected.has(option.value) ? <CheckIcon className="size-3" /> : null}
                  </div>
                  {option.label}
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">{counts.get(option.value) ?? 0}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {selected.size ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => column.setFilterValue(undefined)} className="justify-center">
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Values in `filterValue` (from FacetFilter) — the row passes when its value is one of them. */
export const facetFilterFn = (row: { getValue: (id: string) => unknown }, columnId: string, filterValue: string[]) => filterValue.includes(String(row.getValue(columnId)))

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Search…",
  facets = [],
  rowHref,
  initialSorting = [],
  pageSize = 25,
  toolbar,
  empty,
}: {
  columns: ColumnDef<T>[]
  data: T[]
  searchPlaceholder?: string
  facets?: Facet[]
  rowHref?: (row: T) => string
  initialSorting?: SortingState
  pageSize?: number
  toolbar?: React.ReactNode
  empty?: React.ReactNode
}) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the shadcn data-table standard; the component simply opts out of compiler memoization.
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })
  const filtered = globalFilter !== "" || columnFilters.length > 0
  const rows = table.getRowModel().rows

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" className="h-8 pl-8" />
        </div>
        {facets.map((f) => {
          const column = table.getColumn(f.columnId)
          return column ? <FacetFilter key={f.columnId} column={column} title={f.title} options={f.options} /> : null
        })}
        {filtered ? (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => (setGlobalFilter(""), setColumnFilters([]))}>
            Reset <XIcon />
          </Button>
        ) : null}
        {toolbar ? <div className="ml-auto flex items-center gap-2">{toolbar}</div> : null}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header, i) => (
                  <TableHead key={header.id} className={cn(i === 0 && "pl-6", i === group.headers.length - 1 && "pr-6")}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(rowHref && "cursor-pointer")}
                  onClick={rowHref ? (e) => !(e.target as HTMLElement).closest("button, a, input, [role=checkbox]") && router.push(rowHref(row.original)) : undefined}
                >
                  {row.getVisibleCells().map((cell, i, cells) => (
                    <TableCell key={cell.id} className={cn(i === 0 && "pl-6", i === cells.length - 1 && "pr-6")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {filtered ? "No matches." : (empty ?? "Nothing here yet.")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {table.getPageCount() > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {table.getFilteredRowModel().rows.length} rows
          </span>
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}
