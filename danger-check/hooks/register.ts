import type { EngineInterface, Register } from 'claude-code'

import { dangersOf } from './danger'
import type { Danger } from './danger'
import type { Shell } from './shell'

export const BLOCK = 'Block'
export const ALLOW = 'Allow once'

const MAX_SHOWN = 300
const MAX_LINES = 8

const cut = (text: string): string => (text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}...` : text)

// What would be lost, as lines: the output of the danger's read-only preview command.
const previewOf = async ($: EngineInterface, danger: Danger): Promise<string[]> => {
  if (danger.preview === undefined) return []

  try {
    const { exitCode, stdout } = await $.process.run(danger.preview.argv, { timeoutMs: 5000 })

    if (exitCode !== 0) return []

    const lines = stdout.split('\n').map(line => line.trimEnd()).filter(Boolean)
    const shown = lines.slice(0, MAX_LINES).map(line => `  ${cut(line)}`)
    const more = lines.length > MAX_LINES ? [`  ... and ${lines.length - MAX_LINES} more`] : []

    return [`${danger.preview.title}:`, ...(lines.length === 0 ? ['  (none)'] : shown), ...more]
  } catch {
    return []
  }
}

// Asks the person; anything but a clear "Allow once" keeps the command from running.
const refusalOf = async ($: EngineInterface, dangers: Danger[]): Promise<string | null> => {
  const blocks = await Promise.all(
    dangers.map(async danger =>
      [cut(danger.command), `It ${danger.why}.`, ...(await previewOf($, danger))].join('\n'),
    ),
  )
  let answer: string

  try {
    answer = await $.ui.ask(`This command can destroy work. Allow it?\n\n${blocks.join('\n\n')}`, {
      options: [BLOCK, ALLOW],
      header: 'Danger',
    })
  } catch {
    // Nobody answered: the dialog was dismissed, or nobody is there to ask.
    answer = BLOCK
  }

  if (answer === ALLOW) return null

  const reasons = dangers.map(danger => `"${cut(danger.command)}" ${danger.why}`).join('; ')
  const said = answer === BLOCK ? '' : ` The user answered: "${answer}".`

  return (
    `${$.plugin.name}: the user did not allow this, because ${reasons}.${said} ` +
    'Do not run another command that has the same effect. Ask the user what to do next.'
  )
}

const guard = async ($: EngineInterface, command: string, shell: Shell): Promise<string | null> => {
  const dangers = dangersOf(command, shell)

  return dangers.length === 0 ? null : refusalOf($, dangers)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const deny = await guard($, e.command, 'bash')

    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const deny = await guard($, e.command, 'powershell')

    return deny === null ? next(e) : { deny }
  })
}
