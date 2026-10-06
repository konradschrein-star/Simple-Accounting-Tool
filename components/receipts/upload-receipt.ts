/** Client-side upload of one receipt, optionally straight onto a transaction. Returns an error message or null. */
export async function uploadReceipt(file: File, transactionId?: string): Promise<string | null> {
  const body = new FormData()
  body.set("file", file)
  if (transactionId) body.set("transactionId", transactionId)
  const response = await fetch("/api/receipts", { method: "POST", body }).catch(() => null)
  if (!response) return "Upload failed — check your connection and try again."
  if (response.ok) return null
  const json: { error?: string } | null = await response.json().catch(() => null)
  return json?.error ?? "Upload failed"
}
