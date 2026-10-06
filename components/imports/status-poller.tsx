"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { isBatchPending } from "@/ingest/status"

/** Polls a parsing import and refreshes the server-rendered page once its status changes. */
export function ImportStatusPoller({ batchId }: { batchId: string }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(async () => {
      const response = await fetch(`/api/imports/${batchId}`, { cache: "no-store" })
      if (!response.ok) return
      const { status } = await response.json()
      if (!isBatchPending(status)) {
        clearInterval(timer)
        router.refresh()
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [batchId, router])
  return null
}
