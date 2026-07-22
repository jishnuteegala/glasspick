export interface GenerationGuard {
  next(): number
  isCurrent(generation: number): boolean
  cancel(): void
}

export function createGenerationGuard(): GenerationGuard {
  let current = 0
  return {
    next: () => ++current,
    isCurrent: (generation) => generation === current,
    cancel: () => { current++ },
  }
}
