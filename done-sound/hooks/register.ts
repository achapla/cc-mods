import type { EngineInterface, Register } from 'claude-code'

// A turn shorter than this ends without a sound: you are still looking at the screen.
export const MIN_TURN_MS = 10_000

// The done sound is a file of the system; the ask sound is the mod's own file, a siren and two beeps.
const DONE = { windows: 'tada.wav', mac: 'Glass.aiff' } as const
const ASK = 'sounds/ask.wav'

type Sound = 'done' | 'ask'

// The notifications that mean Claude Code waits for an answer.
const WAITING = new Set(['permission_prompt', 'elicitation_dialog'])

// The command that plays the sound on this machine. `$.audio.play` plays nothing in a Windows terminal.
const playerOf = async ($: EngineInterface, sound: Sound): Promise<string[]> => {
  const windows = await $.env.get('SystemRoot')

  if (windows === undefined) {
    return ['afplay', sound === 'ask' ? `${$.plugin.root}/${ASK}` : `/System/Library/Sounds/${DONE.mac}`]
  }

  const file =
    sound === 'ask'
      ? `${$.plugin.root}\\${ASK.replaceAll('/', '\\')}`
      : `${windows}\\Media\\${DONE.windows}`

  return [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    // A single quote in the path is written twice inside a PowerShell string.
    `(New-Object System.Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`,
  ]
}

// Starts the sound and returns at once, so the hook does not wait for the sound to end.
const play = ($: EngineInterface, sound: Sound): void => {
  $.clock.after(1, () => {
    void (async () => {
      try {
        await $.process.run(await playerOf($, sound), { timeoutMs: 10_000 })
      } catch {
        // No player on this machine: stay silent.
      }
    })()
  })
}

export const register: Register = on => {
  // When each running main turn began, by its id.
  const startedAt = new Map<string, number>()
  let openQuestions = 0

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    startedAt.set(started.turnId, await $.clock.now())

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const began = startedAt.get(e.turnId)
    startedAt.delete(e.turnId)

    // `durationMs` leaves out the time a dialog waited for an answer, so the mod also measures itself.
    const elapsedMs = began === undefined ? 0 : (await $.clock.now()) - began

    if (e.agentId === undefined && !e.isAborted && Math.max(e.durationMs, elapsedMs) >= MIN_TURN_MS) {
      play($, 'done')
    }

    return next(e)
  })

  // Claude asks a question, or another mod asks one through the same dialog.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    play($, 'ask')
    openQuestions += 1

    try {
      return await next(e)
    } finally {
      openQuestions -= 1
    }
  })

  on('classic.Notification', ($, e, next) => {
    // While a question dialog is open, the notification is about that dialog, which had its sound.
    if (WAITING.has(e.notification_type) && openQuestions === 0) {
      play($, 'ask')
    }

    return next(e)
  })
}
