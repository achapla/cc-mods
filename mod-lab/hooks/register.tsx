import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, UiPressArgument } from 'claude-code'

import type { LabEntry, LabView } from '../types'
import { summaryOf } from './brief'
import { DEMOS, FACTS_PROMPT, RULE_TEXT, RULE_WORD } from './demos'
import type { Demo } from './demos'
import { MAX_ENTRIES, detailOf, finish, forget, keep } from './log'

// The events seen so far, oldest first.
const entries = atom({ plugin: 'mod-lab', key: 'entries' } as const, [])
const view = atom({ plugin: 'mod-lab', key: 'view' } as const, 'events')
// The id of the event whose full data the pane shows, or null for the list.
const selected = atom({ plugin: 'mod-lab', key: 'selected' } as const, null)
// What the last demo or dump said.
const result = atom({ plugin: 'mod-lab', key: 'result' } as const, '')
// Whether the demo rule is added to the system prompt.
const hasRule = atom({ plugin: 'mod-lab', key: 'hasRule' } as const, false)
// The context blocks of the conversation's first message, kept for the dump.
const context = atom({ plugin: 'mod-lab', key: 'context' } as const, [])

const PANE = 'mod-lab'
const TITLE = 'Mod lab'
const COMMAND = 'lab'
const MAX_ROWS = 100

// The store key of the number of presses, kept between sessions.
const PRESSES = 'presses'

const DUMP_FOLDER = '.mod-lab'
const MAX_MESSAGES = 30
const MAX_MESSAGE_TEXT = 2000

const RULE = { id: 'mod-lab:rule', text: RULE_TEXT, scope: 'session' } as const

const HELP = [
  '/lab          open the pane',
  '/lab dump     write what a mod can read to a file in .mod-lab/',
  '/lab clear    empty the list of events',
  '/lab close    close the pane',
].join('\n')

type Failed = { error: string }

// The name Claude calls the tool by; the engine answers it when the tool is registered.
let factsTool = 'mcp__mod-lab__lab_facts'

const timeOf = (at: number): string => new Date(at).toTimeString().slice(0, 8)

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isFailed = (value: unknown): value is Failed =>
  value !== null && typeof value === 'object' && 'error' in value

const countOf = (value: unknown): string => (Array.isArray(value) ? String(value.length) : '?')

const textBlock = (text: string) => ({ type: 'text' as const, text })

// One part that cannot be read must not stop the whole dump.
const attempt = async <T,>(get: () => Promise<T>): Promise<T | Failed> => {
  try {
    return await get()
  } catch (error) {
    return { error: messageOf(error) }
  }
}

const rowOf = (entry: LabEntry, columns: number): string =>
  `${timeOf(entry.at)} ${entry.event} ${entry.summary}`.slice(0, Math.max(20, columns - 1))

// Records one event and answers its id. It never throws: a failure here must
// not break the event that is being watched.
const note = async ($: EngineInterface, event: string, e: unknown): Promise<number> => {
  try {
    const at = Date.now()
    const summary = summaryOf(e)
    const list = await update($, entries, held =>
      [...held, { id: (held.at(-1)?.id ?? 0) + 1, at, event, summary }].slice(-MAX_ENTRIES),
    )
    const id = list.at(-1)?.id ?? 0

    keep(id, e)

    return id
  } catch {
    return 0
  }
}

const clear = async ($: EngineInterface): Promise<void> => {
  forget()
  await update($, selected, () => null)
  await update($, entries, () => [])
}

const say = async ($: EngineInterface, text: string): Promise<void> => {
  await update($, result, () => text)
}

const show = async ($: EngineInterface, wanted: LabView): Promise<void> => {
  await update($, selected, () => null)
  await update($, view, () => wanted)
}

