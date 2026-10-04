import { expect, test } from 'claude-code/testing'
// The module is also loaded as an inline plugin so a test can set `budget_usd`
// (the kit loads the mod under test with default options only).
// @ts-ignore: plain .mjs
import { meter } from '../hooks/cost-bar.mjs'

const SITE = (plugin: string) => ({
  plugin,
  component: 'AbovePrompt',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: {},
}) as any

const LIMITS = [
  { kind: 'five_hour', percentUsed: 42 },
  { kind: 'seven_day', percentUsed: 18.4 },
]

// `reading` is what $.session.usage() answers; `other` is another mod's band.
function stubs(on: any, reading: () => any, other?: any) {
  on('session.usage', () => ({ value: reading() }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => other ?? ({ type: 'Text', props: {}, children: ['theirs'] }))
}
const done = { turnId: 't', answer: 'ok', durationMs: 1, isAborted: false, usage: null }

test('draws nothing until the first reading exists', async ($, on) => {
  stubs(on, () => ({ context: {}, rateLimits: [], cost: { usd: 1 } }))
  const ui = await $.ui.mount(SITE('cost-bar'))
  expect(await ui.find({ key: 'cost-bar' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'theirs' })).toBeDefined()
})

test('shows cost and plan limits after a turn', async ($, on) => {
  stubs(on, () => ({ context: {}, rateLimits: LIMITS, cost: { usd: 1.234 } }))
  await $.turn.complete(done)
  const ui = await $.ui.mount(SITE('cost-bar'))
  expect(await ui.find({ type: 'Text', text: '$1.23' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '5h 42% · 7d 18%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /█|░/ })).toBeUndefined() // no budget set
  expect(await ui.find({ type: 'Text', text: 'theirs' })).toBeDefined() // composes with another band
})

test('session.measure refreshes the reading too', async ($, on) => {
  stubs(on, () => ({ context: {}, rateLimits: [], cost: { usd: 2 } }))
  on('session.measure', () => ({ changed: ['cost'] }))
  await $.session.measure({ context: {}, rateLimits: [], cost: { usd: 2 }, changed: ['cost'] } as any)
  const ui = await $.ui.mount(SITE('cost-bar'))
  expect(await ui.find({ type: 'Text', text: '$2.00' })).toBeDefined()
})

test('empty rateLimits omit the limits text; missing cost omits the cost', async ($, on) => {
  let reading: any = { context: {}, rateLimits: [], cost: { usd: 0.5 } }
  stubs(on, () => reading)
  await $.turn.complete(done)
  let ui = await $.ui.mount(SITE('cost-bar'))
  expect(await ui.find({ type: 'Text', text: '$0.50' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /%/ })).toBeUndefined()
  await ui.unmount()
  reading = { context: {}, rateLimits: LIMITS }
  await $.turn.complete(done)
  ui = await $.ui.mount(SITE('cost-bar'))
  expect(await ui.find({ type: 'Text', text: /^\$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '5h 42% · 7d 18%' })).toBeDefined()
})

test('nothing to show draws only the other band', async ($, on) => {
  stubs(on, () => ({ context: {}, rateLimits: [] }))
  await $.turn.complete(done)
  const ui = await $.ui.mount(SITE('cost-bar'))
  expect(await ui.find({ key: 'cost-bar' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'theirs' })).toBeDefined()
})

test('budget bar is green under 70%, yellow from 70%, red from 90%, absent without a budget', () => {
  expect(meter(5, 10)).toEqual({ color: 'green', text: '█████░░░░░ 50%' })
  expect(meter(7, 10)?.color).toBe('yellow')
  expect(meter(8.9, 10)?.color).toBe('yellow')
  expect(meter(9, 10)?.color).toBe('red')
  expect(meter(12, 10)).toEqual({ color: 'red', text: '██████████ 120%' })
  expect(meter(5, 0)).toBe(null)
  expect(meter(undefined, 10)).toBe(null)
})
