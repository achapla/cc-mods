import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { quoteOf } from '../hooks/register'

test('writes "> " before each line and removes the empty lines around the text', () => {
  expect(quoteOf('one line')).toBe('> one line')
  expect(quoteOf('first\nsecond')).toBe('> first\n> second')
  expect(quoteOf('\n\n  first  \r\n\r\nthird\n\n')).toBe('>   first\n>\n> third')
})

// Stands for the engine: answers the selection and records what the prompt box was given.
const world = (on: On, selected: string | undefined, isFilled = true) => {
  const filled: string[] = []

  on('ui.selection', () => ({ value: selected === undefined ? undefined : { text: selected } }))
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)

    return { isFilled }
  })

  return filled
}

const run = async ($: Engine) =>
  (
    await $.command.run({
      command: 'quote',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 120 },
    })
  ).text ?? ''

test('puts the selected text into the prompt as a quote', async ($, on) => {
  const filled = world(on, 'The mod checks the text\nof a command.')

  expect(await run($)).toContain('The quote is in your prompt')
  expect(filled).toEqual(['> The mod checks the text\n> of a command.\n\n'])
})

test('says so when nothing is selected, and leaves the prompt alone', async ($, on) => {
  const filled = world(on, undefined)

  expect(await run($)).toContain('Nothing is selected')
  expect(filled).toHaveLength(0)
})

test('says so when the prompt box cannot take the quote', async ($, on) => {
  world(on, 'some text', false)

  expect(await run($)).toContain('could not take the quote')
})
