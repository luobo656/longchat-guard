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
