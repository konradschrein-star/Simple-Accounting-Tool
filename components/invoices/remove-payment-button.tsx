"use client"

import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useServerAction } from "@/components/use-server-action"
import { deletePayment } from "@/server/actions/invoices"

/** Removes one recorded payment (a bank-matched one becomes matchable again). */
export function RemovePaymentButton({ paymentId }: { paymentId: string }) {
  const { pending, run } = useServerAction()
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-6"
      aria-label="Remove this payment"
      disabled={pending}
      onClick={() => run(() => deletePayment(paymentId))}
    >
      <XIcon />
    </Button>
  )
}
