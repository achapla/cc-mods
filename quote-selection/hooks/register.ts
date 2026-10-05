import type { Register } from 'claude-code'

const NOTHING_SELECTED = [
  'Nothing is selected.',
  'Select some text in the conversation with the mouse, then run /quote again.',
  'This works only in the fullscreen layout of the terminal.',
].join('\n')

/**
 * `text` as a quote: '> ' before each line, with the empty lines around it removed.
 */
export const quoteOf = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*\n|\s+$/g, '')
    .split('\n')
    .map(line => `> ${line.trimEnd()}`.trimEnd())
    .join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quote',
      description: 'Put the text you selected with the mouse into the prompt as a quote',
    })

    return next(e)
  })

  on('command.run', { command: 'quote' }, async $ => {
    const selected = await $.ui.selection()

    if (selected === undefined || selected.text.trim() === '') {
      return { text: NOTHING_SELECTED }
    }

    const { isFilled } = await $.prompt.fill({ text: `${quoteOf(selected.text)}\n\n`, mode: 'insert' })

    return {
      text: isFilled
        ? 'The quote is in your prompt. Type your comment under it.'
        : 'The prompt box could not take the quote.',
    }
  })
}
