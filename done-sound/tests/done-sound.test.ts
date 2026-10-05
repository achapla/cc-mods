import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { MIN_TURN_MS } from '../hooks/register'

// Stands for the engine on a Windows machine: records each command that would play a sound.
const world = (on: On, variables: Record<string, string> = { SystemRoot: 'C:\\Windows' }) => {
  const clock = mock.clock(on)
  const played: string[] = []

  mock.env(on, variables)
  on('process.run', (_$, e) => {
    played.push(e.argv.join(' '))

    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => ({
    result: { questions: e.questions, answers: {} },
  }))
  on('classic.Notification', () => ({}))

  return { clock, played }
}

const turn = (durationMs: number, more: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'Done.',
  durationMs,
  isAborted: more.isAborted ?? false,
  turnId: 't1',
  reason: more.isAborted ? ('aborted' as const) : ('answer' as const),
  ...(more.agentId === undefined ? {} : { agentId: more.agentId }),
})

test('plays the done sound when a long turn ends', async ($, on) => {
  const { clock, played } = world(on)

  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)

  expect(played).toHaveLength(1)
  expect(played[0]).toContain('powershell.exe')
  expect(played[0]).toContain("'C:\\Windows\\Media\\chimes.wav'")
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

  await $.tool.call({
    tool: 'AskUserQuestion',
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
  await clock.advance(10)

  expect(played).toHaveLength(1)
  expect(played[0]).toContain("'C:\\Windows\\Media\\notify.wav'")
})

test('plays the ask sound for a permission prompt, but not for other notifications', async ($, on) => {
  const { clock, played } = world(on)

  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
  await $.classic.Notification({ message: 'Claude is waiting', notification_type: 'idle_prompt' })
  await clock.advance(10)

  expect(played).toHaveLength(1)
  expect(played[0]).toContain('notify.wav')
})

test('uses the macOS player when the machine is not Windows', async ($, on) => {
  const { clock, played } = world(on, {})

  await $.turn.complete(turn(MIN_TURN_MS))
  await clock.advance(10)

  expect(played).toEqual(['afplay /System/Library/Sounds/Glass.aiff'])
})
