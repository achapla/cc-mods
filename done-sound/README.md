# done-sound

Plays a sound when a long turn ends and when Claude waits for my answer.

![The /sounds command](../docs/screenshots/done-sound.png)

## Why I made it

During a long turn I look at something else. Then Claude is done, or it waits for a
permission, and I do not see it for minutes. A sound brings me back.

This one is a matter of taste. The sounds are the ones I find funny, and you may find them
annoying. You can turn any of them off or add your own.

## Install

```
claude plugin marketplace add achapla/cc-mods
claude plugin install done-sound@cc-mods
```

## When a sound plays

| Moment | When |
| --- | --- |
| `done` | A turn that took 10 seconds or more ends |
| `ask` | Claude asks me a question, or a permission prompt waits for me |

A turn shorter than 10 seconds ends without a sound, because I am still looking at the screen.
A turn that I stopped myself also ends without a sound.

Each moment has a list of sounds. One of them plays each time, picked by chance. The same
sound does not play twice in a row when the list has more than one.

## Commands

| Command | What it does |
| --- | --- |
| `/sounds` | Shows the sounds of each moment, and all sounds |
| `/sounds done <names>` | Sets the sounds for the end of a long turn |
| `/sounds ask <names>` | Sets the sounds for a question or a permission prompt |
| `/sounds done none` | Plays no sound for that moment (also works for `ask`) |
| `/sounds play <name>` | Plays one sound now |
| `/sounds reset` | Goes back to the starting sounds |

For example, `/sounds done scooby pikachu` makes one of those two play at the end of each long
turn. The choices are kept between sessions.

## Add a sound

Put a `.wav` file in the `sounds` folder of the mod. Its file name without `.wav` is the name
of the sound. The name must have no space and no comma.

The mod reads the folder each time, so the new sound works at once.

## Where it works

| System | How the sound is played |
| --- | --- |
| Windows | PowerShell |
| macOS | `afplay` |

I use it on Windows. I did not test the macOS way. On a system with neither, the mod stays
silent.

## Check and test

I run both from the `cc-mods` folder:

```
claude plugin validate done-sound
claude plugin test done-sound
```
