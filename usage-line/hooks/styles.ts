import type { Style } from '../types'

// The characters of a bar in each style: the used part, then the free part.
export const STYLES: Record<Style, { filled: string; empty: string }> = {
  small: { filled: '■', empty: '□' },
  block: { filled: '█', empty: '░' },
  thin: { filled: '━', empty: '─' },
}

export const DEFAULT_STYLE: Style = 'small'

export const NAMES = Object.keys(STYLES) as Style[]

export const styleOf = (value: unknown): Style | null =>
  NAMES.find(name => name === value) ?? null
