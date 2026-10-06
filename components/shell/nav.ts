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

/** The app's navigation, shared by the sidebar and the command menu. */

export type ShellRole = "admin" | "staff" | "user"
export type NavItem = { title: string; url: string; icon: LucideIcon }
export type NavGroup = { label: string; items: NavItem[] }

/** The sidebar shows the number of transactions waiting for review on this entry. */
export const REVIEW_URL = "/review"

const WORKSPACE: NavGroup[] = [
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
      { title: "Review queue", url: REVIEW_URL, icon: ListChecksIcon },
      { title: "Books & P&L", url: "/books", icon: BookOpenCheckIcon },
    ],
  },
  { label: "Workspace", items: [{ title: "Settings", url: "/settings", icon: SettingsIcon }] },
]

export function navGroups(role: ShellRole): NavGroup[] {
  if (role === "user") return WORKSPACE
  const team: NavItem[] = [{ title: "Bookkeeper console", url: "/console", icon: BriefcaseBusinessIcon }]
  if (role === "admin") team.push({ title: "Admin & leads", url: "/admin", icon: ShieldIcon })
  return [...WORKSPACE, { label: "Team", items: team }]
}
