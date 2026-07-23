const LOCK_NAME = "glasspick-draw-state-v1"

const fallbackQueue: { current: Promise<unknown> } = { current: Promise.resolve() }

export async function withDrawStateLock<T>(action: () => Promise<T> | T): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request(LOCK_NAME, () => Promise.resolve(action()))
  }
  const run = fallbackQueue.current.then(() => action(), () => action())
  fallbackQueue.current = run.catch(() => undefined)
  return run
}
