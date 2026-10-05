import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { COLORS } from '../hooks/colors'

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0)
const HOUR = 3_600_000

const bandOf = (bodyColumns: number) =>
  ({
    plugin: 'usage-line',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  }) as const

const LIMITS = [
  { kind: 'seven_day', percentUsed: 91.2, resetsAt: new Date(NOW + 76 * HOUR).toISOString() },
  { kind: 'five_hour', percentUsed: 78, resetsAt: new Date(NOW + 2 * HOUR + 600_000).toISOString() },
]

const measure = ($: Engine, rateLimits = LIMITS) =>
  $.session.measure({
    context: { window: 200_000, tokens: 76_000, percent: 38 },
    rateLimits,
    cost: { usd: 1.239 },
    changed: ['context', 'rateLimits', 'cost'],
  })

const lineOf = async ($: Engine, bodyColumns: number) => {
  const ui = await $.ui.mount({ ...bandOf(bodyColumns), surface: 'terminal' })
  const line = (await ui.findAll({ type: 'Text' })).map(text => text.text).join('')
  await ui.unmount()

  return line
}

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

test('shows the cost and a bar for each percent on every surface', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await measure($)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...bandOf(120), surface })
    const texts = await ui.findAll({ type: 'Text' })

    expect(texts.map(text => text.text).join('')).toBe(
      '$1.24 · ━━━─────── 38% · ━━━━━━━─── 78% 2h 10m · ━━━━━━━━━─ 91% 3d 4h',
    )
    expect((await ui.find({ type: 'Text', text: '38%' }))?.props.color).toBe(COLORS.low)
    expect((await ui.find({ type: 'Text', text: '78%' }))?.props.color).toBe(COLORS.high)
    expect((await ui.find({ type: 'Text', text: '91%' }))?.props.color).toBe(COLORS.full)
    expect((await ui.find({ type: 'Text', text: '━━━━━━━━━' }))?.props.color).toBe(COLORS.full)
    expect((await ui.find({ type: 'Text', text: '$1.24' }))?.props.color).toBe(COLORS.cost)
    await ui.unmount()
  }
})

test('shows the user, model and effort, and only the part of the email before the @', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { CLAUDE_CONFIG_DIR: '/config' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5-20260101' }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('fs.read', (_$, e) => {
    // The engine hands the path on in the machine's own spelling.
    expect(e.path).toMatch(/config[\\/]\.claude\.json$/)

    return { value: JSON.stringify({ oauthAccount: { emailAddress: 'sam.lee@example.com' } }) }
  })

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  const line = await lineOf($, 120)

  expect(line).toBe('sam.lee · opus-5-5 · high · $0.00')
  expect(line).not.toContain('example.com')
})

test('gets shorter in steps when the terminal is narrow', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await measure($)

  expect(await lineOf($, 60)).toBe('$1.24 · ━──── 38% · ━━━── 78% 2h 10m · ━━━━─ 91% 3d 4h')
  expect(await lineOf($, 50)).toBe('$1.24 · ━──── 38% · ━━━── 78% · ━━━━─ 91%')
  expect(await lineOf($, 30)).toBe('$1.24 · 38% · 78% · 91%')
})

test('shows 0% for a window that has reset since the last reading', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await measure($)
  await clock.advance(3 * HOUR)
  await measure($)

  const line = await lineOf($, 120)

  expect(line).toContain('────────── 0% · ')
  expect(line).toContain('91% 3d 1h')
})

test('shows only cost and context when the account has no limit windows', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await measure($, [])

  expect(await lineOf($, 120)).toBe('$1.24 · ━━━─────── 38%')
})
