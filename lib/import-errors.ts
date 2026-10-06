export const IMPORT_ERROR_COPY: Record<string, string> = {
  FILE_TOO_LARGE: "That file is larger than 10 MB. Export a shorter period and try again.",
  UNSUPPORTED_TYPE: "Upload a CSV export or a PDF statement from your bank.",
  DUPLICATE_FILE: "You have already imported this exact file.",
  QUOTA_EXCEEDED: "You've used this month's free AI statement imports. CSV imports remain unlimited.",
  RATE_LIMITED: "Too many uploads in a short time — wait a minute and try again.",
  ENCRYPTED_PDF: "This PDF is password-protected. Remove the password (print to PDF) and upload it again.",
  TOO_MANY_PAGES: "This statement has too many pages. Split it by month and upload each part.",
  CURRENCY_MISMATCH: "This statement's currency doesn't match your workspace currency.",
  UNREADABLE_FILE: "This file couldn't be read — export it again from your online banking, or try CSV.",
  NO_TRANSACTIONS_FOUND: "We couldn't find any transactions in this file.",
  LLM_TIMEOUT: "The AI reader timed out. Please retry in a moment.",
  LLM_INVALID_OUTPUT: "The AI reader couldn't produce a reliable result for this statement. Try the CSV export instead.",
  LLM_UNAVAILABLE: "AI statement reading is temporarily unavailable. CSV imports still work.",
  INTERRUPTED: "Processing was interrupted. Please retry.",
  PDF_TOOLING_UNAVAILABLE: "PDF reading is temporarily unavailable. CSV imports still work.",
  INTERNAL: "Something went wrong on our side. Please retry, or use the CSV export.",
}

export function importErrorMessage(code: string | null | undefined, fallback?: string | null): string {
  return (code && IMPORT_ERROR_COPY[code]) || fallback || "Something went wrong."
}
