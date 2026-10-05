export type LabEntry = { id: number; at: number; event: string; summary: string }
export type LabView = 'events' | 'demos'
export type LabBlock = { name: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'mod-lab': {
      entries: LabEntry[]
      view: LabView
      selected: number | null
      result: string
      hasRule: boolean
      context: LabBlock[]
    }
  }
}
