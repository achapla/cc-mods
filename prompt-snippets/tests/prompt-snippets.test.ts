import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { STARTERS, expand, requestOf } from '../hooks/snippets'

const SNIPPETS = { plan: 'Share your plan first.', test: 'Run the tests.' }

test('replaces a known name and leaves the rest of the prompt alone', () => {
  expect(expand('fix the login bug ;plan', SNIPPETS)).toEqual({
    text: 'fix the login bug Share your plan first.',
    used: ['plan'],
  })
  expect(expand(';plan\nthen ;test and ;PLAN', SNIPPETS)).toEqual({
    text: 'Share your plan first.\nthen Run the tests. and Share your plan first.',
    used: ['plan', 'test'],
  })
})

test('leaves an unknown name, and a mark inside code, alone', () => {
  for (const text of ['hello ;nothing', 'const a = 1;plan = 2', 'for (;test;) {}', 'wait; plan it', 'no marks here']) {
    expect(expand(text, SNIPPETS), text).toEqual({ text, used: [] })
  }
})

test('reads what was typed after /snippets', () => {
  expect(requestOf('')).toEqual({ action: 'list' })
  expect(requestOf('list')).toEqual({ action: 'list' })
  expect(requestOf('add fix  Fix it.  Then run the tests.')).toEqual({
    action: 'add',
    name: 'fix',
    text: 'Fix it.  Then run the tests.',
  })
  expect(requestOf('add ;Fix Fix it.')).toEqual({ action: 'add', name: 'fix', text: 'Fix it.' })
  expect(requestOf('remove ;fix')).toEqual({ action: 'remove', name: 'fix' })
  expect(requestOf('reset')).toEqual({ action: 'reset' })
  expect(requestOf('add fix').action).toBe('help')
  expect(requestOf('add bad!name text').action).toBe('help')
  expect(requestOf('remove').action).toBe('help')
  expect(requestOf('dance').action).toBe('help')
})

// Stands for the engine: keeps the store in memory and records the prompts that entered.
const world = (on: On, saved?: Record<string, string>) => {
  const entered: string[] = []
  const toasts: string[] = []

  mock.store(on, saved === undefined ? {} : { snippets: saved })
  on('prompt.submit', (_$, e) => {
    entered.push(e.text)

    return { text: e.text }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  return { entered, toasts }
}

const submit = ($: Engine, text: string, kind: 'composer' | 'sdk' = 'composer') =>
  $.prompt.submit({ text, wait: false, origin: { kind } })

const run = async ($: Engine, args: string) =>
  (
    await $.command.run({
      command: 'snippets',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
  ).text ?? ''

test('expands a starting snippet in a typed prompt and says so', async ($, on) => {
  const { entered, toasts } = world(on)

  await submit($, 'add a dark mode ;plan')

  expect(entered).toEqual([`add a dark mode ${STARTERS.plan}`])
  expect(toasts).toEqual(['Expanded ;plan'])
})

test('leaves a prompt alone when it was not typed, or has no known name', async ($, on) => {
  const { entered, toasts } = world(on)

  await submit($, 'add a dark mode ;plan', 'sdk')
  await submit($, 'add a dark mode ;unknown')
  await submit($, '/snippets add x see ;plan')

  expect(entered).toEqual(['add a dark mode ;plan', 'add a dark mode ;unknown', '/snippets add x see ;plan'])
  expect(toasts).toHaveLength(0)
})

test('adds, lists, uses and removes a snippet', async ($, on) => {
  const { entered } = world(on)

  expect(await run($, 'add fix Fix it. Then run the tests.')).toContain('Saved ;fix')
  expect(await run($, '')).toContain(';fix\n  Fix it. Then run the tests.')
  expect(await run($, '')).toContain(';plan')

  await submit($, 'the build is broken ;fix')
  expect(entered).toEqual(['the build is broken Fix it. Then run the tests.'])

  expect(await run($, 'remove fix')).toBe('Removed ;fix.')
  expect(await run($, 'remove fix')).toBe('There is no snippet named ;fix.')
  expect(await run($, '')).not.toContain(';fix')
})

test('goes back to the starting snippets on reset', async ($, on) => {
  world(on, { only: 'The only one.' })

  expect(await run($, '')).not.toContain(';plan')
  expect(await run($, 'reset')).toContain(';plan')
  expect(await run($, '')).not.toContain(';only')
})
