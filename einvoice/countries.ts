/**
 * Addresses store the country as typed ("Deutschland", "United Kingdom", "DE"); e-invoices need ISO 3166-1 alpha-2.
 * Covers the names people actually type for our markets and their main trading partners.
 */
const NAMES: Record<string, string> = {
  de: "DE", deutschland: "DE", germany: "DE", allemagne: "DE",
  at: "AT", österreich: "AT", oesterreich: "AT", austria: "AT",
  ch: "CH", schweiz: "CH", switzerland: "CH", suisse: "CH",
  gb: "GB", uk: "GB", "united kingdom": "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", "vereinigtes königreich": "GB", großbritannien: "GB", grossbritannien: "GB",
  je: "JE", jersey: "JE", gg: "GG", guernsey: "GG", im: "IM", "isle of man": "IM",
  us: "US", usa: "US", "united states": "US", "united states of america": "US", "vereinigte staaten": "US",
  ie: "IE", ireland: "IE", irland: "IE",
  fr: "FR", france: "FR", frankreich: "FR",
  nl: "NL", netherlands: "NL", niederlande: "NL", holland: "NL",
  be: "BE", belgium: "BE", belgien: "BE",
  lu: "LU", luxembourg: "LU", luxemburg: "LU",
  it: "IT", italy: "IT", italien: "IT",
  es: "ES", spain: "ES", spanien: "ES",
  pt: "PT", portugal: "PT",
  pl: "PL", poland: "PL", polen: "PL",
  cz: "CZ", czechia: "CZ", "czech republic": "CZ", tschechien: "CZ",
  dk: "DK", denmark: "DK", dänemark: "DK",
  se: "SE", sweden: "SE", schweden: "SE",
  no: "NO", norway: "NO", norwegen: "NO",
  fi: "FI", finland: "FI", finnland: "FI",
  ca: "CA", canada: "CA", kanada: "CA",
  au: "AU", australia: "AU", australien: "AU",
}

/** ISO code for a typed country, or `fallback` when blank or unknown. */
export function countryCode(typed: string, fallback: string): string {
  const key = typed.trim().toLowerCase()
  if (!key) return fallback
  return NAMES[key] ?? (/^[a-z]{2}$/.test(key) ? key.toUpperCase() : fallback)
}
