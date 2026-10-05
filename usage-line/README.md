# usage-line

Shows my session cost, my context use, and my limits in one line above the prompt.

![My usage line above the prompt](../docs/screenshots/usage-line.png)

## Why I made it

I want to see how much of my limits I used without typing a command. I also want to know if I
am using a limit too fast, before I reach it in the middle of some work.

I think this one is useful to most people who have limit windows on their account.

## Install

```
claude plugin marketplace add achapla/cc-mods
claude plugin install usage-line@cc-mods
```

## What the line shows

From left to right:

| Part | Example | Meaning |
| --- | --- | --- |
| User | `alex` | The part of my account email before the `@` |
| Model | `opus-5-5` | The model in use |
| Effort | `medium` | The effort level in use |
| Cost | `$0.80` | The cost of this session |
| Context | `□□□□□□□□□□ 8%` | How full the context window is |
| 5-hour limit | `■■■■■■□□□□ 65% 1.1× 2h 7m` | Percent used, pace, and time until the reset |
| Weekly limit | `■■■□□□□□□□ 38% 0.9× 4d 0h` | The same for the 7-day window |

A part is left out when Claude Code does not give its value. For example, there are no limit
bars when the account has no limit windows.

When the terminal is narrow, the line gets shorter: first the bars get shorter, then the pace
and the reset times go away, and last the bars go away and only the percents stay.

## Pace

Pace is the percent of the limit I used, divided by the percent of the window's time that has
passed.

- `1.0×`: I reach the limit exactly when the window resets.
- Above `1.0×`: I reach the limit before the reset.
- Below `1.0×`: part of the limit is still unused at the reset.

When the pace is above `1.2×`, the line also says how long it takes until the limit is full,
for example `full in 1h 20m`.

No pace is shown in the first tenth of a window, because the number means little that early.

## Colors

| Color | A limit bar with a pace | A bar with no pace |
| --- | --- | --- |
| Green | Pace from `0.66×` to `1.0×` | Below 75% |
| Orange | Pace above `1.0×` | From 75% |
| Red | Pace above `1.2×`, or 90% used | From 90% |
| Cyan | Pace below `0.66×` | |

The colors are the ones I like on my dark terminal. To change one, edit `hooks/colors.ts`.

## Bar styles

| Command | What it does |
| --- | --- |
| `/usage-style` | Shows the styles and the one in use |
| `/usage-style small` | `■■■■□□□□□□` |
| `/usage-style block` | `████░░░░░░` |
| `/usage-style thin` | `━━━━──────` |

The chosen style is kept between sessions.

## Check and test

I run both from the `cc-mods` folder:

```
claude plugin validate usage-line
claude plugin test usage-line
```
