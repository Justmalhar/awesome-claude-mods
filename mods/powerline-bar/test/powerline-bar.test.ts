import { expect, mock, test } from 'claude-code/testing'

const PORCELAIN = [
  '# branch.oid 1234567890abcdef',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 M. N... 100644 100644 100644 a b f1', // staged
  '1 .M N... 100644 100644 100644 a b f2', // unstaged
  '1 MM N... 100644 100644 100644 a b f3', // both
  '? new.txt',
].join('\n')

function stubs(on: any, o: { git?: string | null; percent?: number; band?: any; onRun?: () => void } = {}) {
  const clock = mock.clock(on)
  on('session.start', () => ({ cwd: '/Users/me/code/app' }))
  on('session.cwd', () => ({ value: '/Users/me/code/app' }))
  on('env.get', () => ({ value: '/Users/me' }))
  on('session.model', () => ({ value: 'sonnet' }))
  on('session.usage', () => ({ value: { context: { window: 200000, percent: o.percent ?? 42 } } }))
  on('process.run', () => {
    o.onRun?.()
    return o.git === null ? { deny: 'not a repo' } : { value: { exitCode: 0, stdout: o.git ?? PORCELAIN, stderr: '' } }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  // What next(e) draws: nothing from other mods.
  on('ui.render', () => o.band ?? { type: 'engine', ref: 0 })
  return clock
}

const BAND = { plugin: 'powerline-bar', component: 'AbovePrompt', surface: 'terminal', viewport: { columns: 100, rows: 30 } }
// session.start kicks off the first refresh without waiting; let it settle.
async function start($: any, clock: any) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/Users/me/code/app' })
  await clock.advance(1)
}

test('draws cwd, branch, git counts, model and context', async ($, on) => {
  const clock = stubs(on)
  await start($, clock)
  const ui = await $.ui.mount({ ...BAND, props: { bodyColumns: 100, hasSurvey: false, isWorking: false, maxRows: 5 } })
  expect(await ui.find({ type: 'Text', text: /app/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /main/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+2 ~2 \?1 ↑2 ↓1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ctx 42%/ })).toBeDefined()
  await ui.unmount()
})

test('detached HEAD shows the short SHA; clean repo shows a tick', async ($, on) => {
  const clock = stubs(on, { git: '# branch.oid 1234567890abcdef\n# branch.head (detached)' })
  await start($, clock)
  const ui = await $.ui.mount({ ...BAND, props: { bodyColumns: 100, hasSurvey: false, isWorking: false, maxRows: 5 } })
  expect(await ui.find({ type: 'Text', text: /1234567/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓/ })).toBeDefined()
  await ui.unmount()
})

test('drops segments from the right on a narrow band', async ($, on) => {
  const clock = stubs(on)
  await start($, clock)
  const ui = await $.ui.mount({ ...BAND, viewport: { columns: 20, rows: 30 }, props: { bodyColumns: 20, hasSurvey: false, isWorking: false, maxRows: 5 } })
  expect(await ui.find({ type: 'Text', text: /app/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  await ui.unmount()
})

test('outside a repo only non-git segments show', async ($, on) => {
  const clock = stubs(on, { git: null })
  await start($, clock)
  const ui = await $.ui.mount({ ...BAND, props: { bodyColumns: 100, hasSurvey: false, isWorking: false, maxRows: 5 } })
  expect(await ui.find({ type: 'Text', text: /app/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /main/ })).toBeUndefined()
  await ui.unmount()
})

test('stacks above another mod band instead of replacing it', async ($, on) => {
  const clock = stubs(on, { band: { type: 'Text', props: {}, children: ['other-mod-band'] } })
  await start($, clock)
  const ui = await $.ui.mount({ ...BAND, props: { bodyColumns: 100, hasSurvey: false, isWorking: false, maxRows: 5 } })
  expect(await ui.find({ type: 'Text', text: /app/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /other-mod-band/ })).toBeDefined()
  await ui.unmount()
})

test('turn.complete refreshes the git state', async ($, on) => {
  let calls = 0
  const clock = stubs(on, { onRun: () => calls++ })
  on('turn.complete', () => ({ text: '' }))
  await start($, clock)
  const before = calls
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1, isAborted: false })
  expect(calls > before).toBe(true)
})

test('the 5 s timer refreshes without a prompt', async ($, on) => {
  let calls = 0
  const clock = stubs(on, { onRun: () => calls++ })
  await start($, clock)
  const before = calls
  await clock.advance(5000)
  expect(calls > before).toBe(true)
})
