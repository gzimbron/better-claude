import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { Fill } from '../types'

const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, null as Fill | null)

const CELLS = 10
// Where the bar changes color, as a share of the limit: all green up to the first, all orange up to the second, all red after.
const ORANGE_FROM = 0.3
const RED_FROM = 0.8
// Below this many terminal columns the bar goes and the figures stay.
const NARROW = 90
const SEPARATOR = ' · '

/** The color of the whole bar at that share of the limit. */
const zoneOf = (share: number) => (share > RED_FROM ? 'error' : share > ORANGE_FROM ? 'warning' : 'success')

/** The fill the meter shows, from what the engine measured; none until a response of the live window reports one. */
const fillOf = (context: SessionContextUsage): Fill | null =>
  context.tokens === undefined ? null : { tokens: context.tokens, window: context.window }

/** "850", "42k", "1.2M": a token count in few columns. */
function short (tokens: number) {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** Keeps the latest reading for the meter, and for the next session until a response reports again. */
async function remember ($: EngineInterface, found: Fill) {
  await update($, fill, () => found)
  await $.store.set('fill', found)
}

export const register: Register = (on, options) => {
  // Unset, the limit is the model's own window.
  const configured = Number(options.limitTokens)
  const limitTokens = configured > 0 ? configured : Infinity

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('fill')
    if (saved !== null && typeof saved === 'object') await update($, fill, () => saved as Fill)

    const usage = await $.session.usage()
    const first = fillOf(usage.context)
    if (first !== null) await remember($, first)
    return next(e)
  })

  // A cleared or compacted window reports no fill until its next response: the meter starts over.
  on('session.measure', async ($, e, next) => {
    const found = fillOf(e.context)
    if (found !== null) await remember($, found)
    else if (e.changed.includes('context')) await update($, fill, () => null)
    return next(e)
  })

  // Bottom right of the prompt footer, before what is beneath it (the engine's mode labels, another plugin's meter).
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const found = await read($, fill)
    if (found === null) return next(e)

    // The bar is the limit, never past the model's window: one color for the whole bar, by how full it is.
    const limit = Math.min(limitTokens, found.window)
    const ratio = found.tokens / limit
    const filled = Math.round(Math.min(ratio, 1) * CELLS)
    const color = zoneOf(ratio)
    const percent = `${Math.round(ratio * 100)}%`
    const hasBar = e.surface !== 'terminal' || e.viewport === undefined || e.viewport.columns >= NARROW
    const beneath = await next(e)
    const hasBeneath = e.props.modes.length > 0 || (beneath !== undefined && beneath !== null && beneath !== '')

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        <Text dimColor>ctx</Text>
        {hasBar ? <Text color={color}>{' ' + '━'.repeat(filled)}</Text> : null}
        {hasBar ? <Text dimColor>{'─'.repeat(CELLS - filled)}</Text> : null}
        <Text color={color}>{` ${percent}`}</Text>
        <Text dimColor>{` ${short(found.tokens)}/${short(limit)}`}</Text>
        {hasBeneath ? <Text dimColor>{SEPARATOR}</Text> : null}
        {beneath}
      </Box>
    )
  })
}
