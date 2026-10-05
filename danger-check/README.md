# danger-check

Asks me before a command that can destroy work.

![danger-check asks before git reset --hard](../docs/screenshots/danger-check.png)

## Why I made it

Some commands cannot be undone. I want to see such a command, and what it would destroy,
before it runs. I do not want to read every command that Claude runs to find the few that
matter.

I think this one is useful to most people.

## Install

```
claude plugin marketplace add achapla/cc-mods
claude plugin install danger-check@cc-mods
```

## How it works

The mod reads every Bash and PowerShell command before it runs. When a command can destroy
work, a dialog shows the command, why it is dangerous, and two answers:

- **Block**: the command does not run. Claude is told not to try another command that has the
  same effect, and to ask me what to do next.
- **Allow once**: the command runs this one time.

When I close the dialog without an answer, the command is blocked.

For some commands the dialog also shows what I would lose:

| Command | What the dialog shows |
| --- | --- |
| `git reset --hard`, `git checkout .`, `git restore` | My uncommitted changes |
| `git clean -f` | The files it would delete |
| `git stash drop`, `git stash clear` | My stashes |

## What it asks about

| Kind | Examples |
| --- | --- |
| Deleting folders | `rm -rf`, `Remove-Item -Recurse`, `rd /s`, `find -delete` |
| Losing uncommitted work | `git reset --hard`, `git checkout .`, `git checkout -f`, `git restore`, `git clean -f` |
| Changing the remote | `git push --force`, `git push --delete`, `git push origin :branch` |
| Losing history | `git branch -D`, `git stash drop`, `git stash clear`, `git filter-branch` |
| Docker data | `docker system prune`, `docker volume rm`, `docker compose down -v` |
| Disks | `dd`, `mkfs`, `format`, `diskpart`, `Clear-Disk` |
| The computer | `shutdown`, `reboot`, `Restart-Computer` |

It does not ask when a command only deletes folders that tools build again, such as
`node_modules`, `dist`, `build`, `coverage`, `.next` and `__pycache__`.

The mod finds a dangerous command also when it is one part of a longer command line, for
example after `&&` or `;`.

## Limits

The mod reads the text of the command. It cannot see what a script file does when Claude runs
that file. The list above is also only what I thought of. So I use it as one more check, not
as my only protection.

## Check and test

I run both from the `cc-mods` folder:

```
claude plugin validate danger-check
claude plugin test danger-check
```
