import type { EngineInterface, Register } from 'claude-code'

import { MARK, STARTERS, expand, requestOf } from './snippets'
import type { Snippets } from './snippets'

const KEY = 'snippets'

// Tells the person which names were replaced.
const said = ($: EngineInterface, used: string[]): void => {
  $.ui.toast(`Expanded ${used.map(name => `${MARK}${name}`).join(', ')}`)
}

const USAGE = [
  'How to use it:',
  `  Type ${MARK}name in a prompt, and it is replaced when you send the prompt.`,
  '  /snippets                    show all snippets',
  '  /snippets add <name> <text>  save a snippet, or change one',
  '  /snippets remove <name>      delete a snippet',
  '  /snippets reset              go back to the starting snippets',
].join('\n')

// The saved snippets; the starting ones until the person saves a change.
const load = async ($: EngineInterface): Promise<Snippets> => {
  const saved = await $.store.get(KEY)

  return saved !== null && typeof saved === 'object' ? (saved as Snippets) : STARTERS
}

const listOf = (snippets: Snippets): string => {
  const names = Object.keys(snippets).sort()

  if (names.length === 0) return `No snippets are saved.\n\n${USAGE}`

  return [...names.map(name => `${MARK}${name}\n  ${snippets[name]}`), '', USAGE].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'snippets',
      description: 'Show, add or remove the short names that expand in your prompts',
      argumentHint: '[add <name> <text> | remove <name> | reset]',
    })

    return next(e)
  })

  on('command.run', { command: 'snippets' }, async ($, e) => {
    const request = requestOf(e.args)
    const snippets = await load($)

    switch (request.action) {
      case 'list':
        return { text: listOf(snippets) }
      case 'add':
        await $.store.set(KEY, { ...snippets, [request.name]: request.text })

        return { text: `Saved ${MARK}${request.name}\n  ${request.text}` }
      case 'remove': {
        if (snippets[request.name] === undefined) {
          return { text: `There is no snippet named ${MARK}${request.name}.` }
        }

        const { [request.name]: _removed, ...rest } = snippets
        await $.store.set(KEY, rest)

        return { text: `Removed ${MARK}${request.name}.` }
      }
      case 'reset':
        await $.store.delete(KEY)

        return { text: `The snippets are the starting ones again.\n\n${listOf(STARTERS)}` }
      case 'help':
        return { text: `${request.problem}\n\n${USAGE}` }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    // Only what the person typed; a slash command is expanded in 'command.run' below.
    if (e.origin.kind !== 'composer' || e.text.trimStart().startsWith('/')) {
      return next(e)
    }

    const { text, used } = expand(e.text, await load($))

    if (used.length === 0) return next(e)

    said($, used)

    return next({ ...e, text })
  })

  // A slash command or a skill reads the text after its name from 'args', not from the prompt.
  on('command.run', async ($, e, next) => {
    // /snippets reads its own text as typed, so 'add x see ;plan' saves the name, not its text.
    if (e.origin.kind !== 'composer' || e.command === 'snippets') return next(e)

    const { text, used } = expand(e.args, await load($))

    if (used.length === 0) return next(e)

    said($, used)

    return next({ ...e, args: text })
  })
}
