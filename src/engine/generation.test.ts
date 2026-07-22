import { describe, expect, it } from "vitest"
import { createGenerationGuard } from "./generation"

describe("generation guard", () => {
  it("discards stale asynchronous work after a newer generation or cancellation", () => {
    const guard = createGenerationGuard()
    const first = guard.next()
    const second = guard.next()
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
    guard.cancel()
    expect(guard.isCurrent(second)).toBe(false)
  })

  it("prevents a cancelled asynchronous result from restoring state", async () => {
    const guard = createGenerationGuard()
    let finish!: (value: string) => void
    const result = new Promise<string>((resolve) => { finish = resolve })
    let state = "pending"
    const current = guard.next()
    const operation = result.then((value) => {
      if (guard.isCurrent(current)) state = value
    })
    guard.cancel()
    state = "cancelled"
    finish("complete")
    await operation
    expect(state).toBe("cancelled")
  })
})
