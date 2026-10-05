# no-new-branch

Asks me before any command that would create a new git branch or worktree.

![no-new-branch asks before git checkout -b](../docs/screenshots/no-new-branch.png)

## Why I made it

I commit on the branch I am on. Claude often wants to create a new branch before it commits,
and an instruction file did not always stop it. A mod does.

This one fits only if you work the same way. If you like Claude to create branches for you, do
not install it.

## Install

```
claude plugin marketplace add achapla/cc-mods
claude plugin install no-new-branch@cc-mods
```

## How it works

When Claude is about to create a branch, a dialog shows the command and two answers:

- **Block**: the command does not run. Claude is told to stay on the current branch and to
  continue the work there.
- **Allow once**: the command runs this one time.

When I close the dialog without an answer, the command is blocked.

## What it asks about

| Kind | Examples |
| --- | --- |
| A new branch | `git checkout -b`, `git switch -c`, `git branch <name>`, `git stash branch` |
| A new worktree | `git worktree add <path>` |
| Claude Code tools | The `EnterWorktree` tool, and a subagent that gets its own worktree |

It does not ask about commands that only list, rename or delete branches, such as
`git branch -a`, `git branch -m` and `git branch -d`. It also does not ask when Claude changes
to a branch that exists already.

## Check and test

I run both from the `cc-mods` folder:

```
claude plugin validate no-new-branch
claude plugin test no-new-branch
```
