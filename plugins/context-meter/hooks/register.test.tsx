// Mod tests, run against the engine itself: `claude plugin test .`
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextUsage } from 'claude-code'

/** Everything beneath the mod: the store, the session's usage and what the engine draws. */
function world (on: On, context: SessionContextUsage = { window: 1_000_000, tokens: 100_000, percent: 10 }) {
  const store: Record<string, unknown> = {}
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context, rateLimits: [] } as never }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return e.props.modes.length > 0 ? <Box key="engine" /> : ({ type: 'engine', ref: 0 } as const)
  })
  return { store }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
const footer = ($: Engine, columns?: number) =>
  $.ui.mount({ plugin: 'context-meter', surface: 'terminal', component: 'SessionMode', props: { modes: [] }, viewport: columns === undefined ? undefined : { columns, rows: 30 } })
const measure = ($: Engine, tokens: number, window = 1_000_000) =>
  $.session.measure({ context: { tokens, window }, rateLimits: [], changed: ['context'] })

/** The bar's filled part: how many cells, and in which color. */
const barOf = async (ui: Awaited<ReturnType<typeof footer>>) => {
  const bar = (await ui.findAll({ type: 'Text' })).find(t => t.text?.includes('━'))
  return bar === undefined ? { cells: 0, color: undefined } : { cells: [...bar.text!].filter(c => c === '━').length, color: bar.props.color }
}

test('fills the bar against the limit, not the model window', { options: { limitTokens: 250_000 } }, async ($, on) => {
  world(on, { window: 1_000_000, tokens: 125_000, percent: 13 })
  await startSession($)
  const ui = await footer($)
  expect((await barOf(ui)).cells).toBe(5)
  expect(await ui.find({ type: 'Text', text: ' 50%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 125k/250k' })).toBeDefined()
})

test('the whole bar is green to 30% of the limit, orange to 80%, red after', { options: { limitTokens: 250_000 } }, async ($, on) => {
  world(on, { window: 1_000_000, tokens: 50_000 })
  await startSession($)
  expect(await barOf(await footer($))).toEqual({ cells: 2, color: 'success' })
  await measure($, 75_000)
  expect((await barOf(await footer($))).color).toBe('success')
  await measure($, 80_000)
  expect(await barOf(await footer($))).toEqual({ cells: 3, color: 'warning' })
  await measure($, 200_000)
  expect((await barOf(await footer($))).color).toBe('warning')
  await measure($, 210_000)
  expect(await barOf(await footer($))).toEqual({ cells: 8, color: 'error' })
})

test('the percentage takes the color of the zone it is in', { options: { limitTokens: 250_000 } }, async ($, on) => {
  world(on, { window: 1_000_000, tokens: 50_000 })
  await startSession($)
  expect((await (await footer($)).find({ type: 'Text', text: ' 20%' }))?.props.color).toBe('success')
  await measure($, 125_000)
  expect((await (await footer($)).find({ type: 'Text', text: ' 50%' }))?.props.color).toBe('warning')
  await measure($, 225_000)
  expect((await (await footer($)).find({ type: 'Text', text: ' 90%' }))?.props.color).toBe('error')
})

test('past the limit the bar stays full and red, and the percentage goes past 100%', { options: { limitTokens: 250_000 } }, async ($, on) => {
  world(on, { window: 1_000_000, tokens: 300_000 })
  await startSession($)
  const ui = await footer($)
  expect((await barOf(ui)).cells).toBe(10)
  expect(await ui.find({ type: 'Text', text: ' 120%' })).toBeDefined()
})

test('follows each response', { options: { limitTokens: 250_000 } }, async ($, on) => {
  world(on)
  await startSession($)
  await measure($, 275_000)
  expect(await (await footer($)).find({ type: 'Text', text: ' 110%' })).toBeDefined()
})

test('takes the limit from limitTokens', { options: { limitTokens: 500_000 } }, async ($, on) => {
  world(on, { window: 1_000_000, tokens: 250_000 })
  await startSession($)
  const ui = await footer($)
  expect((await barOf(ui)).cells).toBe(5)
  expect(await ui.find({ type: 'Text', text: ' 250k/500k' })).toBeDefined()
})

test('a limit past the model window is the window', { options: { limitTokens: 500_000 } }, async ($, on) => {
  world(on, { window: 200_000, tokens: 100_000 })
  await startSession($)
  expect(await (await footer($)).find({ type: 'Text', text: ' 100k/200k' })).toBeDefined()
})

test('with no limit set, the model window is the whole bar', async ($, on) => {
  world(on, { window: 1_000_000, tokens: 500_000 })
  await startSession($)
  const ui = await footer($)
  expect((await barOf(ui)).cells).toBe(5)
  expect(await ui.find({ type: 'Text', text: ' 50%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 500k/1M' })).toBeDefined()
})

test('shows nothing before the first response', async ($, on) => {
  world(on, { window: 1_000_000 })
  await startSession($)
  expect(await (await footer($)).find({ type: 'Text', text: 'ctx' })).toBeUndefined()
})

test('starts over when the window is cleared', async ($, on) => {
  world(on)
  await startSession($)
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
  expect(await (await footer($)).find({ type: 'Text', text: 'ctx' })).toBeUndefined()
})

test('keeps the last reading for the next session', async ($, on) => {
  const w = world(on, { window: 1_000_000 })
  await startSession($)
  await measure($, 90_000)
  expect(w.store.fill).toEqual({ tokens: 90_000, window: 1_000_000 })
})

test('in a narrow terminal the bar goes and the figures stay', { options: { limitTokens: 250_000 } }, async ($, on) => {
  world(on)
  await startSession($)
  const ui = await footer($, 70)
  expect(await ui.find({ type: 'Text', text: ' 40%' })).toBeDefined()
  expect((await barOf(ui)).cells).toBe(0)
})