// Everything a mod can read about the session at this moment. Settings can
// hold secrets (env values), so only their names are kept.
const snapshotOf = async ($: EngineInterface) => {
  const list = await read($, entries)
  const messages = await attempt(async () => {
    const rows = await $.session.messages()

    if (!Array.isArray(rows)) return { count: 0, last: [] }

    return {
      count: rows.length,
      last: rows.slice(-MAX_MESSAGES).map(row => ({
        role: row.role,
        text: row.text.slice(0, MAX_MESSAGE_TEXT),
        toolUses: row.toolUses.map(use => use.tool),
      })),
    }
  })

  return {
    takenAt: new Date().toISOString(),
    plugin: { name: $.plugin.name, root: $.plugin.root },
    session: {
      id: await attempt(() => $.session.id()),
      cwd: await attempt(() => $.session.cwd()),
      root: await attempt(() => $.session.root()),
      model: await attempt(() => $.session.model()),
      turns: await attempt(() => $.session.turns()),
      repo: await attempt(() => $.session.repo()),
      surfaces: await attempt(() => $.session.surfaces()),
      version: await attempt(() => $.session.version()),
      usage: await attempt(() => $.session.usage()),
    },
    settingNames: await attempt(async () => Object.keys(await $.settings.read())),
    tools: await attempt(() => $.tool.list()),
    commands: await attempt(() => $.command.list()),
    agents: await attempt(() => $.agent.list()),
    config: await attempt(() => $.config.list()),
    panes: await attempt(() => $.ui.panes()),
    storeKeys: await attempt(() => $.store.keys()),
    promptBox: await attempt(() => $.prompt.read()),
    systemPrompt: await attempt(async () => (await $.prompt.compose()).sections),
    firstMessageContext: await read($, context),
    messages,
    events: list.map(entry => ({ ...entry, detail: detailOf(entry.id) ?? null })),
  }
}

// Writes the snapshot to a file under the working directory and answers a
// short report of what it holds.
const dump = async ($: EngineInterface): Promise<string> => {
  const snapshot = await snapshotOf($)
  const text = JSON.stringify(snapshot, null, 2)
  const path = `${DUMP_FOLDER}/dump-${snapshot.takenAt.replace(/[:.]/g, '-')}.json`

  await $.fs.write(path, text)

  const { session, systemPrompt, messages } = snapshot
  const prompt = isFailed(systemPrompt)
    ? '?'
    : `${systemPrompt.length} sections, ${systemPrompt.reduce((sum, section) => sum + section.text.length, 0)} characters`

  return [
    `Wrote ${path} (${Math.ceil(text.length / 1024)} KB).`,
    `model: ${isFailed(session.model) ? '?' : session.model} · turns: ${isFailed(session.turns) ? '?' : session.turns}`,
    `tools: ${countOf(snapshot.tools)} · commands: ${countOf(snapshot.commands)} · agents: ${countOf(snapshot.agents)}`,
    `system prompt: ${prompt}`,
    `first message context: ${snapshot.firstMessageContext.map(block => block.name).join(', ') || 'not seen yet'}`,
    `messages: ${isFailed(messages) ? '?' : messages.count} · events: ${snapshot.events.length}`,
  ].join('\n')
}

const runDump = async ($: EngineInterface): Promise<string> => {
  try {
    const report = await dump($)
    await say($, report)

    return report
  } catch (error) {
    const problem = `The dump failed: ${messageOf(error)}`
    await say($, problem)

    return problem
  }
}

