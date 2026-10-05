import { commandsOf, nameOf } from './shell'
import type { Shell } from './shell'

// npm subcommands whose pnpm name is different.
const VERBS: Record<string, string> = {
  i: 'install',
  isntall: 'install',
  uninstall: 'remove',
  un: 'remove',
  rm: 'remove',
  r: 'remove',
  up: 'update',
  upgrade: 'update',
  'run-script': 'run',
  t: 'test',
  tst: 'test',
  x: 'exec',
  ls: 'list',
  info: 'view',
  show: 'view',
  v: 'view',
}

// The pnpm command that does the work of one npm or npx command.
const pnpmOf = (words: string[]): string => {
  const args = words.slice(1)

  if (nameOf(words[0] ?? '') === 'npx') {
    return ['pnpm', 'dlx', ...args].join(' ')
  }

  const at = args.findIndex(arg => !arg.startsWith('-'))
  const given = at === -1 ? '' : (args[at] ?? '')
  const rest = at === -1 ? args : args.toSpliced(at, 1)
  const verb = VERBS[given] ?? given
  const hasPackages = rest.some(arg => !arg.startsWith('-'))

  if (verb === 'ci') return ['pnpm', 'install', '--frozen-lockfile', ...rest].join(' ')
  // pnpm adds a named package with 'add'; 'install' alone installs what package.json lists.
  if (verb === 'install' && hasPackages) return ['pnpm', 'add', ...rest].join(' ')

  return ['pnpm', verb, ...rest].filter(Boolean).join(' ')
}

/**
 * For each npm or npx command in `command`, the pnpm command to use instead;
 * empty when the command line runs neither.
 */
export const replacementsOf = (command: string, shell: Shell): { found: string; use: string }[] =>
  commandsOf(command, shell)
    .filter(words => ['npm', 'npx'].includes(nameOf(words[0] ?? '')))
    .map(words => ({ found: words.join(' '), use: pnpmOf(words) }))
