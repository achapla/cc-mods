# pnpm-only

Blocks `npm` and `npx` commands and tells Claude the `pnpm` command to use instead.

![pnpm-only blocks npm install](../docs/screenshots/pnpm-only.png)

## Why I made it

I use only `pnpm` in all my projects. Claude often runs `npm` anyway, and that leaves a
`package-lock.json` and a second set of installed packages behind.

This one fits only if you use `pnpm` everywhere. If you use `npm`, do not install it.

## Install

```
claude plugin marketplace add achapla/cc-mods
claude plugin install pnpm-only@cc-mods
```

## How it works

The mod reads every Bash and PowerShell command before it runs. When the command runs `npm` or
`npx`, the mod blocks it and gives Claude the `pnpm` command. Claude then runs that command.

The mod does not ask me anything, so the work continues without a stop.

## What Claude is told to use

| Claude wanted to run | The mod says to use |
| --- | --- |
| `npm install` | `pnpm install` |
| `npm install react` | `pnpm add react` |
| `npm i -D vitest` | `pnpm add -D vitest` |
| `npm ci` | `pnpm install --frozen-lockfile` |
| `npm uninstall react` | `pnpm remove react` |
| `npm run build` | `pnpm run build` |
| `npm test` | `pnpm test` |
| `npx prettier .` | `pnpm dlx prettier .` |

Some npm flags have another name in pnpm. The mod does not change flags, so it tells Claude to
check the pnpm command before it runs it.

## Check and test

I run both from the `cc-mods` folder:

```
claude plugin validate pnpm-only
claude plugin test pnpm-only
```
