// Every sound of the mod is a file in the sounds folder: sounds/<name>.wav.
// To add a sound, put its .wav file in that folder. The mod reads the folder each time it needs the names.
// A name is in small letters, and a file with a space or a comma in its name is left out: /sounds cannot name it.
export const libraryOf = (files: readonly string[]): string[] =>
  files
    .map(file => /^([^\s,]+)\.wav$/i.exec(file)?.[1]?.toLowerCase())
    .filter((name): name is string => name !== undefined)
    .sort()

export type Moment = 'ask' | 'done'
export type Choices = Record<Moment, string[]>

export const MOMENTS: Moment[] = ['ask', 'done']

// The sounds of each moment until the person chooses others. One of the list plays, picked by chance.
export const STARTERS: Choices = {
  ask: ['faaah', 'error'],
  done: ['khatam', 'scooby', 'matrix-phone', 'pikachu', 'dun-dun-dun'],
}

const isMoment = (word: string | undefined): word is Moment => word === 'ask' || word === 'done'

// The saved choices; a moment whose saved list is not a list of names keeps its starting sounds.
// A name with no file in the sounds folder is left out.
export const choicesOf = (saved: unknown, library: readonly string[]): Choices => {
  const held = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>) : {}
  const listOf = (moment: Moment): string[] => {
    const list = held[moment]
    const names: unknown[] = Array.isArray(list) ? list : STARTERS[moment]

    return names.filter((name): name is string => typeof name === 'string' && library.includes(name))
  }

  return { ask: listOf('ask'), done: listOf('done') }
}

// One of the names by chance; not the one that played last, when there is another.
// `chance` is a number from 0 up to, but not including, 1.
export const pick = (names: string[], last: string | undefined, chance: number): string | undefined => {
  const others = names.length > 1 ? names.filter(name => name !== last) : names

  return others[Math.min(others.length - 1, Math.floor(chance * others.length))]
}

export type Request =
  | { action: 'list' }
  | { action: 'set'; moment: Moment; names: string[] }
  | { action: 'play'; name: string }
  | { action: 'reset' }
  | { action: 'help'; problem: string }

// What the text after /sounds asks for.
export const requestOf = (args: string, library: readonly string[]): Request => {
  const isSound = (name: string): boolean => library.includes(name)
  const [first, ...rest] = args.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)

  if (first === undefined) return { action: 'list' }
  if (first === 'reset') return { action: 'reset' }

  const unknown = rest.filter(name => !isSound(name))

  if (first === 'play') {
    const name = rest[0]

    if (name === undefined || rest.length > 1) return { action: 'help', problem: 'Give one sound name to play.' }
    if (!isSound(name)) return { action: 'help', problem: `There is no sound named "${name}".` }

    return { action: 'play', name }
  }

  if (isMoment(first)) {
    if (rest.length === 0) {
      return { action: 'help', problem: `Give the sound names for "${first}", or "none" for no sound.` }
    }

    if (rest.length === 1 && rest[0] === 'none') return { action: 'set', moment: first, names: [] }

    if (unknown.length > 0) {
      return { action: 'help', problem: `There is no sound named "${unknown.join('", "')}".` }
    }

    return { action: 'set', moment: first, names: [...new Set(rest)] }
  }

  return { action: 'help', problem: `"${first}" is not something /sounds can do.` }
}
