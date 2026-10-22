/** The full-history scanner must never be invoked on incomplete/aborted
 * automatic scroll preparation. It also must never return a usable result
 * after the user cancels while the (legacy, non-abortable) scanner is running.
 */
export async function runHistoryAfterAutomaticPreparation<T>(
  signal: AbortSignal,
  prepare: () => Promise<void>,
  scan: () => Promise<T>,
  onVerify: () => void
): Promise<T> {
  const requireActive = (): void => {
    if (signal.aborted) throw new Error('auto_scroll_cancelled')
  }

  requireActive()
  await prepare()
  requireActive()
  onVerify()
  requireActive()
  const result = await scan()
  requireActive()
  return result
}
