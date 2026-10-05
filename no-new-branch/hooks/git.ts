import { commandsOf, nameOf } from './shell'
import type { Shell } from './shell'

// git's own options that take a value as the next word, written before the subcommand.
const GLOBAL_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

// `git branch` options that list, delete, rename or describe: none makes a new branch.
const BRANCH_OTHER_WORK =
  /^(-d|-D|--delete|-m|-M|--move|-l|--list|-a|--all|-r|--remotes|-v|-vv|--verbose|--show-current|--contains|--no-contains|--merged|--no-merged|--points-at|--edit-description|-u|--set-upstream-to|--unset-upstream|--format|--sort|--column)(=|$)/

const hasOption = (args: string[], ...options: string[]): boolean =>
  args.some(arg => options.some(option => arg === option || arg.startsWith(`${option}=`)))

const positionalsOf = (args: string[]): string[] => args.filter(arg => !arg.startsWith('-'))

// The subcommand and its arguments, with git's own leading options removed.
const subcommandOf = (words: string[]): string[] => {
  let args = words.slice(1)

  while ((args[0] ?? '').startsWith('-')) {
    args = args.slice(GLOBAL_VALUE_OPTIONS.has(args[0] ?? '') ? 2 : 1)
  }

  return args
}

const createsBranch = (words: string[]): boolean => {
  const [verb = '', ...args] = subcommandOf(words)

  switch (verb) {
    case 'checkout':
      return hasOption(args, '-b', '-B', '--orphan', '-t', '--track')
    case 'switch':
      return hasOption(args, '-c', '-C', '--create', '--force-create', '--orphan', '-t', '--track')
    case 'branch':
      if (hasOption(args, '-c', '-C', '--copy')) return true
      if (args.some(arg => BRANCH_OTHER_WORK.test(arg))) return false

      return positionalsOf(args).length > 0
    case 'worktree': {
      if (args[0] !== 'add') return false
      if (hasOption(args, '-b', '-B', '--orphan')) return true
      if (hasOption(args, '-d', '--detach')) return false

      // With only a path, git makes a new branch named after it.
      return positionalsOf(args.slice(1)).length < 2
    }
    case 'stash':
      return args[0] === 'branch'
    default:
      return false
  }
}

/**
 * The git command in `command` that would create a new branch, or null when none would.
 */
export const branchCreationOf = (command: string, shell: Shell): string | null => {
  const found = commandsOf(command, shell).find(
    words => nameOf(words[0] ?? '') === 'git' && createsBranch(words),
  )

  return found === undefined ? null : found.join(' ')
}
