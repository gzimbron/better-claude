/** The context window's fill, as the last API response reported it. */
export type Fill = { tokens: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { fill: Fill | null }
  }
}
