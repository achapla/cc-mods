import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { MIN_TURN_MS } from '../hooks/register'
import { STARTERS, choicesOf, libraryOf, pick, requestOf } from '../hooks/sounds'

const WINDOWS = { SystemRoot: 'C:\\Windows' }
// The names of the sound files that the sounds folder of a test holds.
const LIBRARY = ['siren', 'faaah', 'error', 'khatam', 'matrix-phone', 'scooby', 'pikachu', 'dun-dun-dun']
// One sound for each moment, so a test knows which file plays.
const ONE_EACH = { ask: ['siren'], done: ['khatam'] }

const question = () => ({
  tool: 'AskUserQuestion' as const,
  questions: [
    {
      question: 'Which one?',
      header: 'Choice',
      options: [
        { label: 'A', description: 'The first one' },
        { label: 'B', description: 'The second one' },
      ],
      multiSelect: false,
    },
  ],
})

// Stands for the engine: keeps the store in memory and records each command that would play a sound.
// `files` are the names of the sound files in the sounds folder; a test can change the list while it runs.
const world = (
  on: On,
  {
    variables = WINDOWS,
    sounds = ONE_EACH,
    files = LIBRARY.map(name => `${name}.wav`),
  }: { variables?: Record<string, string>; sounds?: unknown; files?: string[] } = {},
) => {
  const clock = mock.clock(on)
  const played: string[] = []

  mock.env(on, variables)
  mock.store(on, sounds === null ? {} : { sounds })
  on('fs.list', () => ({
    value: files.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false })),
  }))
  on('process.run', (_$, e) => {
    played.push(e.argv.join(' '))

    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}))

  return { clock, played, files }
}

const answerQuestions = (on: On) =>
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => ({
    result: { questions: e.questions, answers: {} },
  }))

const turn = (durationMs: number, more: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'Done.',
  durationMs,
  isAborted: more.isAborted ?? false,
  turnId: 't1',
  reason: more.isAborted ? ('aborted' as const) : ('answer' as const),
  ...(more.agentId === undefined ? {} : { agentId: more.agentId }),
})

const run = async ($: Engine, args: string) =>
  (
    await $.command.run({
      command: 'sounds',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
  ).text ?? ''

// The name of the sound file in a recorded player command.
const soundOf = (command: string | undefined): string => /([\w-]+)\.wav/.exec(command ?? '')?.[1] ?? ''

test('takes the sound names from the file names', () => {
  expect(libraryOf(['wolf.wav', 'Siren.WAV', 'notes.txt', 'two words.wav', 'a,b.wav'])).toEqual(['siren', 'wolf'])
})

test('picks by chance, and not the sound that played last', () => {
  expect(pick([], undefined, 0.5)).toBeUndefined()
  expect(pick(['a'], 'a', 0.5)).toBe('a')
  expect(pick(['a', 'b'], 'a', 0)).toBe('b')
  expect(pick(['a', 'b', 'c'], undefined, 0)).toBe('a')
  expect(pick(['a', 'b', 'c'], undefined, 0.99)).toBe('c')
  expect(pick(['a', 'b', 'c'], 'c', 0.99)).toBe('b')
})

test('reads the saved choices and leaves out names that are not sounds', () => {
  expect(choicesOf(null, LIBRARY)).toEqual(STARTERS)
  expect(choicesOf({ ask: ['siren', 'nope', 7] }, LIBRARY)).toEqual({ ask: ['siren'], done: STARTERS.done })
  expect(choicesOf({ ask: [], done: ['scooby'] }, LIBRARY)).toEqual({ ask: [], done: ['scooby'] })
  // A starting sound whose file is gone is left out too.
  expect(choicesOf(null, ['faaah', 'khatam'])).toEqual({ ask: ['faaah'], done: ['khatam'] })
})

test('understands the text after /sounds', () => {
  const ask = (args: string) => requestOf(args, LIBRARY)

  expect(ask('')).toEqual({ action: 'list' })
  expect(ask('ask Faaah, error faaah')).toEqual({ action: 'set', moment: 'ask', names: ['faaah', 'error'] })
  expect(ask('done none')).toEqual({ action: 'set', moment: 'done', names: [] })
  expect(ask('play siren')).toEqual({ action: 'play', name: 'siren' })
  expect(ask('reset')).toEqual({ action: 'reset' })
  expect(ask('ask').action).toBe('help')
  expect(ask('ask bark').action).toBe('help')
  expect(ask('play').action).toBe('help')
  expect(ask('dance').action).toBe('help')
})

test('a file put in the sounds folder is a sound at once', async ($, on) => {
  const { clock, played, files } = world(on)

  expect(await run($, 'play wolf')).toContain('There is no sound named "wolf".')

  files.push('wolf.wav')

  expect(await run($, '')).toContain('wolf')
  expect(await run($, 'done wolf')).toContain('wolf')

  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)

  expect(played.map(soundOf)).toEqual(['wolf'])
})

test('plays the done sound when a long turn ends', async ($, on) => {
  const { clock, played } = world(on)

  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)

  expect(played).toHaveLength(1)
  expect(played[0]).toContain('powershell.exe')
  expect(played[0]).toContain("\\sounds\\khatam.wav'")
})

