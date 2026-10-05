// Every color of the line. Change a value here to change that part's color.
export const COLORS = {
  user: '#7aa2f7',
  model: '#bb9af7',
  effort: '#7dcfff',
  cost: '#e0af68',
  // A bar and its percent: below 75%, from 75%, from 90%.
  // A limit window with a pace: on track, a bit fast, too fast.
  low: '#9ece6a',
  high: '#ff9e64',
  full: '#f7768e',
  // A limit window that is used slowly, so part of it will be lost at the reset.
  slow: '#2ac3de',
} as const
