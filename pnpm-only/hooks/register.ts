import type { Register } from 'claude-code'

import { replacementsOf } from './pnpm'
import type { Shell } from './shell'

const denialOf = (plugin: string, command: string, shell: Shell): string | null => {
  const replacements = replacementsOf(command, shell)

  if (replacements.length === 0) return null

  const lines = replacements.map(({ found, use }) => `  ${found}  ->  ${use}`)

  return [
    `${plugin}: npm and npx are not allowed here. Run the command again with pnpm:`,
    ...lines,
    'Check the pnpm command before you run it; some npm flags have another name in pnpm.',
  ].join('\n')
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const deny = denialOf($.plugin.name, e.command, 'bash')

    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'PowerShell' }, ($, e, next) => {
    const deny = denialOf($.plugin.name, e.command, 'powershell')

    return deny === null ? next(e) : { deny }
  })
}