test('stays silent for a short turn, a stopped turn and a subagent turn', async ($, on) => {
  const { clock, played } = world(on)

  await $.turn.complete(turn(MIN_TURN_MS - 1))
  await $.turn.complete(turn(60_000, { isAborted: true }))
  await $.turn.complete(turn(60_000, { agentId: 'a1' }))
  await clock.advance(10)

  expect(played).toHaveLength(0)
})

test('plays the ask sound when a question dialog opens', async ($, on) => {
  const { clock, played } = world(on)
  answerQuestions(on)

  await $.tool.call(question())
  await clock.advance(10)

  expect(played).toHaveLength(1)
  expect(played[0]).toContain("\\sounds\\siren.wav'")
})

test('plays the ask sound for a permission prompt, but not for other notifications', async ($, on) => {
  const { clock, played } = world(on)

  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
  await $.classic.Notification({ message: 'Claude is waiting', notification_type: 'idle_prompt' })
  await clock.advance(10)

  expect(played.map(soundOf)).toEqual(['siren'])
})

test('counts the time a dialog waited, which the reported duration leaves out', async ($, on) => {
  const { clock, played } = world(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(20_000)
  await $.turn.complete(turn(6000))
  await clock.advance(10)

  expect(played.map(soundOf)).toEqual(['khatam'])
})

test('plays one sound, not two, when a notification comes while a question is open', async ($, on) => {
  const { clock, played } = world(on)
  // The dialog stays open while the engine raises its "waiting for input" notification.
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    await $.classic.Notification({ message: 'Claude is waiting', notification_type: 'elicitation_dialog' })

    return { result: { questions: e.questions, answers: {} } }
  })

  await $.tool.call(question())
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
  await clock.advance(10)

  expect(played).toHaveLength(2)
})

test('uses the macOS player when the machine is not Windows', async ($, on) => {
  const { clock, played } = world(on, { variables: {} })

  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)

  expect(played).toHaveLength(1)
  expect(played[0]).toMatch(/^afplay .*\/sounds\/khatam\.wav$/)
})

test('with nothing saved, plays one of the starting sounds and never the same one twice in a row', async ($, on) => {
  const { clock, played } = world(on, { sounds: null })

  for (let count = 0; count < 12; count += 1) {
    await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
    await clock.advance(10)
  }

  const names = played.map(soundOf)

  expect(names).toHaveLength(12)

  for (const [index, name] of names.entries()) {
    expect(STARTERS.ask).toContain(name)
    expect(name).not.toBe(names[index - 1])
  }
})

test('/sounds sets, silences, plays and resets', async ($, on) => {
  const { clock, played } = world(on)

  expect(await run($, '')).toContain('ask  siren')
  expect(await run($, 'done scooby')).toContain('scooby')

  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)
  expect(played.map(soundOf)).toEqual(['scooby'])

  expect(await run($, 'done none')).toContain('no sound')
  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)
  expect(played).toHaveLength(1)

  expect(await run($, 'play pikachu')).toBe('Playing pikachu.')
  await clock.advance(10)
  expect(played.map(soundOf)).toEqual(['scooby', 'pikachu'])

  expect(await run($, 'ask bark')).toContain('There is no sound named "bark".')
  expect(await run($, 'reset')).toContain(`ask  ${STARTERS.ask.join(', ')}`)
})
