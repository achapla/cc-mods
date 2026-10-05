import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { dangersOf } from '../hooks/danger'
import { ALLOW, BLOCK } from '../hooks/register'

const BASH_DANGER = [
  'rm -rf src',
  'rm -r src',
  'rm -fr ./',
  'rm -Rf ~/projects',
  'rm --recursive src',
  'rm -rf node_modules src',
  'ls | xargs rm -rf',
  'sudo rm -rf /var/data',
  'find . -name "*.log" -delete',
  'find . -type f -exec rm {} \\;',
  'git reset --hard',
  'git reset --hard HEAD~3',
  'git clean -fd',
  'git clean -xdf',
  'git clean --force',
  'git push --force',
  'git push -f origin main',
  'git push --force-with-lease',
  'git push origin +main',
  'git push origin :old-branch',
  'git push origin --delete old-branch',
  'git checkout .',
  'git checkout -- src/app.ts',
  'git checkout -f main',
  'git restore src/app.ts',
  'git restore .',
  'git branch -D feature',
  'git stash drop',
  'git stash clear',
  'git filter-branch --tree-filter "x" HEAD',
  'git -C app reset --hard',
  'git add -A && git reset --hard',
  'bash -c "git reset --hard"',
  'dd if=/dev/zero of=/dev/sda',
  'mkfs.ext4 /dev/sda1',
  'shutdown -h now',
  'docker system prune -af',
  'docker volume rm data',
  'docker compose down -v',
  'cmd /c "rd /s /q build-old"',
]

const BASH_SAFE = [
  'rm file.txt',
  'rm -f file.txt',
  'rm -rf node_modules',
  'rm -rf dist build',
  'rm -rf ./app/node_modules/',
  'rmdir empty',
  'find . -name "*.log"',
  'git status',
  'git reset',
  'git reset --soft HEAD~1',
  'git reset HEAD file.txt',
  'git clean -n',
  'git clean -nfd',
  'git clean --dry-run -fd',
  'git push',
  'git push origin main',
  'git push -u origin main',
  'git checkout main',
  'git restore --staged src/app.ts',
  'git branch -d feature',
  'git stash',
  'git stash pop',
  'git stash list',
  'git commit -m "remove rm -rf from the script"',
  'echo "git reset --hard"',
  'grep -r "rm -rf" docs',
  'docker ps',
  'docker compose down',
  'docker compose up -d',
  'pnpm run clean',
]

const POWERSHELL_DANGER = [
  'Remove-Item -Recurse -Force src',
  'Remove-Item src -Recurse',
  'Remove-Item -r src',
  'rm -Recurse src',
  'rd /s /q src',
  'Get-ChildItem old | Remove-Item -Recurse',
  'git reset --hard',
  'Restart-Computer',
  'Stop-Computer -Force',
  'Format-Volume -DriveLetter D',
]

const POWERSHELL_SAFE = [
  'Remove-Item file.txt',
  'Remove-Item -Force file.txt',
  'Remove-Item -Recurse -Force node_modules',
  'Remove-Item -Recurse dist, build',
  'Get-ChildItem -Recurse',
  'Write-Output "Remove-Item -Recurse src"',
  'git status',
]

test('finds the commands that can destroy work', () => {
  for (const command of BASH_DANGER) {
    expect(dangersOf(command, 'bash').length, command).toBeGreaterThan(0)
  }
  for (const command of POWERSHELL_DANGER) {
    expect(dangersOf(command, 'powershell').length, command).toBeGreaterThan(0)
  }
})

test('leaves the other commands alone', () => {
  for (const command of BASH_SAFE) {
    expect(dangersOf(command, 'bash'), command).toEqual([])
  }
  for (const command of POWERSHELL_SAFE) {
    expect(dangersOf(command, 'powershell'), command).toEqual([])
  }
})

test('offers a preview only when the command runs in the session folder', () => {
  expect(dangersOf('git reset --hard', 'bash')[0]?.preview?.argv).toEqual(['git', 'status', '--short'])
  expect(dangersOf('git clean -fd', 'bash')[0]?.preview?.argv).toEqual(['git', 'clean', '-n', '-fd'])
  expect(dangersOf('cd app && git reset --hard', 'bash')[0]?.preview).toBeUndefined()
  expect(dangersOf('git -C app reset --hard', 'bash')[0]?.preview).toBeUndefined()
  expect(dangersOf('rm -rf src', 'bash')[0]?.preview).toBeUndefined()
})

// Stands for the engine: answers the dialog with `answer` and records what ran.
const world = (on: On, answer: string | Error, status = ' M src/app.ts\n?? notes.txt\n') => {
  const seen = { asked: [] as string[], ran: [] as string[], previews: [] as string[] }
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
  on('process.run', (_$, e) => {
    seen.previews.push(e.argv.join(' '))

    return {
      value: { exitCode: 0, stdout: status, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })

  return seen
}

test('runs a normal command without asking', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(ran.deny).toBeUndefined()
  expect(seen.asked).toHaveLength(0)
  expect(seen.ran).toEqual(['git status'])
})

test('asks with the reason and what would be lost, and blocks on Block', async ($, on) => {
  const seen = world(on, BLOCK)

  const ran = await $.tool.call({ tool: 'Bash', command: 'git reset --hard HEAD~1' })

  expect(seen.previews).toEqual(['git status --short'])
  expect(seen.asked[0]).toContain('git reset --hard HEAD~1')
  expect(seen.asked[0]).toContain('It discards all uncommitted changes.')
  expect(seen.asked[0]).toContain('M src/app.ts')
  expect(seen.asked[0]).toContain('?? notes.txt')
  expect(ran.deny).toContain('did not allow')
  expect(seen.ran).toHaveLength(0)
})

test('asks, and runs the command when the answer is Allow once', async ($, on) => {
  const seen = world(on, ALLOW)

  const ran = await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse -Force src' })

  expect(seen.asked[0]).toContain('It deletes folders and everything inside them.')
  expect(seen.previews).toHaveLength(0)
  expect(ran.deny).toBeUndefined()
  expect(seen.ran).toEqual(['Remove-Item -Recurse -Force src'])
})

test('blocks the command when nobody answers', async ($, on) => {
  const seen = world(on, new Error('dismissed'))

  const ran = await $.tool.call({ tool: 'Bash', command: 'rm -rf src' })

  expect(ran.deny).toContain('did not allow')
  expect(seen.ran).toHaveLength(0)
})

test('shows at most eight lines of what would be lost', async ($, on) => {
  const status = Array.from({ length: 12 }, (_, index) => ` M file${index}.ts`).join('\n')
  const seen = world(on, BLOCK, status)

  await $.tool.call({ tool: 'Bash', command: 'git checkout .' })

  expect(seen.asked[0]).toContain('file7.ts')
  expect(seen.asked[0]).not.toContain('file8.ts')
  expect(seen.asked[0]).toContain('... and 4 more')
})