// The code of each demo: one small use of `$`, answering what it did.
const demoResultOf = async (
  $: EngineInterface,
  key: Demo['key'],
  press: UiPressArgument,
): Promise<string> => {
  switch (key) {
    case 'toast': {
      $.ui.toast('Hello from mod-lab')

      return 'A toast is on screen for about 4 seconds.'
    }

    case 'status': {
      $.ui.status('mod-lab: this is a status line')
      $.clock.after(8000, () => $.ui.status(undefined))

      return 'A status line is under the prompt. It goes away after 8 seconds.'
    }

    case 'log': {
      $.ui.log('mod-lab: this line is in the transcript, and the model does not read it')

      return 'A dim line was added to the transcript.'
    }

    case 'timer': {
      $.clock.after(3000, () => $.ui.toast('mod-lab: 3 seconds passed'))

      return 'A toast will show in 3 seconds.'
    }

    case 'store': {
      const count = Number((await $.store.get(PRESSES)) ?? 0) + 1
      await $.store.set(PRESSES, count)

      return `This button was pressed ${count} ${count === 1 ? 'time' : 'times'}, over all sessions.`
    }

    case 'files': {
      const found = await $.fs.list()
      const names = found.slice(0, 8).map(entry => entry.name)

      return `${found.length} entries here: ${names.join(', ')}${found.length > names.length ? ', …' : ''}`
    }

    case 'process': {
      const ran = await $.process.run(['git', 'log', '--oneline', '-3'])

      return ran.exitCode === 0
        ? `git log --oneline -3\n${ran.stdout.trim()}`
        : `git ended with code ${ran.exitCode}: ${ran.stderr.trim()}`
    }

    case 'copy': {
      const id = await $.session.id()
      const copied = await $.ui.copy({ text: id, surface: press.surface })

      return copied.isCopied ? `Copied ${id}.` : `Could not copy: ${copied.reason}.`
    }

    case 'ask': {
      const answer = await $.ui.ask('Which part of mods do you like more?', ['Panes', 'Hooks'])

      return `You answered: ${answer}`
    }

    case 'notice': {
      const added = await $.session.append({
        message: { type: 'system', content: [textBlock('mod-lab: a notice row added by a mod')] },
      })

      return added.deny === undefined ? `Added the row ${added.uuid}.` : `Refused: ${added.deny}`
    }

    case 'note': {
      const added = await $.session.append({
        message: {
          type: 'user',
          content: [textBlock('mod-lab test note: the user pressed the hidden note demo. No answer is needed.')],
        },
      })

      return added.deny === undefined
        ? 'Added a hidden note. Ask Claude "what did the mod-lab note say?" to check.'
        : `Refused: ${added.deny}`
    }

    case 'rule': {
      const isOn = await update($, hasRule, held => !held)

      return isOn
        ? `The rule is on. Ask Claude "what is the lab word?". The answer should be "${RULE_WORD}".`
        : 'The rule is off. The system prompt is as it was.'
    }

    case 'tool': {
      const filled = await $.prompt.fill({ text: FACTS_PROMPT })

      return filled.isFilled
        ? 'The prompt box holds a question now. Press Enter there to send it.'
        : `Could not fill the prompt box. Type this yourself: ${FACTS_PROMPT}`
    }

    case 'model': {
      const reply = await $.model.complete({
        model: 'haiku',
        prompt: 'In one short sentence, say what a plugin hook is.',
        maxTokens: 100,
        timeoutMs: 30_000,
      })

      return reply.isAnswered
        ? `${reply.text.trim()}\n(${reply.usage.input_tokens} tokens in, ${reply.usage.output_tokens} out)`
        : `No answer: ${reply.reason}`
    }

    case 'fork': {
      const reply = await $.model.fork({
        prompt: 'In one short sentence, what is this conversation about?',
      })

      return reply.isAnswered ? reply.text.trim() : `No answer: ${reply.reason}`
    }

    case 'agent': {
      const spawned = await $.agent.spawn({
        prompt: 'Reply with the single word: done. Do not use any tool.',
        description: 'mod-lab demo',
      })

      return spawned.deny === undefined
        ? `Started the subagent ${spawned.agentId ?? ''} on ${spawned.model}. Its answer shows in Events as turn.complete.`
        : `Refused: ${spawned.deny}`
    }
  }
}

const runDemo = async ($: EngineInterface, demo: Demo, press: UiPressArgument): Promise<void> => {
  await say($, `${demo.label}: running…`)

  try {
    await say($, `${demo.label}: ${await demoResultOf($, demo.key, press)}`)
  } catch (error) {
    await say($, `${demo.label} failed: ${messageOf(error)}`)
  }
}

