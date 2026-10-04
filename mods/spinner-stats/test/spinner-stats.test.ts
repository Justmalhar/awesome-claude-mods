import { expect, mock, test } from 'claude-code/testing'

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' }

// What next(e) draws for the Spinner: echo the suffix so the test can read it.
function stubs(on: any) {
  const clock = mock.clock(on)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.render', (_$: any, e: any) => ({ type: 'Text', props: {}, children: [e.props.suffix] }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

async function suffix($: any, props: any = SPINNER) {
  const ui: any = await $.ui.mount({ plugin: 'spinner-stats', component: 'Spinner', surface: 'terminal', viewport: { columns: 80, rows: 10 }, props })
  const text = (await ui.find({ type: 'Text' }))?.text ?? ''
  await ui.unmount()
  return text
}

test('leaves the spinner alone when no turn is running', async ($, on) => {
  stubs(on)
  expect(await suffix($)).toBe('…')
})

test('shows elapsed seconds from the clock, and the count and tool during a call', async ($, on) => {
  const clock = stubs(on)
  let during = ''
  on('tool.call', async () => {
    during = await suffix($)
    return { result: 'ran' }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/tmp' })
  await $.turn.start({ turnId: 't1', text: 'hi' })
  expect(await suffix($)).toBe('… · 0s')
  await clock.advance(3000)
  expect(await suffix($)).toBe('… · 3s')
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(during).toBe('… · 3s · Bash · 1 call')
  // tool finished: name gone, count stays
  expect(await suffix($)).toBe('… · 3s · 1 call')
  await $.tool.call({ tool: 'Read', file_path: 'a' })
  expect(await suffix($)).toBe('… · 3s · 2 calls')
})

test('subagent tool calls are not counted; turn.start resets; turn.complete stops it', async ($, on) => {
  stubs(on)
  on('tool.call', () => ({ result: 'ran' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/tmp' })
  await $.turn.start({ turnId: 't1', text: 'a' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub1' })
  expect(await suffix($)).toBe('… · 0s')
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.start({ turnId: 't2', text: 'b' })
  expect(await suffix($)).toBe('… · 0s')
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 1, isAborted: false })
  expect(await suffix($)).toBe('…')
})

test('composes with an existing suffix and tracks concurrent calls', async ($, on) => {
  stubs(on)
  const seen: string[] = []
  const gates: Array<() => void> = []
  on('tool.call', async (_$: any, e: any) => {
    await new Promise<void>((r) => gates.push(r))
    return { result: e.tool }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/tmp' })
  await $.turn.start({ turnId: 't1', text: 'a' })
  const a = $.tool.call({ tool: 'Grep', pattern: 'x' })
  const b = $.tool.call({ tool: 'Glob', pattern: 'y' })
  await Promise.resolve()
  seen.push(await suffix($, { ...SPINNER, suffix: ' · other' }))
  gates.forEach((g) => g())
  await Promise.all([a, b])
  seen.push(await suffix($))
  expect(seen[0]).toMatch(/^ · other · 0s · (Grep|Glob) · 2 calls$/)
  expect(seen[1]).toBe('… · 0s · 2 calls')
})
