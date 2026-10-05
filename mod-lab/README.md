# mod-lab

A mod for learning what Claude Code mods can do.

It has three parts:

- **Events**: a live list of the events that a mod can hook, with the data of each one.
- **Dump**: a file with everything a mod can read about the session.
- **Demos**: buttons that each run one small capability, so you can see the result.

A mod is a plugin of function hooks. The mod API is early access, so it can change between
releases of Claude Code.

## Install

This mod is part of the `cc-mods` marketplace (the folder above this one). It is enabled for
this project only, in `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "mod-lab@cc-mods": true
  }
}
```

To enable it in another project, run this in that project:

```
claude plugin install mod-lab@cc-mods --scope project
```

After you change the code, run `/reload-plugins` in the session.

## Use

| Command | What it does |
| --- | --- |
| `/lab` | Opens the pane |
| `/lab dump` | Writes the dump file |
| `/lab clear` | Empties the list of events |
| `/lab close` | Closes the pane |

Press `ctrl+x tab` to give the pane the keyboard. Then use these keys:

| Key | Button |
| --- | --- |
| `e` | Events |
| `d` | Demos |
| `u` | Dump |
| `c` | Clear |
| `b` | Back to the list (when an event is open) |
| `1` to `9` | The first nine demos |

Tab moves between buttons, and Enter presses the button. The arrow keys scroll the pane. Esc
gives the keyboard back to the prompt.

## Events

The list shows the newest event at the top. Each row has the time, the event name, and a short
summary. Press a row to see the input of the event and what it answered.

The mod watches these events. It only reads them and passes them on unchanged.

| Event | When it fires |
| --- | --- |
| `session.start` | The session is ready, or the mod was loaded again |
| `session.end` | The session ends, also on `/clear` |
| `session.append` | A row is added to the conversation |
| `session.measure` | The cost, the context use, or a rate limit changed |
| `session.compact` | The conversation is about to be made shorter |
| `prompt.submit` | You send a prompt |
| `prompt.context` | The context of the first message is built |
| `prompt.compose` | The system prompt is built |
| `prompt.attachment` | Claude Code adds a message of its own for the model |
| `turn.start` | A turn begins |
| `turn.step` | One request is sent to the model |
| `turn.complete` | A turn ends |
| `tool.call` | A tool is about to run |
| `tool.check` | Claude Code decides if a tool call is allowed |
| `command.run` | A slash command runs |
| `agent.spawn` | A subagent is about to start |
| `skill.prompt` | A skill is loaded for the model |

Limits:

- The list keeps the last 200 events and draws the newest 100.
- Long texts and long lists are cut in the data of an event.
- The list stays after the mod reloads. The full data of older events does not.

The mod does not watch `ui.render`, `prompt.edit`, or the telemetry events. They fire very
often. The mod has one `ui.render` hook, and it draws only the pane of this mod.

## Dump

`/lab dump` or the Dump button writes `.mod-lab/dump-<time>.json` in the working directory.

The file holds:

- the session: id, folders, model, number of prompts, git repository, usage, version
- the tools, commands, agents, and `/config` rows
- the full system prompt, section by section
- the context of the first message (for example `CLAUDE.md` and the date)
- the last 30 messages
- the events in the list, with their data
- the names of the settings, without their values

The file can hold private text, such as your instruction files and your messages. The
`.mod-lab/` folder is in `.gitignore`. Settings values are left out because they can hold
secrets.

## Demos

Each demo shows one call. The pane shows what the demo did, or why it failed.

| Demo | Call | Note |
| --- | --- | --- |
| Show a toast | `$.ui.toast` | |
| Show a status line | `$.ui.status` | Goes away after 8 seconds |
| Write a transcript line | `$.ui.log` | The model does not read it |
| Start a timer | `$.clock.after` | |
| Count presses | `$.store` | Kept between sessions |
| List files | `$.fs.list` | |
| Run a command | `$.process.run` | Runs `git log` |
| Copy the session id | `$.ui.copy` | |
| Ask me a question | `$.ui.ask` | |
| Add a notice row | `$.session.append` | The model does not read it |
| Add a hidden note for Claude | `$.session.append` | Changes the session |
| Turn the system prompt rule on or off | `prompt.compose` | Changes the session |
| Try the tool for Claude | `$.tool.register` | Writes a prompt for you |
| Ask a model a question | `$.model.complete` | Uses a few tokens |
| Ask about this conversation | `$.model.fork` | Uses tokens |
| Start a subagent | `$.agent.spawn` | Uses tokens |

Two demos need a second step:

- **System prompt rule**: turn it on, then ask Claude "what is the lab word?". The answer
  should be "pineapple". Press the demo again to turn the rule off.
- **Tool for Claude**: the mod gives Claude a tool named `lab_facts`. The demo writes a prompt
  in the prompt box. Press Enter there, and Claude calls the tool.

While this mod is enabled, `lab_facts` is in the tool list of Claude.

## Files

| File | What it holds |
| --- | --- |
| `.claude-plugin/plugin.json` | The name, version, and description of the mod |
| `hooks/hooks.json` | The name of the hooks module |
| `hooks/register.tsx` | All hooks, the pane, the dump, and the code of each demo |
| `hooks/demos.ts` | The list of demos: key, label, and one line about each |
| `hooks/brief.ts` | Makes the one-line summary and the cut copy of the data of an event |
| `hooks/log.ts` | Keeps the full data of each event in memory |
| `types/index.d.ts` | The types of the values kept in `$.state` |
| `tests/mod-lab.test.ts` | The tests |

`register.tsx` is long for a reason. The validator lets `$` and the `$.state` values be used
only in the hooks module itself, not in a file that it imports.

## Add a demo

1. Add an entry to `DEMOS` in `hooks/demos.ts`: a `key`, a `label`, and an `about` line.
2. Add a `case` with the same key to `demoResultOf` in `hooks/register.tsx`. Return a text that
   says what the demo did.

The type check fails until both steps are done.

## Check and test

```
claude plugin validate mod-lab
claude plugin test mod-lab
```

Run both from the `cc-mods` folder.
