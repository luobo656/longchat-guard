export const RUNTIME_DIAGNOSTICS_KEY =
  'longChatGuardRuntimeDiagnostics'

const MAX_TRACE_EVENTS = 48
const MAX_STORED_SNAPSHOTS = 4

export type RuntimeDiagnosticValue =
  | string
  | number
  | boolean
  | null
  | string[]

export interface RuntimeDiagnosticEvent {
  at: number
  ageMs: number
  event: string
  data: Record<string, RuntimeDiagnosticValue>
}

export interface RuntimeDiagnosticSnapshot {
  schemaVersion: 1
  buildVersion: string
  instanceStartedAt: number
  recordedAt: number
  reason: string
  events: RuntimeDiagnosticEvent[]
}

export interface StoredRuntimeDiagnostics {
  schemaVersion: 1
  updatedAt: number
  snapshots: RuntimeDiagnosticSnapshot[]
}

export interface RuntimeDiagnosticStorage {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export class RuntimeDiagnosticsTrace {
  private readonly events: RuntimeDiagnosticEvent[] = []
  private lastSignature = ''

  constructor(
    private readonly buildVersion: string,
    private readonly instanceStartedAt = Date.now()
  ) {}

  record(
    event: string,
    data: Record<string, RuntimeDiagnosticValue> = {},
    at = Date.now()
  ): void {
    const normalized = sortDiagnosticData(data)
    const signature = JSON.stringify([event, normalized])
    if (signature === this.lastSignature) return
    this.lastSignature = signature
    this.events.push({
      at,
      ageMs: Math.max(0, at - this.instanceStartedAt),
      event,
      data: normalized
    })
    if (this.events.length > MAX_TRACE_EVENTS) {
      this.events.splice(0, this.events.length - MAX_TRACE_EVENTS)
    }
  }

  snapshot(
    reason: string,
    recordedAt = Date.now()
  ): RuntimeDiagnosticSnapshot {
    return {
      schemaVersion: 1,
      buildVersion: this.buildVersion,
      instanceStartedAt: this.instanceStartedAt,
      recordedAt,
      reason,
      events: this.events.map((event) => ({
        ...event,
        data: { ...event.data }
      }))
    }
  }
}

export async function appendRuntimeDiagnosticSnapshot(
  storage: RuntimeDiagnosticStorage,
  snapshot: RuntimeDiagnosticSnapshot
): Promise<void> {
  const stored = await readRuntimeDiagnostics(storage)
  const snapshots = [
    ...(stored?.snapshots ?? []),
    snapshot
  ].slice(-MAX_STORED_SNAPSHOTS)
  await storage.set({
    [RUNTIME_DIAGNOSTICS_KEY]: {
      schemaVersion: 1,
      updatedAt: snapshot.recordedAt,
      snapshots
    } satisfies StoredRuntimeDiagnostics
  })
}

export async function readRuntimeDiagnostics(
  storage: RuntimeDiagnosticStorage
): Promise<StoredRuntimeDiagnostics | undefined> {
  const raw = await storage.get(RUNTIME_DIAGNOSTICS_KEY)
  const value = raw[RUNTIME_DIAGNOSTICS_KEY]
  if (!isStoredRuntimeDiagnostics(value)) return undefined
  return value
}

export function serializeRuntimeDiagnostics(input: {
  stored?: StoredRuntimeDiagnostics | undefined
  current: RuntimeDiagnosticSnapshot
}): string {
  const snapshots = [
    ...(input.stored?.snapshots ?? []),
    input.current
  ].slice(-MAX_STORED_SNAPSHOTS)
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: input.current.recordedAt,
      snapshots
    },
    null,
    2
  )
}

function sortDiagnosticData(
  data: Record<string, RuntimeDiagnosticValue>
): Record<string, RuntimeDiagnosticValue> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

function isStoredRuntimeDiagnostics(
  value: unknown
): value is StoredRuntimeDiagnostics {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredRuntimeDiagnostics>
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.updatedAt === 'number' &&
    Array.isArray(candidate.snapshots)
  )
}
