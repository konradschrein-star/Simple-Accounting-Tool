export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startBackgroundTasks } = await import("./server/boot")
  startBackgroundTasks()
}
