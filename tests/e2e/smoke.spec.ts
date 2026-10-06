import { expect, test } from "@playwright/test"

test("demo: landing → seeded dashboard → review → books → invoice PDF", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know your cash")
  await page.getByRole("button", { name: /Germany/ }).click()
  await page.waitForURL("**/dashboard")
  await expect(page.getByText(/Net margin dropped/)).toBeVisible()
  await expect(page.getByRole("button", { name: /Request a Strategic Cash-Flow & Growth Plan/ }).first()).toBeVisible()

  await page.goto("/review")
  await expect(page.getByRole("button", { name: /Accept all 5 AI suggestions/ })).toBeVisible()

  await page.goto("/books?tab=pnl")
  await expect(page.getByText("Net result")).toBeVisible()

  await page.goto("/invoices")
  await page.getByRole("link", { name: /INV-2026-0001/ }).click()
  await page.waitForURL(/\/invoices\/[\w-]+$/)
  const pdf = await page.request.get(page.url().replace(/\/invoices\/([\w-]+)$/, "/api/invoices/$1/pdf"))
  expect(pdf.headers()["content-type"]).toBe("application/pdf")
  expect(errors).toEqual([])
})

test("real flow: test login → onboarding (UK) → client → invoice → finalize", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.local`
  await page.goto("/signin")
  await page.fill("#email", email)
  await page.click("button[type=submit]")
  await page.waitForURL("**/onboarding")
  await page.getByText("United Kingdom").click()
  await page.fill("#businessName", "E2E Studio Ltd")
  await page.fill("#addressLine1", "1 Test Street")
  await page.fill("#postcode", "E1 6PG")
  await page.fill("#city", "London")
  await page.fill("#vatId", "GB123456789")
  await page.getByRole("button", { name: "Create my workspace" }).click()
  await page.waitForURL("**/dashboard")

  await page.goto("/invoices")
  await page.getByRole("button", { name: "New invoice" }).first().click()
  await page.waitForURL(/\/invoices\/[\w-]+$/)
  await page.getByRole("button", { name: "New" }).click()
  await page.fill("#client-name", "Acme Retail Ltd")
  await page.fill("#client-addressLine1", "1 Market Street")
  await page.fill("#client-city", "Manchester")
  await page.getByRole("button", { name: "Save client" }).click()
  await page.getByLabel("Description").fill("Discovery workshop")
  await page.getByLabel("Unit price").fill("950")
  await expect(page.getByText("£1,140.00")).toBeVisible() // 950 + 20 % VAT
  await expect(page.getByRole("button", { name: "Finalize invoice" })).toBeEnabled({ timeout: 10_000 })
  await page.getByRole("button", { name: "Finalize invoice" }).click()
  await expect(page.getByRole("heading", { name: /INV-\d{4}-0001/ })).toBeVisible()
})
