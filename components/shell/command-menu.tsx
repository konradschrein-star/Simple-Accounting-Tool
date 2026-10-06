"use client"

import { FilePlusIcon, FileSignatureIcon, MonitorIcon, MoonIcon, PaperclipIcon, ReceiptTextIcon, SearchIcon, SunIcon, UploadIcon, UserIcon } from "lucide-react"
import { defaultFilter } from "cmdk"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState, useTransition } from "react"
import { InvoiceStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { displayStatus, KIND_LABELS } from "@/invoicing/documents"
import { formatDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { newDocument } from "@/server/actions/invoices"
import { commandSearch } from "@/server/actions/search"
import { EMPTY_RESULTS, MIN_QUERY_LENGTH } from "@/lib/search"
import type { SearchResults } from "@/server/repos/search"
import { navGroups, type ShellRole } from "./nav"

/** ⌘K / Ctrl+K: jump anywhere, create anything, find any invoice, client or bank line. */
export function CommandMenu({ role, currency, locale, today }: { role: ShellRole; currency: CurrencyCode; locale: string; today: string }) {
  const router = useRouter()
  const { setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Results remember the query they answer, so a slow response never shows up under a newer query.
  const [results, setResults] = useState<{ query: string; hits: SearchResults }>({ query: "", hits: EMPTY_RESULTS })
  const [searching, startSearch] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LENGTH) return
    const timer = setTimeout(() => startSearch(async () => setResults({ query: q, hits: await commandSearch(q) })), 180)
    return () => clearTimeout(timer)
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }
  const act = (fn: () => unknown) => {
    setOpen(false)
    fn()
  }
  const hits = results.query === query.trim() ? results.hits : EMPTY_RESULTS
  // Server hits are already filtered by the database; only static commands go through cmdk's fuzzy matching.
  const tag = (id: string) => `hit:${id}`

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 w-full max-w-64 justify-start gap-2 text-muted-foreground sm:w-64" onClick={() => setOpen(true)}>
        <SearchIcon /> <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        className="sm:max-w-2xl"
        title="Command menu"
        description="Search invoices, clients and transactions, or jump to a page"
      >
        <Command filter={(value, search, keywords) => (value.startsWith("hit:") ? 1 : defaultFilter(value, search, keywords))}>
          <CommandInput placeholder="Search invoices, clients, transactions… or type a command" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{searching ? <Spinner className="mx-auto" /> : "Nothing found."}</CommandEmpty>
            {hits.documents.length ? (
              <CommandGroup heading="Documents">
                {hits.documents.map((d) => (
                  <CommandItem key={d.id} value={tag(d.id)} onSelect={() => go(`/invoices/${d.id}`)}>
                    <span className="font-medium whitespace-nowrap">{d.number ?? `Draft ${KIND_LABELS[d.kind].singular.toLowerCase()}`}</span>
                    <span className="truncate text-muted-foreground">{d.clientName}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(d.totalMinor, d.currency, locale)}</span>
                      <InvoiceStatusBadge status={displayStatus(d, today, d.paidMinor)} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {hits.clients.length ? (
              <CommandGroup heading="Clients">
                {hits.clients.map((c) => (
                  // There is no client page: open the clients table filtered to this one (by email when there is one — names can repeat).
                  <CommandItem key={c.id} value={tag(c.id)} onSelect={() => go(`/clients?q=${encodeURIComponent(c.email || c.name)}`)}>
                    <UserIcon /> {c.name} <span className="truncate text-muted-foreground">{c.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {hits.transactions.length ? (
              <CommandGroup heading="Transactions">
                {hits.transactions.map((t) => (
                  <CommandItem key={t.id} value={tag(t.id)} onSelect={() => go(`/transactions?txn=${t.id}`)}>
                    <ReceiptTextIcon />
                    <span className="truncate">{t.counterparty || t.description}</span>
                    <span className="text-muted-foreground">{formatDate(t.date, locale, "short")}</span>
                    <span className="ml-auto tabular-nums">{formatMoney(t.amountMinor, currency, locale)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Create">
              <CommandItem onSelect={() => act(() => newDocument("invoice"))}>
                <FilePlusIcon /> New invoice
              </CommandItem>
              <CommandItem onSelect={() => act(() => newDocument("quote"))}>
                <FileSignatureIcon /> New quote
              </CommandItem>
              <CommandItem onSelect={() => go("/imports")}>
                <UploadIcon /> Import a bank statement
              </CommandItem>
              <CommandItem onSelect={() => go("/receipts")}>
                <PaperclipIcon /> Upload receipts
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {navGroups(role).map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem key={item.url} onSelect={() => go(item.url)}>
                    <item.icon /> {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandGroup heading="Appearance">
              <CommandItem onSelect={() => act(() => setTheme("light"))}>
                <SunIcon /> Light mode
              </CommandItem>
              <CommandItem onSelect={() => act(() => setTheme("dark"))}>
                <MoonIcon /> Dark mode
              </CommandItem>
              <CommandItem onSelect={() => act(() => setTheme("system"))}>
                <MonitorIcon /> Match system
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
