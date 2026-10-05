import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Identity, Snapshot, Style } from '../types'
import { COLORS } from './colors'
import { DEFAULT_STYLE, NAMES, STYLES, styleOf } from './styles'

const NO_IDENTITY: Identity = { user: null, model: null, effort: null }

const latest = atom({ plugin: 'usage-line', key: 'latest' } as const, null)
const now = atom({ plugin: 'usage-line', key: 'now' } as const, 0)
const identity = atom({ plugin: 'usage-line', key: 'identity' } as const, NO_IDENTITY)
const style = atom({ plugin: 'usage-line', key: 'style' } as const, DEFAULT_STYLE)

// The store key of the style the person chose with /usage-style.
const STYLE_KEY = 'style'

const ORDER = ['five_hour', 'seven_day', 'spend_limit']
const SEPARATOR = ' · '
const MINUTE = 60_000

const EMAIL = /([^\s@<>"']+)@[^\s@<>"']+/

// From widest to narrowest; the line takes the first that fits.
const LAYOUTS = [
  { cells: 10, hasResets: true },
  { cells: 5, hasResets: true },
  { cells: 5, hasResets: false },
  { cells: 0, hasResets: false },
] as const

type Layout = (typeof LAYOUTS)[number]
type Piece = { text: string; color?: string; isBold?: boolean }
type Gauge = { percent: number; reset?: string }
type Figures = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

const snapshotOf = (figures: Figures): Snapshot => ({
  costUsd: figures.cost?.usd ?? null,
  contextPercent: figures.context.percent ?? null,
  limits: figures.rateLimits.map(limit => ({
    kind: limit.kind,
    percentUsed: limit.percentUsed,
    resetsAt: limit.resetsAt === undefined ? null : Date.parse(limit.resetsAt),
  })),
})

const rankOf = (kind: string): number => {
  const rank = ORDER.indexOf(kind)

  return rank === -1 ? ORDER.length : rank
}

const colorOf = (percent: number): string => {
  if (percent >= 90) return COLORS.full
  if (percent >= 75) return COLORS.high

  return COLORS.low
}

const durationOf = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`

  return `${minutes}m`
}

// 'claude-opus-5-5-20260101' reads as 'opus-5-5'.
const modelNameOf = (model: string): string =>
  model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

// The context window first, then each limit window in ORDER.
const gaugesOf = (snapshot: Snapshot, nowMs: number): Gauge[] => {
  const gauges: Gauge[] = []

  if (snapshot.contextPercent !== null) {
    gauges.push({ percent: snapshot.contextPercent })
  }

  const limits = [...snapshot.limits].sort((a, b) => rankOf(a.kind) - rankOf(b.kind))

  for (const limit of limits) {
    if (limit.resetsAt === null || Number.isNaN(limit.resetsAt)) {
      gauges.push({ percent: limit.percentUsed })
    } else if (limit.resetsAt <= nowMs) {
      // The window has reset since the last reading, so the old percent is no longer true.
      gauges.push({ percent: 0 })
    } else {
      gauges.push({ percent: limit.percentUsed, reset: durationOf(limit.resetsAt - nowMs) })
    }
  }

  return gauges
}

const gaugePiecesOf = (gauge: Gauge, layout: Layout, bar: Style): Piece[] => {
  const percent = Math.round(gauge.percent)
  const color = colorOf(percent)
  // Rounded down, so a bar is full only at 100%.
  const filled = Math.min(layout.cells, Math.max(0, Math.floor((percent / 100) * layout.cells)))
  const pieces: Piece[] = []

  if (filled > 0) pieces.push({ text: STYLES[bar].filled.repeat(filled), color })
  if (filled < layout.cells) pieces.push({ text: STYLES[bar].empty.repeat(layout.cells - filled) })

  pieces.push({ text: `${layout.cells > 0 ? ' ' : ''}${percent}%`, color, isBold: true })

  if (layout.hasResets && gauge.reset !== undefined) pieces.push({ text: ` ${gauge.reset}` })

  return pieces
}

// The line as groups of pieces, in a fixed order: user, model, effort, cost, then the gauges.
const groupsOf = (
  who: Identity,
  snapshot: Snapshot,
  nowMs: number,
  layout: Layout,
  bar: Style,
): Piece[][] => {
  const groups: Piece[][] = []

  if (who.user) groups.push([{ text: who.user, color: COLORS.user }])
  if (who.model) groups.push([{ text: modelNameOf(who.model), color: COLORS.model }])
  if (who.effort) groups.push([{ text: who.effort, color: COLORS.effort }])

  if (snapshot.costUsd !== null) {
    groups.push([{ text: `$${snapshot.costUsd.toFixed(2)}`, color: COLORS.cost, isBold: true }])
  }

  for (const gauge of gaugesOf(snapshot, nowMs)) {
    groups.push(gaugePiecesOf(gauge, layout, bar))
  }

  return groups
}

const piecesOf = (groups: Piece[][]): Piece[] =>
  groups.flatMap((group, index) => (index > 0 ? [{ text: SEPARATOR }, ...group] : group))

const widthOf = (pieces: Piece[]): number =>
  pieces.reduce((width, piece) => width + piece.text.length, 0)

const change = async ($: EngineInterface, changes: Partial<Identity>): Promise<void> => {
  const current = await read($, identity)
  const keys = Object.keys(changes) as (keyof Identity)[]

  if (keys.some(key => changes[key] !== current[key])) {
    await update($, identity, held => ({ ...NO_IDENTITY, ...held, ...changes }))
  }
}

// The account's email is in Claude Code's own config file; only the part before '@' is kept.
const userOf = async ($: EngineInterface): Promise<string | null> => {
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const folder = configDir ?? home

  if (folder === undefined) return null

  try {
    const config = JSON.parse(await $.fs.read(`${folder}/.claude.json`))
    const email: unknown = config?.oauthAccount?.emailAddress

    return typeof email === 'string' ? (EMAIL.exec(email)?.[1] ?? null) : null
  } catch {
    return null
  }
}

const identify = async ($: EngineInterface): Promise<void> => {
  const settings = await $.settings.read()
  const effort = settings.effortLevel
  const user = await userOf($)

  await change($, {
    model: await $.session.model(),
    ...(typeof effort === 'string' ? { effort } : {}),
    ...(user === null ? {} : { user }),
  })
}

const record = async ($: EngineInterface, figures: Figures): Promise<void> => {
  const time = await $.clock.now()
  await update($, now, () => time)
  await update($, latest, () => snapshotOf(figures))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await record($, await $.session.usage())
    await identify($)

    const saved = styleOf(await $.store.get(STYLE_KEY))
    if (saved !== null) await update($, style, () => saved)

    await $.command.register({
      name: 'usage-style',
      description: 'Choose how the bars of the usage line are drawn',
      argumentHint: `[${NAMES.join(' | ')}]`,
    })

    // Keeps the reset times current while no turn runs.
    $.clock.every(MINUTE, async () => {
      const time = await $.clock.now()
      await update($, now, () => time)
    })

    return result
  })

  on('command.run', { command: 'usage-style' }, async ($, e) => {
    const current = await read($, style)
    const wanted = e.args.trim().toLowerCase()
    const chosen = styleOf(wanted)

    if (chosen === null) {
      const list = NAMES.map(name => {
        const { filled, empty } = STYLES[name]

        return `  ${name.padEnd(6)}${filled.repeat(4)}${empty.repeat(6)}${name === current ? '  (in use)' : ''}`
      })
      const problem = wanted === '' ? [] : [`There is no style named "${wanted}".`, '']

      return { text: [...problem, 'The bar styles:', ...list, '', 'Type /usage-style <name> to change it.'].join('\n') }
    }

    await $.store.set(STYLE_KEY, chosen)
    await update($, style, () => chosen)

    return { text: `The bars now use the "${chosen}" style.` }
  })

  on('session.measure', async ($, e, next) => {
    await record($, e)

    return next(e)
  })

  // Each main-thread model request names the model and effort really in use.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await change($, { model: e.model, effort: e.effort === undefined ? null : String(e.effort) })
    }

    return yield* next(e)
  })

  // The first message's context names the account's email, when the config file did not.
  on('prompt.context', async ($, e, next) => {
    const text = e.blocks.find(block => block.name === 'userEmail')?.text
    const user = text === undefined ? undefined : EMAIL.exec(text)?.[1]

    if (user !== undefined) {
      await change($, { user })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snapshot = await read($, latest)

    if (e.props.hasSurvey || snapshot === null) {
      return next(e)
    }

    const who = await read($, identity)
    const nowMs = await read($, now)
    const bar = await read($, style)
    const lines = LAYOUTS.map(layout => piecesOf(groupsOf(who, snapshot, nowMs, layout, bar)))
    const pieces = lines.find(line => widthOf(line) <= e.props.bodyColumns) ?? lines.at(-1) ?? []

    if (pieces.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    // A piece with no color of its own (a separator, a bar's empty part, a reset time) is dim.
    return (
      <Box>
        {pieces.map(piece => (
          <Text
            wrap="truncate"
            {...(piece.color ? { color: piece.color } : { dimColor: true })}
            {...(piece.isBold ? { bold: true } : {})}
          >
            {piece.text}
          </Text>
        ))}
      </Box>
    )
  })
}
