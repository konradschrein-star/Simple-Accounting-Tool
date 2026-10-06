"use client"

import {
  BookOpenCheckIcon,
  BriefcaseBusinessIcon,
  FileSignatureIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PackageIcon,
  PaperclipIcon,
  type LucideIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { BrandMark } from "./brand"
import { NavUser } from "./nav-user"

type NavItem = { title: string; url: string; icon: LucideIcon; badge?: number }

export type ShellRole = "admin" | "staff" | "user"

export function navGroups(role: ShellRole, reviewCount: number): { label: string; items: NavItem[] }[] {
  const groups = [
    { label: "Overview", items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon }] },
    {
      label: "Get paid",
      items: [
        { title: "Invoices", url: "/invoices", icon: FileTextIcon },
        { title: "Quotes", url: "/quotes", icon: FileSignatureIcon },
        { title: "Products", url: "/products", icon: PackageIcon },
        { title: "Clients", url: "/clients", icon: UsersIcon },
      ],
    },
    {
      label: "Bank & books",
      items: [
        { title: "Imports", url: "/imports", icon: UploadIcon },
        { title: "Transactions", url: "/transactions", icon: ReceiptTextIcon },
        { title: "Receipts", url: "/receipts", icon: PaperclipIcon },
        { title: "Review queue", url: "/review", icon: ListChecksIcon, badge: reviewCount },
        { title: "Books & P&L", url: "/books", icon: BookOpenCheckIcon },
      ],
    },
    { label: "Workspace", items: [{ title: "Settings", url: "/settings", icon: SettingsIcon }] },
  ]
  if (role === "user") return groups
  const team: NavItem[] = [{ title: "Bookkeeper console", url: "/console", icon: BriefcaseBusinessIcon }]
  if (role === "admin") team.push({ title: "Admin & leads", url: "/admin", icon: ShieldIcon })
  return [...groups, { label: "Team", items: team }]
}

export function AppSidebar({
  brandName,
  orgName,
  user,
  role,
  reviewCount,
}: {
  brandName: string
  orgName: string
  user: { name: string; email: string; image?: string | null; isAnonymous?: boolean | null }
  role: ShellRole
  reviewCount: number
}) {
  const pathname = usePathname()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <BrandMark />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{brandName}</span>
                  <span className="truncate text-xs text-muted-foreground">{orgName}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups(role, reviewCount).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
