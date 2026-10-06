"use client"

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
import { navGroups, REVIEW_URL, type ShellRole } from "./nav"
import { NavUser } from "./nav-user"

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
        {navGroups(role).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.url === REVIEW_URL && reviewCount ? <SidebarMenuBadge>{reviewCount}</SidebarMenuBadge> : null}
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
