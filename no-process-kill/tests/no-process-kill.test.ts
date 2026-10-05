import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { killOf } from '../hooks/detect'
import { ALLOW, BLOCK } from '../hooks/register'

const BASH_KILLS = [
  'kill 1234',
  'kill -9 1234',
  '/bin/kill -TERM 1234',
  'pkill -f node',
  'killall node',
  'taskkill /F /PID 4812',
  'taskkill.exe /IM node.exe',
  'cd app && kill 1234',
  'pnpm test; pkill node',
  'pgrep node | xargs kill -9',
  'pgrep node | xargs -n 1 kill',
  'sudo kill 1234',
  'sudo -u root kill 1234',
  'kill $(lsof -t -i:3000)',
  'echo "$(kill 1234)"',
  'bash -c "kill 1234"',
  "sh -c 'pkill node'",
  'cmd /c "taskkill /F /IM node.exe"',
  'npx kill-port 3000',
  'pnpm dlx kill-port 3000',
  'FOO=1 kill 1234',
  'wmic process where name="node.exe" delete',
  'ls\nkill 1234',
]

const BASH_SAFE = [
  'ls -la',
  'cat skills.md',
  'grep -r "kill" src',
  'echo "kill 1234"',
  "echo 'pkill node'",
  'git commit -m "kill the old parser"',
  'kill -0 1234',
  'kill -l',
  'pnpm add tree-kill',
  'pnpm run killer-test',
  'wmic process list brief',
  'tasklist | findstr node',
]

const POWERSHELL_KILLS = [
  'Stop-Process -Id 1234',
  'stop-process -Name node -Force',
  'Get-Process node | Stop-Process',
  'spps -Name node',
  'kill 1234',
  'taskkill /F /PID 4812',
  '& taskkill /F /IM node.exe',
  '(Get-Process -Id 1234).Kill()',
  'Get-Process node | ForEach-Object { $_.Kill() }',
  'if ($true) { Stop-Process -Id 1234 }',
  'Start-Process taskkill -ArgumentList "/F /PID 1"',
  'powershell -Command "Stop-Process -Id 1234"',
]

const POWERSHELL_SAFE = [
  'Get-Process node',
  'Get-ChildItem skills',
  'Write-Output "Stop-Process -Id 1234"',
  "Write-Output 'taskkill /F'",
  'Select-String -Pattern "kill" -Path log.txt',
  'Stop-Service spooler',
]

test('finds the commands that stop a process', () => {
  for (const command of BASH_KILLS) {
    expect(killOf(command, 'bash'), command).not.toBeNull()
  }
  for (const command of POWERSHELL_KILLS) {
    expect(killOf(command, 'powershell'), command).not.toBeNull()
  }
})

test('leaves the other commands alone', () => {
  for (const command of BASH_SAFE) {
    expect(killOf(command, 'bash'), command).toBeNull()
  }
  for (const command of POWERSHELL_SAFE) {
    expect(killOf(command, 'powershell'), command).toBeNull()
  }
})

// Stands for the engine: answers the dialog with `answer` and counts what ran.
const world = (on: On, answer: string | Error) => {
  const seen = { asked: [] as string[], ran: [] as string[] }

  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const question = e.questions[0]?.question ?? ''
    seen.asked.push(question)

    if (answer instanceof Error) throw answer

    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    seen.ran.push(e.command)

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'PowerShell' }, (_$, e) => {
    seen.ran.push(e.command)

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'TaskStop' }, (_$, e) => {
    seen.ran.push(`TaskStop ${e.task_id}`)

    return { result: { message: 'stopped', task_id: e.task_id ?? '', task_type: 'shell' } }
  })

  return seen
}

test('runs a normal command without asking', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  expect(ran.deny).toBeUndefined()
  expect(seen.asked).toHaveLength(0)
  expect(seen.ran).toEqual(['ls -la'])
})

test('asks, and blocks the command when the answer is Block', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'Bash', command: 'cd app && taskkill /F /PID 4812' })

  expect(seen.asked).toHaveLength(1)
  expect(seen.asked[0]).toContain('taskkill /F /PID 4812')
  expect(ran.deny).toContain('did not allow')
  expect(seen.ran).toHaveLength(0)
})

test('asks, and runs the command when the answer is Allow once', async ($, on) => {
  const seen = world(on, ALLOW)

  await $.tool.call({ tool: 'PowerShell', command: 'Stop-Process -Id 1234' })
  await $.tool.call({ tool: 'PowerShell', command: 'Stop-Process -Id 5678' })

  expect(seen.asked).toHaveLength(2)
  expect(seen.ran).toEqual(['Stop-Process -Id 1234', 'Stop-Process -Id 5678'])
})

test('blocks the command when nobody answers', async ($, on) => {
  const seen = world(on, new Error('dismissed'))

  const ran = await $.tool.call({ tool: 'Bash', command: 'pkill node' })

  expect(ran.deny).toContain('did not allow')
  expect(seen.ran).toHaveLength(0)
})

test('passes a typed answer on to Claude and blocks the command', async ($, on) => {
  const seen = world(on, 'use the stop script instead')

  const ran = await $.tool.call({ tool: 'Bash', command: 'kill 1234' })

  expect(ran.deny).toContain('use the stop script instead')
  expect(seen.ran).toHaveLength(0)
})

test('asks before the TaskStop tool', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'TaskStop', task_id: 'b1' })

  expect(seen.asked[0]).toContain('TaskStop b1')
  expect(ran.deny).toContain('did not allow')
  expect(seen.ran).toHaveLength(0)
})
