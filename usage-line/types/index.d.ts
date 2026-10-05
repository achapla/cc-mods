export type Limit = {
  kind: string
  percentUsed: number
  /** Milliseconds since the epoch, or null when the engine gave no reset time. */
  resetsAt: number | null
}

export type Snapshot = {
  costUsd: number | null
  contextPercent: number | null
  limits: Limit[]
}

export type Identity = {
  /** The part of the account's email address before the '@'. */
  user: string | null
  model: string | null
  effort: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-line': { latest: Snapshot | null; now: number; identity: Identity }
  }
}
