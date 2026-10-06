import { describe, expect, it } from "vitest"
import type { z } from "zod"
import { accountNumberField, bicField, ibanField, routingNumberField, sortCodeField, vatIdField } from "@/lib/validation"

/** The canonical value, or the first error message. */
const check = (field: z.ZodType<string, string | undefined>, value: string) => {
  const result = field.safeParse(value)
  return result.success ? { value: result.data } : { error: result.error.issues[0].message }
}

describe("identifier fields", () => {
  it("accept blanks as empty", () => {
    for (const field of [ibanField, bicField, vatIdField, sortCodeField, accountNumberField, routingNumberField])
      expect(check(field, "  ")).toEqual({ value: "" })
  })
  it("store IBANs and BICs in electronic format", () => {
    expect(check(ibanField, "de89 3704 0044 0532 0130 00")).toEqual({ value: "DE89370400440532013000" })
    expect(check(ibanField, "DE89 3704 0044 0532 0130 01").error).toMatch(/typo/)
    expect(check(bicField, "coba de ff xxx")).toEqual({ value: "COBADEFFXXX" })
    expect(check(bicField, "COBADE").error).toBeDefined()
  })
  it("compact VAT IDs and verify EU/UK checksums", () => {
    expect(check(vatIdField, "DE 312.345.671")).toEqual({ value: "DE312345671" })
    expect(check(vatIdField, "DE312345678").error).toMatch(/checksum/)
    expect(check(vatIdField, "GB123456727")).toEqual({ value: "GB123456727" })
    expect(check(vatIdField, "123456789").error).toMatch(/country code/)
    expect(check(vatIdField, "GST0012345")).toEqual({ value: "GST0012345" }) // Jersey GST — no public checksum
  })
  it("normalizes UK and US bank details", () => {
    expect(check(sortCodeField, "200000")).toEqual({ value: "20-00-00" })
    expect(check(sortCodeField, "2000").error).toBeDefined()
    expect(check(accountNumberField, "5577 9911")).toEqual({ value: "55779911" })
    expect(check(accountNumberField, "12ab").error).toBeDefined()
    expect(check(routingNumberField, "021000021")).toEqual({ value: "021000021" })
    expect(check(routingNumberField, "123456789").error).toMatch(/checksum/)
  })
})
