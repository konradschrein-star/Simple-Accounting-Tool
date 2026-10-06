"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"

type Options<T extends object> = {
  /** Toast on success; defaults to the action's own `message`. */
  success?: string | ((result: T & { message?: string }) => string | undefined)
  onSuccess?: (result: T & { message?: string }) => void
  /** Re-render server components afterwards (default true). */
  refresh?: boolean
}

/** One way to call a server action from the client: pending state, error toast, success toast, refresh. */
export function useServerAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run<T extends object>(action: () => Promise<ActionResult<T>>, options: Options<T> = {}) {
    start(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const message = typeof options.success === "function" ? options.success(result) : (options.success ?? result.message)
      if (message) toast.success(message)
      options.onSuccess?.(result)
      if (options.refresh !== false) router.refresh()
    })
  }
  return { pending, run }
}
