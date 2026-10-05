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
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && !e.isAborted && e.durationMs >= MIN_TURN_MS) {
      play($, 'done')
    }

    return next(e)
  })

  // Claude asks a question, or another mod asks one through the same dialog.
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    play($, 'ask')

    return next(e)
  })

  on('classic.Notification', ($, e, next) => {
    if (WAITING.has(e.notification_type)) {
      play($, 'ask')
    }

    return next(e)
  })
}
