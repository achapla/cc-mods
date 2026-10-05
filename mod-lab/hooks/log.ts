import { textOf } from './brief'

export const MAX_ENTRIES = 200
const MAX_DETAIL = 4000

// The full data of each event, by its id. It is kept in the module only, so a
// reload of the mod loses it; the list itself is in $.state and stays.
const details = new Map<number, string>()

export const keep = (id: number, e: unknown): void => {
  details.set(id, `input:\n${textOf(e, MAX_DETAIL)}`)

  for (const key of details.keys()) {
    if (details.size <= MAX_ENTRIES) break
    details.delete(key)
  }
}

// Adds what the event answered to the data kept for it.
export const finish = (id: number, answer: unknown): void => {
  const held = details.get(id)

  if (held !== undefined) {
    details.set(id, `${held}\n\nresult:\n${textOf(answer, MAX_DETAIL)}`)
  }
}

export const detailOf = (id: number): string | undefined => details.get(id)

export const forget = (): void => details.clear()
