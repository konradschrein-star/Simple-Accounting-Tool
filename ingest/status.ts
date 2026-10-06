/** Import lifecycle rules shared by the import page, the poller and the retry action. */
export const MAX_IMPORT_ATTEMPTS = 3

export function isBatchPending(status: string): boolean {
  return status === "uploaded" || status === "parsing"
}

/** Failures worth another paid run; the rest need a different file. */
const PERMANENT_FAILURES = new Set(["ENCRYPTED_PDF", "TOO_MANY_PAGES", "CURRENCY_MISMATCH", "UNSUPPORTED_TYPE"])

export function isRetryable(batch: { status: string; source: string; filePath: string | null; errorCode: string | null; attempts: number }): boolean {
  return batch.status === "failed" && batch.source === "pdf" && !!batch.filePath && !PERMANENT_FAILURES.has(batch.errorCode ?? "") && batch.attempts < MAX_IMPORT_ATTEMPTS
}
