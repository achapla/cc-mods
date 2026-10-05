import type { EngineInterface, Register } from 'claude-code'

import { killOf } from './detect'

export const BLOCK = 'Block'
export const ALLOW = 'Allow once'

const MAX_SHOWN = 300

// Asks the person; anything but a clear "Allow once" keeps the command from running.
const refusalOf = async ($: EngineInterface, what: string): Promise<string | null> => {
  const shown = what.length > MAX_SHOWN ? `${what.slice(0, MAX_SHOWN)}...` : what
  let answer: string

  try {
    answer = await $.ui.ask(`This would stop a running process. Allow it?\n\n${shown}`, {
      options: [BLOCK, ALLOW],
      header: 'Stop process',
    })
  } catch {
    // Nobody answered: the dialog was dismissed, or nobody is there to ask.
    answer = BLOCK
  }

  if (answer === ALLOW) return null

  const said = answer === BLOCK ? '' : ` The user answered: "${answer}".`

  return (
    `${$.plugin.name}: the user did not allow this, because it stops a running process: ${shown}.` +
    `${said} Do not try another way to stop the process. Ask the user what to do next.`
  )
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const kill = killOf(e.command, 'bash')
    const deny = kill === null ? null : await refusalOf($, kill)

    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const kill = killOf(e.command, 'powershell')
    const deny = kill === null ? null : await refusalOf($, kill)

    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const deny = await refusalOf($, `TaskStop ${e.task_id ?? e.shell_id ?? ''}`.trim())

    return deny === null ? next(e) : { deny }
  })
}
