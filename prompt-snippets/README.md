# prompt-snippets

Replaces short names such as `;plan` in my prompt with longer texts that I saved.

![The list of snippets](../docs/screenshots/prompt-snippets.png)

## Why I made it

I type the same few instructions again and again, for example "explore first and do not change
any file until I say go". Now I type `;plan`.

I think the idea is useful to most people. The starting snippets are mine, so you will want to
replace them with your own.

## Install

```
claude plugin marketplace add achapla/cc-mods
claude plugin install prompt-snippets@cc-mods
```

## Use

I type `;` and a name anywhere in a prompt:

```
Add a dark mode to the settings page. ;plan
```

When I send the prompt, the mod replaces `;plan` with the saved text. A short message names
the snippets that were replaced.

A name is replaced only at the start of the prompt or after a space, so `a;b` in code stays as
it is. A name that is not saved also stays as it is.

## Commands

| Command | What it does |
| --- | --- |
| `/snippets` | Shows all snippets |
| `/snippets add <name> <text>` | Saves a snippet, or changes one |
| `/snippets remove <name>` | Deletes a snippet |
| `/snippets reset` | Goes back to the starting snippets |

A name has only letters, digits, `-` and `_`. The snippets are kept between sessions.

## The starting snippets

| Name | Text |
| --- | --- |
| `;plan` | Explore first. Then share your thoughts and your plan. Do not write or change any file until I say go. |
| `;step` | Work one step at a time. After each step, stop, tell me the result, and wait for me. |
| `;test` | Run the tests and show me the real result. If a test fails, say so and show the output. |
| `;why` | Explain why you chose this. Use simple English and short sentences. |

## Check and test

I run both from the `cc-mods` folder:

```
claude plugin validate prompt-snippets
claude plugin test prompt-snippets
```
