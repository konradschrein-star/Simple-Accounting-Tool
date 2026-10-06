"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { authClient } from "@/lib/auth-client"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  )
}

export function SignInCard({ googleEnabled, devLogin }: { googleEnabled: boolean; devLogin: boolean }) {
  const router = useRouter()
  const next = useSearchParams().get("next") ?? "/dashboard"
  const [pending, setPending] = useState<string | null>(null)

  async function google() {
    setPending("google")
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next })
    if (error) {
      toast.error(error.message ?? "Google sign-in failed")
      setPending(null)
    }
  }

  async function devSignIn(form: FormData) {
    setPending("dev")
    const email = String(form.get("email"))
    const password = "e2e-password-123"
    const signIn = await authClient.signIn.email({ email, password })
    if (signIn.error) {
      const signUp = await authClient.signUp.email({ email, password, name: email.split("@")[0] })
      if (signUp.error) {
        toast.error(signUp.error.message ?? "Sign-in failed")
        setPending(null)
        return
      }
    }
    router.push(next)
    router.refresh()
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your invoicing & cash-flow workspace</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Button variant="outline" size="lg" className="w-full" onClick={google} disabled={!googleEnabled || !!pending}>
            {pending === "google" ? <Spinner /> : <GoogleIcon />} Continue with Google
          </Button>
          {!googleEnabled ? <p className="text-center text-xs text-muted-foreground">Google sign-in is not configured yet.</p> : null}
          {devLogin ? (
            <>
              <FieldSeparator>Test login (non-production)</FieldSeparator>
              <form action={devSignIn} className="grid gap-3">
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" name="email" type="email" defaultValue="e2e-de@test.local" required />
                </Field>
                <Button type="submit" disabled={!!pending}>
                  {pending === "dev" ? <Spinner /> : null} Sign in
                </Button>
              </form>
            </>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-center text-center text-xs text-muted-foreground">
        By continuing you agree to our privacy policy. We never sell your data.
      </CardFooter>
    </Card>
  )
}
