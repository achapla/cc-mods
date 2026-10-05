import type { EngineInterface, Register } from 'claude-code'

import { branchCreationOf } from './git'

export const BLOCK = 'Block'
export const ALLOW = 'Allow once'

const MAX_SHOWN = 300

// Asks the person; anything but a clear "Allow once" keeps the call from running.
const refusalOf = async ($: EngineInterface, what: string): Promise<string | null> => {
  const shown = what.length > MAX_SHOWN ? `${what.slice(0, MAX_SHOWN)}...` : what
  let answer: string

  try {
    answer = await $.ui.ask(`This would create a new git branch. Allow it?\n\n${shown}`, {
      options: [BLOCK, ALLOW],
      header: 'New branch',
    })
  } catch {
    // Nobody answered: the dialog was dismissed, or nobody is there to ask.
    answer = BLOCK
  }

  if (answer === ALLOW) return null

  const said = answer === BLOCK ? '' : ` The user answered: "${answer}".`

  return (
    `${$.plugin.name}: the user did not allow a new branch: ${shown}.${said} ` +
    'Stay on the current branch and continue the work there. If you think a branch is needed, ' +
    'say so in one line and let the user decide. Do not try another way to create one.'
  )
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const creation = branchCreationOf(e.command, 'bash')
    const deny = creation === null ? null : await refusalOf($, creation)

    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const creation = branchCreationOf(e.command, 'powershell')
    const deny = creation === null ? null : await refusalOf($, creation)

    return deny === null ? next(e) : { deny }
  })

  // With a `path` the tool only enters a worktree that exists already.
  on('tool.call', { tool: 'EnterWorktree' }, async ($, e, next) => {
    const deny =
      e.path === undefined ? await refusalOf($, `EnterWorktree ${e.name ?? ''}`.trim()) : null

    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const deny =
      e.isolation === 'worktree'
        ? await refusalOf($, `Agent "${e.description}" with its own worktree`)
        : null

    return deny === null ? next(e) : { deny }
  })
}
