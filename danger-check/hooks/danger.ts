import { commandsOf, nameOf } from './shell'
import type { Shell } from './shell'

export type Danger = {
  /** The dangerous command, as its words. */
  command: string
  /** Why it is dangerous, as the end of the sentence "it ...". */
  why: string
  /** A read-only command that lists what would be lost, when there is one. */
  preview?: { title: string; argv: string[] }
}

type Finding = Omit<Danger, 'command'>

// Folders that tools build again, so deleting them loses no work.
const REBUILT = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.vite',
  '.parcel-cache',
  '__pycache__',
  '.pytest_cache',
])

const REMOVERS = new Set(['rm', 'remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir'])

const SYSTEM: Record<string, string> = {
  dd: 'writes raw data to a disk or file',
  format: 'erases a disk',
  diskpart: 'changes disk partitions',
  'format-volume': 'erases a disk',
  'clear-disk': 'erases a disk',
  'initialize-disk': 'erases a disk',
  'remove-partition': 'deletes a disk partition',
  shutdown: 'shuts down or restarts the computer',
  reboot: 'restarts the computer',
  halt: 'shuts down the computer',
  poweroff: 'shuts down the computer',
  'restart-computer': 'restarts the computer',
  'stop-computer': 'shuts down the computer',
}

// git's own options that take a value as the next word, written before the subcommand.
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

const UNCOMMITTED = { title: 'Uncommitted changes now', argv: ['git', 'status', '--short'] }

const has = (args: string[], ...options: string[]): boolean =>
  args.some(arg => options.some(option => arg === option || arg.startsWith(`${option}=`)))

// A cluster of short options such as '-rf' that holds one of `letters`.
const hasShort = (args: string[], letters: string): boolean =>
  args.some(arg => /^-[a-zA-Z]+$/.test(arg) && [...letters].some(letter => arg.includes(letter)))

const positionalsOf = (args: string[]): string[] =>
  args.filter(arg => !arg.startsWith('-') && !/^\/[a-zA-Z?]$/.test(arg))

const isRecursive = (name: string, arg: string): boolean =>
  arg === '--recursive' ||
  /^\/s$/i.test(arg) ||
  /^-r(e|ec|ecu|ecur|ecurs|ecurse)?$/i.test(arg) ||
  (name === 'rm' && /^-[a-zA-Z]{1,4}$/.test(arg) && /r/i.test(arg))

const isRebuilt = (target: string): boolean =>
  REBUILT.has(
    // PowerShell separates several targets with commas.
    target.replace(/,$/, '').replace(/^["']|["']$/g, '').replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? '',
  )

const removalOf = (name: string, args: string[]): Finding | null => {
  if (!args.some(arg => isRecursive(name, arg))) return null

  const targets = positionalsOf(args)

  if (targets.length > 0 && targets.every(isRebuilt)) return null

  return { why: 'deletes folders and everything inside them' }
}

const findOf = (args: string[]): Finding | null => {
  const runsRm = args.some(
    (arg, index) => /^-exec(dir)?$/.test(arg) && nameOf(args[index + 1] ?? '') === 'rm',
  )

  return has(args, '-delete') || runsRm ? { why: 'deletes every file it finds' } : null
}

const gitOf = (words: string[]): Finding | null => {
  let all = words.slice(1)

  while ((all[0] ?? '').startsWith('-')) {
    all = all.slice(GIT_VALUE_OPTIONS.has(all[0] ?? '') ? 2 : 1)
  }

  const [verb = '', ...args] = all

  switch (verb) {
    case 'reset':
      return has(args, '--hard')
        ? { why: 'discards all uncommitted changes', preview: UNCOMMITTED }
        : null
    case 'clean':
      return (has(args, '--force') || hasShort(args, 'f')) && !has(args, '--dry-run') && !hasShort(args, 'n')
        ? {
            why: 'deletes files that git does not track',
            preview: { title: 'Files it would delete', argv: ['git', 'clean', '-n', ...args] },
          }
        : null
    case 'push':
      if (has(args, '--force', '--force-with-lease', '--force-if-includes', '--mirror') || hasShort(args, 'f')) {
        return { why: 'overwrites history on the remote' }
      }

      return has(args, '--delete') || hasShort(args, 'd') || positionalsOf(args).some(arg => /^[+:]/.test(arg))
        ? { why: 'deletes or overwrites a branch on the remote' }
        : null
    case 'checkout':
      return has(args, '--force') || hasShort(args, 'f') || args.includes('.') || args.includes('--')
        ? { why: 'discards uncommitted changes in files', preview: UNCOMMITTED }
        : null
    case 'restore':
      return !has(args, '--staged') && !hasShort(args, 'S') || has(args, '--worktree') || hasShort(args, 'W')
        ? { why: 'discards uncommitted changes in files', preview: UNCOMMITTED }
        : null
    case 'branch':
      return hasShort(args, 'D') || (has(args, '--delete') && has(args, '--force'))
        ? { why: 'deletes a branch, also when it is not merged' }
        : null
    case 'stash':
      return args[0] === 'drop' || args[0] === 'clear'
        ? {
            why: 'deletes stashed changes',
            preview: { title: 'Stashes now', argv: ['git', 'stash', 'list'] },
          }
        : null
    case 'filter-branch':
    case 'filter-repo':
      return { why: 'rewrites the history of the repository' }
    default:
      return null
  }
}

const dockerOf = (name: string, args: string[]): Finding | null => {
  if (args.includes('prune') && (args.includes('system') || args.includes('volume'))) {
    return { why: 'deletes unused Docker data' }
  }

  if (args[0] === 'volume' && args[1] === 'rm') return { why: 'deletes a Docker volume and its data' }

  const isCompose = name === 'docker-compose' || args.includes('compose')

  return isCompose && args.includes('down') && (has(args, '--volumes') || hasShort(args, 'v'))
    ? { why: 'deletes the Docker volumes of the project and their data' }
    : null
}

const findingOf = (words: string[]): Finding | null => {
  const name = nameOf(words[0] ?? '')
  const args = words.slice(1)

  if (REMOVERS.has(name)) return removalOf(name, args)
  if (name === 'find') return findOf(args)
  if (name === 'git') return gitOf(words)
  if (name === 'docker' || name === 'docker-compose') return dockerOf(name, args)
  if (name.startsWith('mkfs')) return { why: 'erases a disk' }

  const why = SYSTEM[name]

  return why === undefined ? null : { why }
}

// A command that moves to another folder: a preview run from here would then show the wrong place.
const MOVERS = new Set(['cd', 'pushd', 'popd', 'set-location', 'sl', 'chdir', 'push-location'])

/**
 * Every command in `command` that can destroy work; empty when none can.
 */
export const dangersOf = (command: string, shell: Shell): Danger[] => {
  const commands = commandsOf(command, shell)
  const isElsewhere = commands.some(
    words => MOVERS.has(nameOf(words[0] ?? '')) || (nameOf(words[0] ?? '') === 'git' && words.includes('-C')),
  )

  return commands.flatMap(words => {
    const finding = findingOf(words)

    if (finding === null) return []

    const { preview, ...rest } = finding

    return [{ command: words.join(' '), ...rest, ...(preview && !isElsewhere ? { preview } : {}) }]
  })
}
