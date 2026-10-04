import { expect, test } from 'claude-code/testing'

type Call = string[]

// Stubs every host call the hook makes; records process.run argv and toasts.
function stubs(on: any, o: { uname?: string; unameFails?: boolean; runFails?: boolean; cwd?: string } = {}) {
  const runs: Call[] = []
  const toasts: string[] = []
  on('turn.complete', () => ({ text: '' }))
  on('session.cwd', () => ({ value: o.cwd ?? '/home/me/my-repo' }))
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = e.argv ?? e
    if (argv[0] === 'uname') {
      if (o.unameFails) return { deny: 'no uname' }
      return { value: { exitCode: 0, stdout: (o.uname ?? 'Darwin') + '\n', stderr: '' } }
    }
    runs.push(argv)
    if (o.runFails) return { deny: 'spawn failed' }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { runs, toasts }
}

const done = (over: any = {}) => ({ turnId: 't1', answer: 'All done', durationMs: 30_000, isAborted: false, reason: 'answer', ...over })

test('below the threshold: no notification', async ($, on) => {
  const s = stubs(on)
  await $.turn.complete(done({ durationMs: 5_000 }))
  expect(s.runs.length).toBe(0)
  expect(s.toasts.length).toBe(0)
})

test('above the threshold on macOS: one osascript call with argv', async ($, on) => {
  const s = stubs(on)
  await $.turn.complete(done({ answer: 'Fixed\n  the   bug' }))
  expect(s.runs.length).toBe(1)
  const a = s.runs[0]
  expect(a[0]).toBe('osascript')
  expect(a.slice(-3)).toEqual(['--', 'Fixed the bug', 'my-repo'])
  expect(a).toContain('display notification (item 1 of argv) with title (item 2 of argv)')
})

test('empty answer says how long it took; body is capped at 100 chars', async ($, on) => {
  const s = stubs(on)
  await $.turn.complete(done({ answer: '', durationMs: 42_000 }))
  expect(s.runs[0].slice(-2)).toEqual(['Finished in 42s', 'my-repo'])
  await $.turn.complete(done({ answer: 'x'.repeat(300) }))
  expect(s.runs[1][s.runs[1].length - 2].length).toBe(100)
})

test('aborted turns and subagent turns are ignored', async ($, on) => {
  const s = stubs(on)
  await $.turn.complete(done({ isAborted: true, reason: 'aborted' }))
  await $.turn.complete(done({ agentId: 'sub-1' }))
  expect(s.runs.length).toBe(0)
})

test('Linux uses notify-send', async ($, on) => {
  const s = stubs(on, { uname: 'Linux' })
  await $.turn.complete(done())
  expect(s.runs).toEqual([['notify-send', '--', 'my-repo', 'All done']])
})

test('other platforms fall back to a toast', async ($, on) => {
  const s = stubs(on, { uname: 'FreeBSD' })
  await $.turn.complete(done())
  expect(s.runs.length).toBe(0)
  expect(s.toasts).toEqual(['my-repo: All done'])
})

test('uname failure falls back to a toast and does not throw', async ($, on) => {
  const s = stubs(on, { unameFails: true })
  await $.turn.complete(done())
  expect(s.toasts.length).toBe(1)
})

test('a rejected notification command is swallowed', async ($, on) => {
  stubs(on, { runFails: true })
  const out: any = await $.turn.complete(done())
  expect(out).toBeDefined()
})

test('quotes, backslashes and newlines reach argv unchanged', async ($, on) => {
  const s = stubs(on)
  await $.turn.complete(done({ answer: `say "hi" \\ it's \`x\` $(rm -rf /)` }))
  expect(s.runs[0].slice(-2)[0]).toBe(`say "hi" \\ it's \`x\` $(rm -rf /)`)
  // the AppleScript source never contains the text
  expect(s.runs[0].slice(0, -3).join('').includes('rm -rf')).toBe(false)
})
