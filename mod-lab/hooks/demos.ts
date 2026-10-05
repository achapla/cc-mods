export const RULE_WORD = 'pineapple'
export const RULE_TEXT = `mod-lab demo rule: if the user asks for "the lab word", answer with the single word "${RULE_WORD}".`
export const FACTS_PROMPT = 'Call the lab_facts tool and tell me what it returns.'

// The demos in the order the pane lists them. `about` names the call a demo
// shows and what it does; the code of each one is in register.tsx, because
// only that file may use `$`.
export const DEMOS = [
  {
    key: 'toast',
    label: 'Show a toast',
    about: '$.ui.toast: a small box for a few seconds. The model does not see it.',
  },
  {
    key: 'status',
    label: 'Show a status line',
    about: '$.ui.status: one line under the prompt that stays until the mod clears it.',
  },
  {
    key: 'log',
    label: 'Write a transcript line',
    about: '$.ui.log: a dim line in the transcript. The model does not read it.',
  },
  {
    key: 'timer',
    label: 'Start a timer',
    about: '$.clock.after: run code later, with no turn running.',
  },
  {
    key: 'store',
    label: 'Count presses',
    about: '$.store: a value kept on disk, so it stays between sessions.',
  },
  {
    key: 'files',
    label: 'List files',
    about: '$.fs.list: read the working directory.',
  },
  {
    key: 'process',
    label: 'Run a command',
    about: '$.process.run: run a program on this machine (here: git log).',
  },
  {
    key: 'copy',
    label: 'Copy the session id',
    about: '$.ui.copy: put text on the clipboard.',
  },
  {
    key: 'ask',
    label: 'Ask me a question',
    about: '$.ui.ask: the same dialog that Claude uses to ask you something.',
  },
  {
    key: 'notice',
    label: 'Add a notice row',
    about: '$.session.append (system): a row kept in the conversation. The model does not read it.',
  },
  {
    key: 'note',
    label: 'Add a hidden note for Claude',
    about: '$.session.append (user): Claude reads it, you do not see it. This changes the session.',
  },
  {
    key: 'rule',
    label: 'Turn the system prompt rule on or off',
    about: 'prompt.compose: add a section to the system prompt. This changes the session.',
  },
  {
    key: 'tool',
    label: 'Try the tool for Claude',
    about: '$.tool.register: this mod gives Claude a tool named lab_facts. This writes a prompt for you.',
  },
  {
    key: 'model',
    label: 'Ask a model a question',
    about: '$.model.complete: one question to a small model, with no history. Uses a few tokens.',
  },
  {
    key: 'fork',
    label: 'Ask about this conversation',
    about: '$.model.fork: one question over the transcript of this session. Uses tokens.',
  },
  {
    key: 'agent',
    label: 'Start a subagent',
    about: '$.agent.spawn: start a subagent in the background. Uses tokens.',
  },
] as const

export type Demo = (typeof DEMOS)[number]
