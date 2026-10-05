import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { branchCreationOf } from '../hooks/git'
import { ALLOW, BLOCK } from '../hooks/register'

const CREATES = [
  'git checkout -b feature',
  'git checkout -B feature origin/main',
  'git checkout --orphan pages',
  'git checkout --track origin/feature',
  'git switch -c feature',
  'git switch -C feature',
  'git switch --create feature',
  'git switch --orphan pages',
  'git branch feature',
  'git branch feature main',
  'git branch -f feature main',
  'git branch --track feature origin/feature',
  'git branch -c main copy',
  'git worktree add ../wt',
  'git worktree add -b feature ../wt',
  'git worktree add ../wt -b feature',
  'git stash branch rescue',
  'git -C app checkout -b feature',
  'git -c user.name=x switch -c feature',
  'git add -A && git checkout -b feature && git commit -m "x"',
  'cd app; git switch -c feature',
  'bash -c "git checkout -b feature"',
  'git.exe checkout -b feature',
]

const DOES_NOT_CREATE = [
  'git status',
  'git checkout main',
  'git checkout -- src/app.ts',
  'git checkout .',
  'git switch main',
  'git switch -',
  'git branch',
  'git branch -a',
  'git branch -vv',
  'git branch --show-current',
  'git branch --list "feat*"',
  'git branch -d feature',
  'git branch -D feature',
  'git branch -m old new',
  'git branch --merged main',
  'git branch --contains abc123',
  'git branch -u origin/main',
  'git worktree list',
  'git worktree remove ../wt',
  'git worktree add ../wt main',
  'git worktree add --detach ../wt',
  'git stash',
  'git stash pop',
  'git commit -m "add checkout -b note"',
  'git log --oneline -b',
  'echo "git checkout -b feature"',
  'grep -r "git branch new" docs',
]

test('finds the commands that create a branch', () => {
  for (const command of CREATES) {
    expect(branchCreationOf(command, 'bash'), command).not.toBeNull()
    expect(branchCreationOf(command, 'powershell'), command).not.toBeNull()
  }
})

test('leaves the other git commands alone', () => {
  for (const command of DOES_NOT_CREATE) {
    expect(branchCreationOf(command, 'bash'), command).toBeNull()
  }
})

// Stands for the engine: answers the dialog with `answer` and records what ran.
const world = (on: On, answer: string | Error) => {
  const seen = { asked: [] as string[], ran: [] as string[] }
  const shell = { stdout: '', stderr: '', interrupted: false }

  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const question = e.questions[0]?.question ?? ''
    seen.asked.push(question)

    if (answer instanceof Error) throw answer

    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    seen.ran.push(e.command)

    return { result: shell }
  })
  on('tool.call', { tool: 'PowerShell' }, (_$, e) => {
    seen.ran.push(e.command)

    return { result: shell }
  })
  on('tool.call', { tool: 'EnterWorktree' }, (_$, e) => {
    seen.ran.push(`EnterWorktree ${e.name ?? e.path}`)

    return { result: { worktreePath: '/wt', message: 'entered' } }
  })

  return seen
}

test('runs a normal git command without asking', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "work"' })

  expect(ran.deny).toBeUndefined()
  expect(seen.asked).toHaveLength(0)
  expect(seen.ran).toEqual(['git commit -m "work"'])
})

test('asks, and blocks the command when the answer is Block', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'Bash', command: 'git add -A && git checkout -b feature' })

  expect(seen.asked[0]).toContain('git checkout -b feature')
  expect(ran.deny).toContain('did not allow a new branch')
  expect(seen.ran).toHaveLength(0)
})

test('asks, and runs the command when the answer is Allow once', async ($, on) => {
  const seen = world(on, ALLOW)

  const ran = await $.tool.call({ tool: 'PowerShell', command: 'git switch -c feature' })

  expect(seen.asked).toHaveLength(1)
  expect(ran.deny).toBeUndefined()
  expect(seen.ran).toEqual(['git switch -c feature'])
})

test('blocks the command when nobody answers', async ($, on) => {
  const seen = world(on, new Error('dismissed'))

  const ran = await $.tool.call({ tool: 'Bash', command: 'git branch feature' })

  expect(ran.deny).toContain('did not allow a new branch')
  expect(seen.ran).toHaveLength(0)
})

test('asks before a new worktree, but not before entering one that exists', async ($, on) => {
  const seen = world(on, BLOCK)

  const created = await $.tool.call({ tool: 'EnterWorktree', name: 'feature' })
  const entered = await $.tool.call({ tool: 'EnterWorktree', path: '/wt' })

  expect(created.deny).toContain('did not allow a new branch')
  expect(entered.deny).toBeUndefined()
  expect(seen.asked).toHaveLength(1)
  expect(seen.ran).toEqual(['EnterWorktree /wt'])
})
