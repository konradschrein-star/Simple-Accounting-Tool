/** Expected, user-facing failures (validation, business rules). Anything else is a bug and propagates. */
export class DomainError extends Error {}

export type ActionResult<T extends object = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string }

/** Runs a mutation and turns DomainErrors into `{ ok: false }` results for the client. */
export async function guarded<T extends object>(
  fn: () => (T & { message?: string }) | void | Promise<(T & { message?: string }) | void>
): Promise<ActionResult<T>> {
  try {
    const value = await fn()
    return { ok: true, ...(value ?? {}) } as ActionResult<T>
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    throw error
  }
}

export const fail = (error: string) => ({ ok: false as const, error })
