import type { JurisdictionCode } from "@/jurisdictions/types"

export type Vendor = { counterparty: string; description: string; amountMinor: number; accountCode: string; day: number; every?: "month" | "quarter" }

export type Persona = {
  business: { name: string; legalName: string; addressLine1: string; postcode: string; city: string; email: string; phone: string; website: string; taxNumber: string; vatId: string; bankIban: string; bankBic: string; ukSortCode: string; ukAccountNumber: string; usRoutingNumber: string }
  owner: string
  clients: { name: string; email: string; addressLine1: string; postcode: string; city: string; country: string }[]
  services: { description: string; unitPriceMinor: number }[]
  vendors: Vendor[]
  /** Unusual one-off costs in the last weeks — they push the margin below 25 % and fill the review queue. */
  recentOneOffs: { counterparty: string; description: string; amountMinor: number; suggestedCode: string; confidence: number }[]
  transferCode: string
  ownerCode: string
}

export const PERSONAS: Record<JurisdictionCode, Persona> = {
  de: {
    business: { name: "Studio Nord", legalName: "Studio Nord – Lea Hartmann", addressLine1: "Torstraße 112", postcode: "10119", city: "Berlin", email: "hallo@studio-nord.example", phone: "+49 30 1234567", website: "studio-nord.example", taxNumber: "37/123/45678", vatId: "DE312345678", bankIban: "DE89 3704 0044 0532 0130 00", bankBic: "COBADEFFXXX", ukSortCode: "", ukAccountNumber: "", usRoutingNumber: "" },
    owner: "Lea Hartmann",
    clients: [
      { name: "Bäckerei Müller GmbH", email: "buchhaltung@baeckerei-mueller.example", addressLine1: "Hauptstraße 5", postcode: "80331", city: "München", country: "Deutschland" },
      { name: "Kaffeerösterei Elbe KG", email: "office@elbe-roestet.example", addressLine1: "Am Sandtorkai 40", postcode: "20457", city: "Hamburg", country: "Deutschland" },
      { name: "Praxis Dr. Weber", email: "verwaltung@praxis-weber.example", addressLine1: "Königsallee 21", postcode: "40212", city: "Düsseldorf", country: "Deutschland" },
      { name: "Velo Werk Leipzig UG", email: "hello@velowerk.example", addressLine1: "Karl-Liebknecht-Str. 9", postcode: "04107", city: "Leipzig", country: "Deutschland" },
    ],
    services: [
      { description: "Brand-Workshop (Tagessatz)", unitPriceMinor: 120000 },
      { description: "Webdesign – Umsetzung (Stunden)", unitPriceMinor: 9500 },
      { description: "Monatliche Betreuung (Retainer)", unitPriceMinor: 180000 },
      { description: "Social-Media-Kampagne", unitPriceMinor: 240000 },
    ],
    vendors: [
      { counterparty: "Hausverwaltung Schmidt", description: "Miete Atelier", amountMinor: 95000, accountCode: "4210", day: 1, every: "month" },
      { counterparty: "Adobe Systems", description: "Creative Cloud Abo", amountMinor: 6645, accountCode: "4806", day: 3, every: "month" },
      { counterparty: "Deutsche Telekom", description: "Mobilfunk & Internet", amountMinor: 5999, accountCode: "4920", day: 12, every: "month" },
      { counterparty: "Allianz Versicherung", description: "Betriebshaftpflicht", amountMinor: 18900, accountCode: "4360", day: 15, every: "quarter" },
      { counterparty: "Finanzamt Berlin", description: "USt-Voranmeldung", amountMinor: 210000, accountCode: "1780", day: 10, every: "quarter" },
    ],
    recentOneOffs: [
      { counterparty: "Apple Store", description: "MacBook Pro 16 Zoll", amountMinor: 389900, suggestedCode: "4900", confidence: 0.62 },
      { counterparty: "Deutsche Bahn", description: "BahnCard 100 1. Kl.", amountMinor: 699000, suggestedCode: "4660", confidence: 0.71 },
      { counterparty: "Freelance Collective", description: "Subunternehmer Illustration", amountMinor: 280000, suggestedCode: "3100", confidence: 0.78 },
      { counterparty: "Restaurant Lokal", description: "Kundenessen", amountMinor: 18450, suggestedCode: "4650", confidence: 0.82 },
      { counterparty: "Amazon EU", description: "Bürobedarf", amountMinor: 8990, suggestedCode: "4930", confidence: 0.74 },
    ],
    transferCode: "1360",
    ownerCode: "1800",
  },
  uk: {
    business: { name: "Thornbury Digital", legalName: "Thornbury Digital Ltd", addressLine1: "14 Shoreditch High Street", postcode: "E1 6PG", city: "London", email: "hello@thornbury.example", phone: "+44 20 7946 0000", website: "thornbury.example", taxNumber: "1234567890", vatId: "GB123456789", bankIban: "", bankBic: "", ukSortCode: "20-00-00", ukAccountNumber: "55779911", usRoutingNumber: "" },
    owner: "Oliver Grant",
    clients: [
      { name: "Acme Retail Ltd", email: "accounts@acme-retail.example", addressLine1: "1 Market Street", postcode: "M1 1AA", city: "Manchester", country: "United Kingdom" },
      { name: "Brightwell Dental", email: "admin@brightwell.example", addressLine1: "22 Park Row", postcode: "LS1 5HD", city: "Leeds", country: "United Kingdom" },
      { name: "Cobalt Labs", email: "finance@cobalt.example", addressLine1: "9 Kings Road", postcode: "BN1 1NA", city: "Brighton", country: "United Kingdom" },
      { name: "Harbour Coffee Co", email: "hello@harbourcoffee.example", addressLine1: "3 Quay Street", postcode: "BS1 4HB", city: "Bristol", country: "United Kingdom" },
    ],
    services: [
      { description: "Discovery workshop (day rate)", unitPriceMinor: 95000 },
      { description: "Web development (hours)", unitPriceMinor: 8500 },
      { description: "Monthly retainer", unitPriceMinor: 160000 },
      { description: "Paid social campaign", unitPriceMinor: 210000 },
    ],
    vendors: [
      { counterparty: "WeWork", description: "Desk membership", amountMinor: 65000, accountCode: "6200", day: 1, every: "month" },
      { counterparty: "Google Workspace", description: "Business Standard", amountMinor: 4800, accountCode: "6400", day: 4, every: "month" },
      { counterparty: "Vodafone", description: "Mobile contract", amountMinor: 3500, accountCode: "6400", day: 12, every: "month" },
      { counterparty: "Hiscox", description: "Professional indemnity", amountMinor: 15500, accountCode: "6200", day: 15, every: "quarter" },
      { counterparty: "HMRC", description: "VAT payment", amountMinor: 190000, accountCode: "2200", day: 7, every: "quarter" },
    ],
    recentOneOffs: [
      { counterparty: "Apple Store", description: "MacBook Pro", amountMinor: 279900, suggestedCode: "6900", confidence: 0.6 },
      { counterparty: "Trainline", description: "Client visits Edinburgh", amountMinor: 64000, suggestedCode: "6100", confidence: 0.79 },
      { counterparty: "Upwork", description: "Freelance designer", amountMinor: 350000, suggestedCode: "5100", confidence: 0.66 },
      { counterparty: "Dishoom", description: "Client dinner", amountMinor: 16800, suggestedCode: "6550", confidence: 0.81 },
      { counterparty: "Ryman", description: "Stationery", amountMinor: 4590, suggestedCode: "6400", confidence: 0.77 },
    ],
    transferCode: "1200",
    ownerCode: "3000",
  },
  us: {
    business: { name: "Harbor Lane Consulting", legalName: "Harbor Lane Consulting LLC", addressLine1: "88 Pine Street, Suite 400", postcode: "NY 10005", city: "New York", email: "hello@harborlane.example", phone: "+1 212 555 0142", website: "harborlane.example", taxNumber: "12-3456789", vatId: "", bankIban: "", bankBic: "", ukSortCode: "", ukAccountNumber: "000123456789", usRoutingNumber: "021000021" },
    owner: "Maya Chen",
    clients: [
      { name: "Northwind Traders Inc.", email: "ap@northwind.example", addressLine1: "500 Market St", postcode: "CA 94105", city: "San Francisco", country: "USA" },
      { name: "Bluebird Health", email: "billing@bluebird.example", addressLine1: "200 Clarendon St", postcode: "MA 02116", city: "Boston", country: "USA" },
      { name: "Summit Outdoor Co.", email: "finance@summit.example", addressLine1: "1600 Glenarm Pl", postcode: "CO 80202", city: "Denver", country: "USA" },
      { name: "Lakeside Dental Group", email: "office@lakeside.example", addressLine1: "233 S Wacker Dr", postcode: "IL 60606", city: "Chicago", country: "USA" },
    ],
    services: [
      { description: "Strategy workshop (day rate)", unitPriceMinor: 180000 },
      { description: "Implementation (hours)", unitPriceMinor: 15000 },
      { description: "Monthly advisory retainer", unitPriceMinor: 250000 },
      { description: "Market research report", unitPriceMinor: 320000 },
    ],
    vendors: [
      { counterparty: "Regus", description: "Office membership", amountMinor: 89000, accountCode: "6200", day: 1, every: "month" },
      { counterparty: "Adobe", description: "Creative Cloud", amountMinor: 5999, accountCode: "6180", day: 3, every: "month" },
      { counterparty: "Verizon", description: "Wireless", amountMinor: 8500, accountCode: "6250", day: 12, every: "month" },
      { counterparty: "Hiscox", description: "Business insurance", amountMinor: 21000, accountCode: "6150", day: 15, every: "quarter" },
      { counterparty: "IRS USATAXPYMT", description: "Estimated tax", amountMinor: 450000, accountCode: "3000", day: 15, every: "quarter" },
    ],
    recentOneOffs: [
      { counterparty: "Apple Store", description: "MacBook Pro", amountMinor: 349900, suggestedCode: "6220", confidence: 0.63 },
      { counterparty: "Delta Air Lines", description: "Client trip Denver", amountMinor: 78000, suggestedCode: "6240", confidence: 0.8 },
      { counterparty: "Toptal", description: "Contract analyst", amountMinor: 520000, suggestedCode: "6110", confidence: 0.7 },
      { counterparty: "Carbone", description: "Client dinner", amountMinor: 32000, suggestedCode: "6245", confidence: 0.83 },
      { counterparty: "Staples", description: "Office supplies", amountMinor: 6400, suggestedCode: "6180", confidence: 0.76 },
    ],
    transferCode: "1200",
    ownerCode: "3000",
  },
  je: {
    business: { name: "Granite Bay Consulting", legalName: "Granite Bay Consulting Ltd", addressLine1: "12 Hill Street", postcode: "JE2 4UA", city: "St Helier", email: "hello@granitebay.example", phone: "+44 1534 000000", website: "granitebay.example", taxNumber: "0123456789", vatId: "GST0012345", bankIban: "", bankBic: "", ukSortCode: "60-91-99", ukAccountNumber: "12345678", usRoutingNumber: "" },
    owner: "James Le Brocq",
    clients: [
      { name: "Island Fiduciary Ltd", email: "accounts@islandfid.example", addressLine1: "4 Esplanade", postcode: "JE1 1BD", city: "St Helier", country: "Jersey" },
      { name: "Gorey Harbour Hotel", email: "finance@goreyhotel.example", addressLine1: "Gorey Pier", postcode: "JE3 6EW", city: "Gorey", country: "Jersey" },
      { name: "Channel Wealth Partners", email: "ap@channelwealth.example", addressLine1: "22 Grenville Street", postcode: "JE4 8PX", city: "St Helier", country: "Jersey" },
      { name: "Seaview Dental", email: "office@seaview.example", addressLine1: "9 Bath Street", postcode: "JE2 4ST", city: "St Helier", country: "Jersey" },
    ],
    services: [
      { description: "Advisory workshop (day rate)", unitPriceMinor: 110000 },
      { description: "Consulting (hours)", unitPriceMinor: 12500 },
      { description: "Monthly retainer", unitPriceMinor: 175000 },
      { description: "Process review report", unitPriceMinor: 260000 },
    ],
    vendors: [
      { counterparty: "Liberty Wharf Offices", description: "Office rent", amountMinor: 120000, accountCode: "6200", day: 1, every: "month" },
      { counterparty: "Microsoft 365", description: "Business Premium", amountMinor: 3800, accountCode: "6400", day: 4, every: "month" },
      { counterparty: "JT Global", description: "Mobile & broadband", amountMinor: 6500, accountCode: "6400", day: 12, every: "month" },
      { counterparty: "Islands Insurance", description: "PI insurance", amountMinor: 24000, accountCode: "6750", day: 15, every: "quarter" },
      { counterparty: "Revenue Jersey", description: "GST return payment", amountMinor: 95000, accountCode: "2200", day: 28, every: "quarter" },
    ],
    recentOneOffs: [
      { counterparty: "Apple Store", description: "MacBook Pro", amountMinor: 279900, suggestedCode: "6900", confidence: 0.61 },
      { counterparty: "Blue Islands", description: "Flights Guernsey client", amountMinor: 42000, suggestedCode: "6100", confidence: 0.79 },
      { counterparty: "Freelance analyst", description: "Subcontracted research", amountMinor: 380000, suggestedCode: "5000", confidence: 0.67 },
      { counterparty: "Banjo", description: "Client lunch", amountMinor: 14200, suggestedCode: "6900", confidence: 0.72 },
      { counterparty: "Rymans Jersey", description: "Stationery", amountMinor: 3900, suggestedCode: "6400", confidence: 0.75 },
    ],
    transferCode: "1200",
    ownerCode: "3000",
  },
}
