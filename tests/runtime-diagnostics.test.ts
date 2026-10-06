import { describe, expect, it } from 'vitest'
import {
  appendRuntimeDiagnosticSnapshot,
  readRuntimeDiagnostics,
  RuntimeDiagnosticsTrace,
  serializeRuntimeDiagnostics,
  RUNTIME_DIAGNOSTICS_KEY,
  type RuntimeDiagnosticStorage
} from '../src/content/runtime-diagnostics'

class MemoryStorage implements RuntimeDiagnosticStorage {
  readonly data: Record<string, unknown> = {}

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.data[key] }
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items)
  }
}

describe('runtime diagnostics', () => {
  it('deduplicates consecutive state repeats and keeps a bounded trace', () => {
    const trace = new RuntimeDiagnosticsTrace('2.0.11', 1_000)
    trace.record('same', { state: 'normal' }, 1_100)
    trace.record('same', { state: 'normal' }, 1_200)

    for (let index = 0; index < 60; index += 1) {
      trace.record('step', { index }, 2_000 + index)
    }

    const snapshot = trace.snapshot('manual', 3_000)
    expect(snapshot.events).toHaveLength(48)
    expect(snapshot.events.at(-1)?.data.index).toBe(59)
  })

  it('keeps only the latest four persisted snapshots', async () => {
    const storage = new MemoryStorage()

    for (let index = 0; index < 6; index += 1) {
      const trace = new RuntimeDiagnosticsTrace('2.0.11', 1_000 + index)
      trace.record('ui_model', { riskState: 'normal' }, 2_000 + index)
      await appendRuntimeDiagnosticSnapshot(
        storage,
        trace.snapshot(`snapshot-${index}`, 3_000 + index)
      )
    }

    const stored = await readRuntimeDiagnostics(storage)
    expect(stored?.snapshots).toHaveLength(4)
    expect(stored?.snapshots.map((item) => item.reason)).toEqual([
      'snapshot-2',
      'snapshot-3',
      'snapshot-4',
      'snapshot-5'
    ])
    expect(storage.data[RUNTIME_DIAGNOSTICS_KEY]).toBeDefined()
  })

  it('exports stored history plus the current in-memory trace', async () => {
    const storage = new MemoryStorage()
    const previous = new RuntimeDiagnosticsTrace('2.0.11', 1_000)
    previous.record('ui_model', {
      measurementState: 'complete',
      riskState: 'normal'
    }, 1_100)
    await appendRuntimeDiagnosticSnapshot(
      storage,
      previous.snapshot('ui_assessable', 1_200)
    )

    const current = new RuntimeDiagnosticsTrace('2.0.11', 2_000)
    current.record('ui_unavailable', {
      source: 'process_unreadable',
      messageCount: 2
    }, 2_100)

    const serialized = serializeRuntimeDiagnostics({
      stored: await readRuntimeDiagnostics(storage),
      current: current.snapshot('manual_diagnostics_export', 2_200)
    })

    expect(serialized).toContain('"ui_assessable"')
    expect(serialized).toContain('"process_unreadable"')
    expect(serialized).toContain('"manual_diagnostics_export"')
  })
})
