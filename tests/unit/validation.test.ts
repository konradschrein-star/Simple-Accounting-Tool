import { describe, expect, it } from "vitest"
import { accountNumberProblem, bicProblem, ibanProblem, routingNumberProblem, sortCodeProblem, vatIdProblem } from "@/lib/validation"

describe("identifier validation", () => {
  it("accepts empty values — every field is optional", () => {
    for (const check of [ibanProblem, bicProblem, vatIdProblem, sortCodeProblem, accountNumberProblem, routingNumberProblem]) expect(check("  ")).toBeNull()
  })
  it("verifies IBAN checksums, with or without spaces", () => {
    expect(ibanProblem("DE89 3704 0044 0532 0130 00")).toBeNull()
    expect(ibanProblem("de89370400440532013000")).toBeNull()
    expect(ibanProblem("DE89 3704 0044 0532 0130 01")).toMatch(/typo/)
    expect(bicProblem("COBADEFFXXX")).toBeNull()
    expect(bicProblem("COBADE")).not.toBeNull()
  })
  it("verifies EU/UK VAT ID checksums and lets unknown schemes through", () => {
    expect(vatIdProblem("DE312345671")).toBeNull()
    expect(vatIdProblem("DE 312 345 671")).toBeNull()
    expect(vatIdProblem("DE312345678")).toMatch(/checksum/)
    expect(vatIdProblem("GB123456727")).toBeNull()
    expect(vatIdProblem("123456789")).toMatch(/country code/)
    expect(vatIdProblem("GST0012345")).toBeNull() // Jersey GST — no public checksum
  })
  it("checks UK and US bank details", () => {
    expect(sortCodeProblem("20-00-00")).toBeNull()
    expect(sortCodeProblem("2000")).not.toBeNull()
    expect(accountNumberProblem("55779911")).toBeNull()
    expect(accountNumberProblem("000123456789")).toBeNull()
    expect(accountNumberProblem("12ab")).not.toBeNull()
    expect(routingNumberProblem("021000021")).toBeNull()
    expect(routingNumberProblem("123456789")).toMatch(/checksum/)
  })
})
