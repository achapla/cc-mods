const MAX_TEXT = 400
const MAX_ITEMS = 20
const MAX_DEPTH = 6
const MAX_SUMMARY = 120
const MAX_VALUE = 48

// Ids are long and say little in a one-line summary.
const ID_KEY = /(^uuid$|id$|_id$)/i

// A copy of the value that is cheap to keep: long texts and long lists are cut.
export const briefOf = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') {
    return value.length > MAX_TEXT
      ? `${value.slice(0, MAX_TEXT)}… (${value.length} characters)`
      : value
  }

  if (typeof value === 'function' || typeof value === 'bigint') return String(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '…'

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map(item => briefOf(item, depth + 1))

    return value.length > MAX_ITEMS ? [...items, `… (${value.length} items)`] : items
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, briefOf(item, depth + 1)]),
  )
}

export const textOf = (value: unknown, limit: number): string => {
  const text = JSON.stringify(briefOf(value), null, 2) ?? 'undefined'

  return text.length > limit ? `${text.slice(0, limit)}\n… (cut)` : text
}

const shortOf = (value: string | number | boolean): string => {
  const text = String(value).replace(/\s+/g, ' ').trim()

  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text
}

// One line for the list: the event's own plain fields, such as tool=Bash command=ls.
export const summaryOf = (e: unknown): string => {
  if (e === null || typeof e !== 'object') return shortOf(String(e))

  const parts: string[] = []

  for (const [key, value] of Object.entries(e)) {
    if (key === 'agentId') {
      parts.unshift('(subagent)')
    } else if (ID_KEY.test(key)) {
      continue
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (value !== '') parts.push(`${key}=${shortOf(value)}`)
    } else if (key === 'message' && value !== null && typeof value === 'object' && 'type' in value) {
      parts.push(`type=${shortOf(String(value.type))}`)
    }
  }

  return parts.join(' ').slice(0, MAX_SUMMARY)
}
