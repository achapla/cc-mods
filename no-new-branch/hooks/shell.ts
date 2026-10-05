export type Shell = 'bash' | 'powershell'

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
  'start',
  'start-process',
  'saps',
])

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

/**
 * The program a word names: 'C:\nodejs\npm.cmd' and '/usr/bin/npm' read as 'npm'.
 */
export const nameOf = (word: string): string =>
  (word.replace(/^["']|["']$/g, '').split(/[\\/]/).at(-1) ?? '')
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/, '')

// '-9', the Windows form '/b', and a bare number or duration such as '5' or '10s'.
const isOption = (word: string): boolean =>
  /^-/.test(word) || /^\/[A-Za-z?]+$/.test(word) || /^[\d.]+[smhd]?$/.test(word)

const isAssignment = (word: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)

// The words of one command, with leading 'VAR=x' and wrappers such as 'sudo' and 'xargs' removed.
const wordsOf = (segment: string): string[] => {
  let words = segment.trim().split(/\s+/).filter(Boolean)

  for (;;) {
    const first = nameOf(words[0] ?? '')

    if (isAssignment(words[0] ?? '')) {
      words = words.slice(1)
    } else if (first === 'command' && /^-[vV]$/.test(words[1] ?? '')) {
      // 'command -v npm' only asks where a program is.
      return words
    } else if (PREFIXES.has(first)) {
      words = words.slice(1)
      while (isOption(words[0] ?? '') || isAssignment(words[0] ?? '')) words = words.slice(1)
    } else {
      return words
    }
  }
}

/**
 * Every command a command line would run, each as its words: the commands
 * joined by `&&`, `;` and `|`, those inside `$(...)`, and those handed as
 * quoted text to a shell (`bash -c "..."`).
 */
export const commandsOf = (command: string, shell: Shell, depth = 0): string[][] => {
  if (depth > 4) return []

  const { segments, quoted } = partsOf(command, shell)
  const commands: string[][] = []

  for (const segment of segments) {
    const words = wordsOf(segment)

    if (words.length === 0) continue

    commands.push(words)

    if (INTERPRETERS.has(nameOf(words[0] ?? ''))) {
      for (const text of segment.match(/(["'])(?:(?!\1).)*\1/gs) ?? []) {
        commands.push(...commandsOf(text.slice(1, -1), shell, depth + 1))
      }
    }
  }

  // Double quotes still run `$(...)` and backtick commands written inside them.
  for (const { text, isDouble } of quoted) {
    if (isDouble && (text.includes('$(') || (shell === 'bash' && text.includes('`')))) {
      commands.push(...commandsOf(text, shell, depth + 1))
    }
  }

  return commands
}
