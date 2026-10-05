export type Snippets = Record<string, string>

// The mark typed before a snippet's name: ';plan'.
export const MARK = ';'

// The snippets a new install starts with.
export const STARTERS: Snippets = {
  plan: 'Explore first. Then share your thoughts and your plan. Do not write or change any file until I say go.',
  step: 'Work one step at a time. After each step, stop, tell me the result, and wait for me.',
  test: 'Run the tests and show me the real result. If a test fails, say so and show the output.',
  why: 'Explain why you chose this. Use simple English and short sentences.',
}

const NAME = /^[a-z0-9][a-z0-9_-]*$/

// A mark and a name at the start of the text or after a space, so 'a;b' in code is left alone.
const USE = /(^|\s);([A-Za-z0-9][A-Za-z0-9_-]*)/g

/**
 * `text` with every known `;name` replaced by its snippet, and the names that were replaced.
 */
export const expand = (text: string, snippets: Snippets): { text: string; used: string[] } => {
  const used: string[] = []

  const expanded = text.replace(USE, (whole, before: string, typed: string) => {
    const name = typed.toLowerCase()
    const snippet = snippets[name]

    if (snippet === undefined) return whole
    if (!used.includes(name)) used.push(name)

    return `${before}${snippet}`
  })

  return { text: expanded, used }
}

export type Request =
  | { action: 'list' }
  | { action: 'add'; name: string; text: string }
  | { action: 'remove'; name: string }
  | { action: 'reset' }
  | { action: 'help'; problem: string }

const nameOf = (word: string): string => word.replace(/^;/, '').toLowerCase()

/**
 * What the text typed after `/snippets` asks for.
 */
export const requestOf = (args: string): Request => {
  const [verb = '', word = '', ...rest] = args.trim().split(/\s+/)
  const name = nameOf(word)

  switch (verb.toLowerCase()) {
    case '':
    case 'list':
      return { action: 'list' }
    case 'reset':
      return { action: 'reset' }
    case 'add':
    case 'set': {
      // The text after the name, as typed, with its own spaces and line breaks.
      const text = args.trim().replace(/^\S+\s+\S+\s*/, '')

      if (!NAME.test(name)) {
        return { action: 'help', problem: 'A name has only letters, digits, "-" and "_".' }
      }
      if (rest.length === 0) return { action: 'help', problem: 'Write the text after the name.' }

      return { action: 'add', name, text }
    }
    case 'remove':
    case 'delete':
    case 'rm':
      return NAME.test(name)
        ? { action: 'remove', name }
        : { action: 'help', problem: 'Write the name of the snippet to remove.' }
    default:
      return { action: 'help', problem: `"${verb}" is not something /snippets can do.` }
  }
}
