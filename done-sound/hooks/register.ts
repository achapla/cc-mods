import type { EngineInterface, Register } from 'claude-code'

// A turn shorter than this ends without a sound: you are still looking at the screen.
export const MIN_TURN_MS = 10_000

// The sound files of the system, for Windows and for macOS.
const SOUNDS = {
  done: { windows: 'chimes.wav', mac: 'Glass.aiff' },
  ask: { windows: 'notify.wav', mac: 'Ping.aiff' },
} as const

type Sound = keyof typeof SOUNDS

// The notifications that mean Claude Code waits for an answer.
const WAITING = new Set(['permission_prompt', 'elicitation_dialog'])

// The command that plays the sound on this machine. `$.audio.play` plays nothing in a Windows terminal.
const playerOf = async ($: EngineInterface, sound: Sound): Promise<string[]> => {
  const windows = await $.env.get('SystemRoot')

  if (windows === undefined) {
    return ['afplay', `/System/Library/Sounds/${SOUNDS[sound].mac}`]
  }

  const file = `${windows}\\Media\\${SOUNDS[sound].windows}`

  return [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(New-Object System.Media.SoundPlayer '${file}').PlaySync()`,
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
