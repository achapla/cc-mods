import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { replacementsOf } from '../hooks/pnpm'

// Each npm or npx command line, and the pnpm commands it should be replaced with.
const BASH_BLOCKED: [string, string[]][] = [
  ['npm install', ['pnpm install']],
  ['npm i', ['pnpm install']],
  ['npm install react', ['pnpm add react']],
  ['npm i -D typescript vitest', ['pnpm add -D typescript vitest']],
  ['npm install -g serve', ['pnpm add -g serve']],
  ['npm uninstall lodash', ['pnpm remove lodash']],
  ['npm run build', ['pnpm run build']],
  ['npm run test -- --watch', ['pnpm run test -- --watch']],
  ['npm test', ['pnpm test']],
  ['npm ci', ['pnpm install --frozen-lockfile']],
  ['npm init -y', ['pnpm init -y']],
  ['npm --version', ['pnpm --version']],
  ['npx prettier --write .', ['pnpm dlx prettier --write .']],
  ['cd app && npm install', ['pnpm install']],
  ['npm install; npm run build', ['pnpm install', 'pnpm run build']],
  ['CI=1 npm test', ['pnpm test']],
  ['sudo npm install -g serve', ['pnpm add -g serve']],
  ['bash -c "npm run build"', ['pnpm run build']],
  ['echo "$(npm root)"', ['pnpm root']],
  ['/usr/bin/npm install', ['pnpm install']],
]

const POWERSHELL_BLOCKED: [string, string[]][] = [
  ['npm install', ['pnpm install']],
  ['npm.cmd run build', ['pnpm run build']],
  ['& npm install react', ['pnpm add react']],
  ['Set-Location app; npm install', ['pnpm install']],
  ['npx.cmd tsc --noEmit', ['pnpm dlx tsc --noEmit']],
]

const BASH_ALLOWED = [
  'pnpm install',
  'pnpm add react',
  'pnpm dlx prettier --write .',
  'pnpm run build',
  'cat npm-debug.log',
  'grep -r "npm install" docs',
  'echo "use npm install"',
  'git commit -m "replace npm with pnpm"',
  'command -v npm',
  'ls node_modules/.bin/npm',
]

const POWERSHELL_ALLOWED = [
  'pnpm install',
  'Get-Content npm-debug.log',
  'Write-Output "npm install"',
  'Get-Command npm',
]

test('finds npm and npx commands and names the pnpm command to use', () => {
  for (const [command, uses] of BASH_BLOCKED) {
    expect(replacementsOf(command, 'bash').map(one => one.use), command).toEqual(uses)
  }
  for (const [command, uses] of POWERSHELL_BLOCKED) {
    expect(replacementsOf(command, 'powershell').map(one => one.use), command).toEqual(uses)
  }
})

test('leaves pnpm and other commands alone', () => {
  for (const command of BASH_ALLOWED) {
    expect(replacementsOf(command, 'bash'), command).toEqual([])
  }
  for (const command of POWERSHELL_ALLOWED) {
    expect(replacementsOf(command, 'powershell'), command).toEqual([])
  }
})

// Stands for the engine: records the commands that really ran.
const world = (on: On) => {
  const ran: string[] = []

  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    ran.push(e.command)

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'PowerShell' }, (_$, e) => {
    ran.push(e.command)

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  return ran
}

test('blocks an npm command and tells Claude the pnpm command', async ($, on) => {
  const ran = world(on)

  const result = await $.tool.call({ tool: 'Bash', command: 'cd app && npm install react' })

  expect(result.deny).toContain('npm install react  ->  pnpm add react')
  expect(ran).toHaveLength(0)
})

test('blocks an npx command in PowerShell', async ($, on) => {
  const ran = world(on)

  const result = await $.tool.call({ tool: 'PowerShell', command: 'npx tsc --noEmit' })

  expect(result.deny).toContain('pnpm dlx tsc --noEmit')
  expect(ran).toHaveLength(0)
})

test('runs a pnpm command', async ($, on) => {
  const ran = world(on)

  const result = await $.tool.call({ tool: 'Bash', command: 'pnpm install' })

  expect(result.deny).toBeUndefined()
  expect(ran).toEqual(['pnpm install'])
})
