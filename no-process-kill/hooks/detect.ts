export type Shell = 'bash' | 'powershell'

// Commands whose only purpose is to stop a process.
const KILLERS = new Set([
  'kill',
  'pkill',
  'killall',
  'taskkill',
  'tskill',
  'fkill',
  'kill-port',
  'stop-process',
  'spps',
])

// Commands that run the command written after them.
const PREFIXES = new Set([
  'sudo',
  'doas',
  'xargs',
  'nohup',
  'env',
  'command',
  'exec',
  'time',
  'timeout',
  'nice',
  'npx',
  'pnpx',
  'bunx',
  'start',
  'start-process',
  'saps',
])

const RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'bun'])
const RUNNER_VERBS = new Set(['dlx', 'exec', 'x'])

// Commands that run a command given to them as quoted text.
const INTERPRETERS = new Set([
  'bash',
  'sh',
  'zsh',
  'dash',
  'wsl',
  'cmd',
  'powershell',
  'pwsh',
  'eval',
  'iex',
  'invoke-expression',
])

type Parts = { segments: string[]; quoted: { text: string; isDouble: boolean }[] }

// Cuts a command line where one command ends and the next begins, outside quotes.
const partsOf = (command: string, shell: Shell): Parts => {
  const separators = shell === 'bash' ? ';|&\n(){}`' : ';|&\n(){}'
  const escape = shell === 'bash' ? '\\' : '`'
  const parts: Parts = { segments: [], quoted: [] }
  let segment = ''
  let quote = ''
  let quotedText = ''

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? ''

    if (quote !== '') {
      if (char === quote) {
        parts.quoted.push({ text: quotedText, isDouble: quote === '"' })
        quote = ''
      } else {
        quotedText += char
      }
      segment += char
    } else if (char === escape) {
      segment += command[index + 1] ?? ''
      index += 1
    } else if (char === '"' || char === "'") {
      quote = char
      quotedText = ''
      segment += char
    } else if (separators.includes(char)) {
      parts.segments.push(segment)
      segment = ''
    } else {
      segment += char
    }
  }

  parts.segments.push(segment)

  return parts
}

// 'C:\Windows\System32\taskkill.exe' and '/usr/bin/kill' read as 'taskkill' and 'kill'.
const nameOf = (word: string): string =>
  (word.replace(/^["']|["']$/g, '').split(/[\\/]/).at(-1) ?? '').toLowerCase().replace(/\.exe$/, '')

// '-9', the Windows form '/b', and a bare number or duration such as '5' or '10s'.
const isOption = (word: string): boolean =>
  /^-/.test(word) || /^\/[A-Za-z?]+$/.test(word) || /^[\d.]+[smhd]?$/.test(word)
const isAssignment = (word: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)

// The words of one command, with leading 'VAR=x' and wrappers such as 'sudo' and 'xargs' removed.
const wordsOf = (segment: string): string[] => {
  let words = segment.trim().split(/\s+/).filter(Boolean)

  for (;;) {
    const first = nameOf(words[0] ?? '')
    const second = nameOf(words[1] ?? '')

    if (isAssignment(words[0] ?? '')) {
      words = words.slice(1)
    } else if (RUNNERS.has(first) && RUNNER_VERBS.has(second)) {
      words = words.slice(2)
    } else if (PREFIXES.has(first)) {
      words = words.slice(1)
      while (isOption(words[0] ?? '') || isAssignment(words[0] ?? '')) words = words.slice(1)
    } else {
      return words
    }
  }
}

const isKill = (words: string[]): boolean => {
  const name = nameOf(words[0] ?? '')
  const rest = words.slice(1).join(' ').toLowerCase()

  if (name === 'kill') {
    // 'kill -0' only tests that a process exists, and 'kill -l' only lists signal names.
    return !/^-(0|l|L)\b/.test(words[1] ?? '')
  }

  if (name === 'wmic') {
    return /\bprocess\b/.test(rest) && /\b(delete|terminate)\b/.test(rest)
  }

  return KILLERS.has(name)
}

/**
 * The part of `command` that would stop a process, or null when no part would.
 */
export const killOf = (command: string, shell: Shell, depth = 0): string | null => {
  if (depth > 4) return null

  const { segments, quoted } = partsOf(command, shell)

  for (const segment of segments) {
    const words = wordsOf(segment)

    if (isKill(words)) return words.join(' ')

    // A wrapper may take values of its own first ('sudo -u root kill 1'), so look further.
    const raw = segment.trim().split(/\s+/)

    if (PREFIXES.has(nameOf(raw[0] ?? '')) && raw.slice(1).some(word => KILLERS.has(nameOf(word)))) {
      return raw.join(' ')
    }

    // A .NET method call such as `$process.Kill()`.
    if (shell === 'powershell' && /\.Kill\s*$/i.test(segment)) return `${segment.trim()}()`

    if (INTERPRETERS.has(nameOf(words[0] ?? ''))) {
      for (const text of segment.match(/(["'])(?:(?!\1).)*\1/gs) ?? []) {
        const inner = killOf(text.slice(1, -1), shell, depth + 1)
        if (inner !== null) return inner
      }
    }
  }

  // Double quotes still run `$(...)` and backtick commands written inside them.
  for (const { text, isDouble } of quoted) {
    if (isDouble && (text.includes('$(') || (shell === 'bash' && text.includes('`')))) {
      const inner = killOf(text, shell, depth + 1)
      if (inner !== null) return inner
    }
  }

  return null
}