const runCommand = async ($: EngineInterface, args: string): Promise<string> => {
  const wanted = args.trim().toLowerCase()

  if (wanted === '') {
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return opened.isPlaced
      ? 'The mod lab pane is open. Press ctrl+x tab to give it the keyboard.'
      : 'The mod lab pane could not be shown here. Make the terminal wider and run /lab again.'
  }

  if (wanted === 'dump') return runDump($)

  if (wanted === 'clear') {
    await clear($)

    return 'The list of events is empty now.'
  }

  if (wanted === 'close') {
    await $.ui.close({ id: PANE })

    return 'The mod lab pane is closed.'
  }

  return HELP
}

// What Claude gets back from the lab_facts tool.
const factsOf = async ($: EngineInterface): Promise<string> => {
  const usage = await $.session.usage()

  return JSON.stringify({
    servedBy: `the ${$.plugin.name} mod`,
    sessionId: await $.session.id(),
    model: await $.session.model(),
    promptsSent: await $.session.turns(),
    contextPercent: usage.context.percent ?? null,
    eventsSeen: (await read($, entries)).length,
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const id = await note($, 'session.start', e)
    const started = await next(e)

    await $.command.register({
      name: COMMAND,
      description: 'Open the mod lab: a live list of events, a dump, and demos of what mods can do',
      argumentHint: '[dump | clear | close]',
    })

    const registered = await $.tool.register({
      name: 'lab_facts',
      description:
        'Returns a few facts about the current Claude Code session, read by the mod-lab mod. Use it only when the user asks for lab facts.',
      inputSchema: { type: 'object', properties: {} },
    })
    factsTool = registered.tool

    finish(id, started)

    return started
  })

  // One hook for every command, so /lab is in the list of events too.
  on('command.run', async ($, e, next) => {
    const id = await note($, 'command.run', e)
    const ran = e.command === COMMAND ? { text: await runCommand($, e.args) } : await next(e)

    finish(id, ran)

    return ran
  })

  on('tool.call', async ($, e, next) => {
    const id = await note($, 'tool.call', e)
    const ran = String(e.tool) === factsTool ? { result: await factsOf($) } : await next(e)

    finish(id, ran)

    return ran
  })

  on('tool.check', async ($, e, next) => {
    const id = await note($, 'tool.check', e)
    const checked = await next(e)

    finish(id, checked)

    return checked
  })

  on('prompt.submit', async ($, e, next) => {
    const id = await note($, 'prompt.submit', e)
    const submitted = await next(e)

    finish(id, submitted)

    return submitted
  })

  on('prompt.context', async ($, e, next) => {
    const id = await note($, 'prompt.context', e)
    const answered = await next(e)

    await update($, context, () => answered.blocks.map(block => ({ name: block.name, text: block.text })))
    finish(id, answered)

    return answered
  })

  on('prompt.compose', async ($, e, next) => {
    const id = await note($, 'prompt.compose', e)
    const composed = await next(e)

    finish(id, {
      sections: composed.sections.map(section => ({
        id: section.id,
        scope: section.scope,
        characters: section.text.length,
      })),
    })

    return (await read($, hasRule)) ? { sections: [...composed.sections, RULE] } : composed
  })

  on('prompt.attachment', async ($, e, next) => {
    const id = await note($, 'prompt.attachment', e)
    const answered = await next(e)

    finish(id, answered)

    return answered
  })

  on('skill.prompt', async ($, e, next) => {
    const id = await note($, 'skill.prompt', e)
    const answered = await next(e)

    finish(id, answered)

    return answered
  })

  on('agent.spawn', async ($, e, next) => {
    const id = await note($, 'agent.spawn', e)
    const spawned = await next(e)

    finish(id, spawned)

    return spawned
  })

  on('turn.start', async ($, e, next) => {
    const id = await note($, 'turn.start', e)
    const started = await next(e)

    finish(id, started)

    return started
  })

  // Each request to the model. The response is passed on piece by piece, unchanged.
  on('turn.step', async function* ($, e, next) {
    const id = await note($, 'turn.step', e)
    const response = yield* next(e)

    finish(id, response)

    return response
  })

  on('turn.complete', async ($, e, next) => {
    const id = await note($, 'turn.complete', e)
    const completed = await next(e)

    finish(id, completed)

    return completed
  })

  on('session.append', async ($, e, next) => {
    const id = await note($, 'session.append', e)
    const appended = await next(e)

    finish(id, { uuid: appended.uuid })

    return appended
  })

  on('session.measure', async ($, e, next) => {
    const id = await note($, 'session.measure', e)
    const measured = await next(e)

    finish(id, measured)

    return measured
  })

  on('session.compact', async ($, e, next) => {
    const id = await note($, 'session.compact', e)
    const compacted = await next(e)

    finish(id, compacted)

    return compacted
  })

  on('session.end', async ($, e, next) => {
    await note($, 'session.end', e)

    return next(e)
  })

  // The only drawing hook: it draws this mod's own pane and nothing else.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const shown = await read($, view)
    const said = await read($, result)
    const list = await read($, entries)
    const chosenId = await read($, selected)
    const chosen = chosenId === null ? undefined : list.find(entry => entry.id === chosenId)

    const header = (
      <Box gap={1} flexWrap="wrap">
        <Button
          key="view:events"
          label={`Events (${list.length})`}
          hotkey="e"
          {...(shown === 'events' ? { variant: 'primary' as const } : {})}
          onPress={() => void show($, 'events')}
        />
        <Button
          key="view:demos"
          label="Demos"
          hotkey="d"
          {...(shown === 'demos' ? { variant: 'primary' as const } : {})}
          onPress={() => void show($, 'demos')}
        />
        <Button key="dump" label="Dump" hotkey="u" onPress={() => void runDump($)} />
        <Button key="clear" label="Clear" hotkey="c" onPress={() => void clear($)} />
      </Box>
    )

    const report = said !== '' && (
      <Box marginTop={1}>
        <Text wrap="wrap">{said}</Text>
      </Box>
    )

    if (shown === 'demos') {
      return (
        <Box flexDirection="column">
          {header}
          {report}
          <Box flexDirection="column" marginTop={1}>
            {DEMOS.map((demo, index) => (
              <Box flexDirection="column">
                <Button
                  key={`demo:${demo.key}`}
                  label={demo.label}
                  plain
                  {...(index < 9 ? { hotkey: String(index + 1) } : {})}
                  onPress={press => void runDemo($, demo, press)}
                />
                <Text dimColor wrap="wrap">
                  {`   ${demo.about}`}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    if (chosen !== undefined) {
      return (
        <Box flexDirection="column">
          {header}
          {report}
          <Box flexDirection="column" marginTop={1}>
            <Button key="back" label="Back to the list" hotkey="b" onPress={() => void update($, selected, () => null)} />
            <Text bold>{`${timeOf(chosen.at)} ${chosen.event}`}</Text>
            <Text wrap="wrap">
              {detailOf(chosen.id) ??
                'The full data of this event is no longer kept. It is lost when the mod reloads.'}
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        {report}
        <Box flexDirection="column" marginTop={1}>
          {list.length === 0 && (
            <Text dimColor wrap="wrap">
              No events yet. Send a prompt and watch this list. The newest event is at the top.
            </Text>
          )}
          {[...list]
            .reverse()
            .slice(0, MAX_ROWS)
            .map(entry => (
              <Button
                key={`entry:${entry.id}`}
                label={rowOf(entry, columns)}
                plain
                dimColor
                onPress={() => void update($, selected, () => entry.id)}
              />
            ))}
        </Box>
      </Box>
    )
  })
}
