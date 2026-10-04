export function createCoalescedAsyncRunner(task: () => Promise<void>): () => void {
  let running = false
  let pending = false

  const drain = async (): Promise<void> => {
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      do {
        pending = false
        await task()
      } while (pending)
    } finally {
      running = false
    }
  }

  return () => {
    void drain()
  }
}

export function createDebouncedRunner(
  task: () => void,
  delayMs: number
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    schedule: () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        task()
      }, delayMs)
    },
    cancel: () => {
      if (timer === undefined) return
      clearTimeout(timer)
      timer = undefined
    }
  }
}
