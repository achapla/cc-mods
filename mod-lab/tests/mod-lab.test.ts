import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { summaryOf, textOf } from '../hooks/brief'
import { RULE_WORD } from '../hooks/demos'

const PANE = {
  plugin: 'mod-lab',
  component: 'Pane',
  requestId: 'mod-lab',
  props: {
    title: 'Mod lab',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const mountPane = ($: Engine) => $.ui.mount({ ...PANE, surface: 'terminal' })

const startTurn = ($: Engine, text: string) => $.turn.start({ text, turnId: 'turn-1' })

test('a summary holds the plain fields and leaves out the ids', () => {
  expect(summaryOf({ tool: 'Bash', tool_use_id: 'toolu_1', command: 'ls  -la\n' })).toBe(
    'tool=Bash command=ls -la',
  )
  expect(summaryOf({ door: 'prompt', uuid: 'abc', message: { type: 'user', content: [] } })).toBe(
    'door=prompt type=user',
  )
  expect(summaryOf({ agentId: 'a1', index: 2 })).toBe('(subagent) index=2')
})

test('long texts and long lists are cut in the data kept for an event', () => {
  const text = textOf({ text: 'x'.repeat(1000), list: Array.from({ length: 50 }, (_, n) => n) }, 4000)

  expect(text).toContain('(1000 characters)')
  expect(text).toContain('(50 items)')
  expect(text.length).toBeLessThan(1000)
})

test('the pane says so when no event was seen', async $ => {
  const ui = await mountPane($)

  expect(await ui.find({ type: 'Text', text: /No events yet/ })).toBeDefined()
  expect((await ui.find({ key: 'view:events' }))?.props.label).toBe('Events (0)')
  await ui.unmount()
})

test('an event is listed, and a press on it shows its data', async ($, on) => {
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))

  await startTurn($, 'hello lab')

  const ui = await mountPane($)
  const row = await ui.find({ key: 'entry:1' })

  expect(row?.props.label).toContain('turn.start text=hello lab')

  await ui.press({ key: 'entry:1' })

  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text).join('\n')

  expect(texts).toContain('"text": "hello lab"')
  expect(texts).toContain('result:')

  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'entry:1' })).toBeDefined()
  await ui.unmount()
})

test('an event passes through unchanged', async ($, on) => {
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))

  expect(await startTurn($, 'hello')).toEqual({ turnId: 'turn-1' })
})

test('Clear empties the list', async ($, on) => {
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))

  await startTurn($, 'one')

  const ui = await mountPane($)

  await ui.press({ key: 'clear' })

  expect(await ui.find({ key: 'entry:1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /No events yet/ })).toBeDefined()
  await ui.unmount()
})

test('a demo runs on a press and shows what it did', async ($, on) => {
  mock.store(on, {})

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.press({ key: 'view:demos' })
    await ui.press({ key: 'demo:store' })

    expect(await ui.find({ type: 'Text', text: /Count presses: This button was pressed \d+ times?/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a demo that fails says why and breaks nothing', async ($, on) => {
  on('fs.list', () => ({ deny: 'no files here' }))

  const ui = await mountPane($)

  await ui.press({ key: 'view:demos' })
  await ui.press({ key: 'demo:files' })

  expect(await ui.find({ type: 'Text', text: /List files failed: .*no files here/ })).toBeDefined()
  await ui.unmount()
})

test('the rule demo adds a section to the system prompt, and takes it out again', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))

  const compose = () =>
    $.prompt.compose({
      model: 'claude-opus-5-5',
      promptModel: 'claude-opus-5-5',
      surfaces: ['terminal'],
      tools: [],
      outputStyle: null,
      traits: [],
    })
  const idsOf = async () => (await compose()).sections.map(section => section.id)

  expect(await idsOf()).toEqual(['intro'])

  const ui = await mountPane($)

  await ui.press({ key: 'view:demos' })
  await ui.press({ key: 'demo:rule' })

  const composed = await compose()

  expect(composed.sections.map(section => section.id)).toEqual(['intro', 'mod-lab:rule'])
  expect(composed.sections.at(-1)?.text).toContain(RULE_WORD)
  expect(composed.sections.at(-1)?.scope).toBe('session')

  await ui.press({ key: 'demo:rule' })

  expect(await idsOf()).toEqual(['intro'])
  await ui.unmount()
})

test('/lab dump writes a file with the events, also when some parts cannot be read', async ($, on) => {
  const written: { path: string; text: string }[] = []
  on('fs.write', (_$, e) => {
    written.push({ path: e.path, text: e.text })

    return { value: undefined }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))

  await startTurn($, 'before the dump')

  const ran = await $.command.run({
    command: 'lab',
    args: 'dump',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  expect(written).toHaveLength(1)
  expect(written[0]?.path).toMatch(/\.mod-lab[\\/]dump-.*\.json$/)
  expect(ran.text).toContain('model: claude-opus-5-5')

  const snapshot = JSON.parse(written[0]?.text ?? '{}')

  expect(snapshot.session.model).toBe('claude-opus-5-5')
  expect(snapshot.events.map((entry: { event: string }) => entry.event)).toContain('turn.start')
  expect(snapshot.settingNames).toBeDefined()
})

test('/lab with a word it does not know lists what it takes', async $ => {
  const ran = await $.command.run({
    command: 'lab',
    args: 'what',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  expect(ran.text).toContain('/lab dump')
})
