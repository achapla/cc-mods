import type { EngineInterface, Register } from 'claude-code'

import { MOMENTS, choicesOf, libraryOf, pick, requestOf } from './sounds'
import type { Choices, Moment } from './sounds'

// A turn shorter than this ends without a sound: you are still looking at the screen.
export const MIN_TURN_MS = 10_000

// The store key of the sounds the person chose with /sounds.
const KEY = 'sounds'

const USAGE = [
  'How to use it:',
  '  /sounds                      show the sounds of each moment',
  '  /sounds ask <names>          set the sounds for a question or a permission prompt',
  '  /sounds done <names>         set the sounds for the end of a long turn',
  '  /sounds ask none             play no sound for that moment (also for done)',
  '  /sounds play <name>          play one sound now',
  '  /sounds reset                go back to the starting sounds',
  '',
  'With more than one name, one of them plays each time, picked by chance.',
].join('\n')

// The notifications that mean Claude Code waits for an answer.
const WAITING = new Set(['permission_prompt', 'elicitation_dialog'])

// The names of the sound files in the sounds folder now, so a file put there is a sound at once.
const library = async ($: EngineInterface): Promise<string[]> => {
  try {
    const entries = await $.fs.list(`${$.plugin.root}/sounds`)

    return libraryOf(entries.filter(entry => entry.kind === 'file').map(entry => entry.name))
  } catch {
    // No sounds folder: there is no sound to play.
    return []
  }
}

const load = async ($: EngineInterface, sounds: readonly string[]): Promise<Choices> =>
  choicesOf(await $.store.get(KEY), sounds)

const namesOf = (names: readonly string[]): string => (names.length === 0 ? 'no sound' : names.join(', '))

const listOf = (choices: Choices, sounds: readonly string[]): string =>
  [
    // Claude Code writes the mod's name before the first line, so the moments start on the next line to stay in a column.
    'The sounds of each moment:',
    ...MOMENTS.map(moment => `${moment.padEnd(5)}${namesOf(choices[moment])}`),
    '',
    `All sounds: ${namesOf(sounds)}`,
    '',
    USAGE,
  ].join('\n')

// The command that plays the sound on this machine. `$.audio.play` plays nothing in a Windows terminal.
const playerOf = async ($: EngineInterface, name: string): Promise<string[]> => {
  if ((await $.env.get('SystemRoot')) === undefined) {
    return ['afplay', `${$.plugin.root}/sounds/${name}.wav`]
  }

  const file = `${$.plugin.root}\\sounds\\${name}.wav`

  return [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    // A single quote in the path is written twice inside a PowerShell string.
    `(New-Object System.Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`,
  ]
}

// Starts the sound and returns at once, so the hook does not wait for the sound to end.
const play = ($: EngineInterface, name: string): void => {
  $.clock.after(1, () => {
    void (async () => {
      try {
        await $.process.run(await playerOf($, name), { timeoutMs: 10_000 })
      } catch {
        // No player on this machine: stay silent.
      }
    })()
  })
}

// The sound each moment played last, so the same one does not play twice in a row.
type Last = Partial<Record<Moment, string>>

const playFor = async ($: EngineInterface, moment: Moment, last: Last): Promise<void> => {
  const name = pick((await load($, await library($)))[moment], last[moment], Math.random())

  if (name === undefined) return

  last[moment] = name
  play($, name)
}

export const register: Register = on => {
  // When each running main turn began, by its id.
  const startedAt = new Map<string, number>()
  const last: Last = {}
  let openQuestions = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sounds',
      description: 'Choose the sounds for a question and for the end of a long turn',
      argumentHint: '[ask <names> | done <names> | play <name> | reset]',
    })

    return next(e)
  })

  on('command.run', { command: 'sounds' }, async ($, e) => {
    const sounds = await library($)
    const request = requestOf(e.args, sounds)

    switch (request.action) {
      case 'list':
        return { text: listOf(await load($, sounds), sounds) }
      case 'set': {
        await $.store.set(KEY, { ...(await load($, sounds)), [request.moment]: request.names })

        return { text: `The "${request.moment}" moment now plays: ${namesOf(request.names)}.` }
      }
      case 'play':
        play($, request.name)

        return { text: `Playing ${request.name}.` }
      case 'reset':
        await $.store.delete(KEY)

        return { text: `The sounds are the starting ones again.\n\n${listOf(choicesOf(null, sounds), sounds)}` }
      case 'help':
        return { text: `${request.problem}\n\n${listOf(await load($, sounds), sounds)}` }
    }
  })

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    startedAt.set(started.turnId, await $.clock.now())

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const began = startedAt.get(e.turnId)
    startedAt.delete(e.turnId)

    // `durationMs` leaves out the time a dialog waited for an answer, so the mod also measures itself.
    const elapsedMs = began === undefined ? 0 : (await $.clock.now()) - began

    if (e.agentId === undefined && !e.isAborted && Math.max(e.durationMs, elapsedMs) >= MIN_TURN_MS) {
      await playFor($, 'done', last)
    }

    return next(e)
  })

  // Claude asks a question, or another mod asks one through the same dialog.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await playFor($, 'ask', last)
    openQuestions += 1

    try {
      return await next(e)
    } finally {
      openQuestions -= 1
    }
  })

  on('classic.Notification', async ($, e, next) => {
    // While a question dialog is open, the notification is about that dialog, which had its sound.
    if (WAITING.has(e.notification_type) && openQuestions === 0) {
      await playFor($, 'ask', last)
    }

    return next(e)
  })
}
