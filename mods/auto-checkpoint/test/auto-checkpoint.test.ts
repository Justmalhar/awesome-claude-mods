import { expect, test } from 'claude-code/testing'

// A scripted fake git: process.run is stubbed and answers by which script the mod sent.
// The real git behaviour (temp index, restore, pruning) was verified separately in a throwaway repo.
type Call = { script: string; args: string[] }
function fake($on: any, opts: { stdout?: (s: string) => string; answer?: string | 'reject' } = {}) {
  $on('turn.start', () => ({ turnId: 't' }))
  const calls: Call[] = []
  const asks: string[] = []
  $on('process.run', (_$: any, e: any) => {
    const [, , script, , ...args] = e.argv
    calls.push({ script, args })
    return { value: { exitCode: 0, stdout: (opts.stdout ?? (() => ''))(script), stderr: '' } }
  })
  $on('session.cwd', () => ({ value: '/repo' }))
  $on('clock.now', () => ({ value: 1_700_000_000_000 }))
  const reg: any[] = []
  $on('command.register', (_$: any, e: any) => {
    reg.push(e)
    return { value: { command: e.name } }
  })
  // $.ui.ask reaches the stub as a tool.call of AskUserQuestion
  $on('tool.call', (_$: any, e: any) => {
    const q = e.questions[0].question
    asks.push(q)
    return opts.answer === 'reject' ? { deny: 'dismissed' } : { result: { answers: { [q]: opts.answer ?? 'Restore' } } }
  })
  return { calls, asks, reg }
}

test('turn.start takes a snapshot through a temp index and prunes to the cap', async ($, on) => {
  const { calls } = fake(on)
  await $.turn.start({ text: 'hi', turnId: 'turn-1' })
  expect(calls.length).toBe(1)
  const { script, args } = calls[0]
  expect(args).toEqual(['1700000000-turn-1', '20'])
  expect(script).toMatch(/commit-tree/)
  expect(script).toMatch(/GIT_INDEX_FILE/)
  expect(script).toMatch(/update-ref -d/) // pruning beyond the cap
  // never touches the user's index, HEAD, branches or stash
  expect(script).not.toMatch(/git (stash|reset|clean)|checkout|update-ref HEAD/)
})

test('turn.start never blocks the turn when git fails', async ($, on) => {
  on('process.run', () => ({ deny: 'spawn failed' }))
  on('turn.start', () => ({ turnId: 't' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  const out: any = await $.turn.start({ text: 'hi', turnId: 't' })
  expect(out.turnId).toBe('t')
})

test('commands say so when the directory is not a repo, and never ask', async ($, on) => {
  const { asks } = fake(on, { stdout: () => 'NOTREPO\n' })
  const a: any = await $.command.run({ command: 'checkpoints', args: '' })
  const b: any = await $.command.run({ command: 'undo-turn', args: '' })
  expect(a.text).toMatch(/Not a git repository/)
  expect(b.text).toMatch(/Not a git repository/)
  expect(asks.length).toBe(0)
})

test('/checkpoints lists, or says there are none', async ($, on) => {
  fake(on, { stdout: () => '1700-t1 | 2 minutes ago | 1 file changed, 2 insertions(+)\n' })
  const out: any = await $.command.run({ command: 'checkpoints', args: '' })
  expect(out.text).toMatch(/1700-t1 \| 2 minutes ago \| 1 file changed/)
})

test('/checkpoints with nothing stored', async ($, on) => {
  fake(on)
  const out: any = await $.command.run({ command: 'checkpoints', args: '' })
  expect(out.text).toBe('No checkpoints yet.')
})

const PREVIEW_OUT = 'checkpoint 1700-t1\n a.txt | 2 +-\n--- would remove (new since checkpoint):\nnew.txt\n'
const byScript = (s: string) => (/git restore/.test(s) ? 'restored 1700-t1, removed 1 new file(s); to redo: /undo-turn pre-undo-1700000000' : PREVIEW_OUT)

test('/undo-turn confirms with the diffstat, then restores (pre-undo snapshot first)', async ($, on) => {
  const { calls, asks } = fake(on, { stdout: byScript })
  const out: any = await $.command.run({ command: 'undo-turn', args: '' })
  expect(asks.length).toBe(1)
  expect(asks[0]).toMatch(/a\.txt \| 2/)
  expect(asks[0]).toMatch(/new\.txt/)
  expect(calls.length).toBe(2) // preview, restore
  const restore = calls[1].script
  expect(calls[1].args).toEqual(['', '1700000000'])
  expect(restore.indexOf('pre-undo-')).toBeLessThan(restore.indexOf('git restore'))
  expect(restore).not.toMatch(/git clean|reset --hard|git checkout/)
  expect(out.text).toMatch(/restored 1700-t1/)
})

test('/undo-turn changes nothing when declined or dismissed', async ($, on) => {
  const a = fake(on, { stdout: byScript, answer: 'Cancel' })
  const out: any = await $.command.run({ command: 'undo-turn', args: '' })
  expect(out.text).toMatch(/cancelled/)
  expect(a.calls.length).toBe(1) // preview only
})

test('/undo-turn treats a dismissed question as a decline', async ($, on) => {
  const a = fake(on, { stdout: byScript, answer: 'reject' })
  const out: any = await $.command.run({ command: 'undo-turn', args: '' })
  expect(out.text).toMatch(/cancelled/)
  expect(a.calls.length).toBe(1)
})

test('/undo-turn with no checkpoint, and with an explicit name', async ($, on) => {
  const a = fake(on, { stdout: () => 'NOCKPT\n' })
  const out: any = await $.command.run({ command: 'undo-turn', args: '' })
  expect(out.text).toBe('No checkpoint to restore.')
  expect(a.asks.length).toBe(0)
})

test('/undo-turn accepts a checkpoint name, e.g. a pre-undo one', async ($, on) => {
  const { calls } = fake(on, { stdout: byScript })
  await $.command.run({ command: 'undo-turn', args: 'refs/claude-checkpoints/pre-undo-5' })
  expect(calls[0].args[0]).toBe('pre-undo-5')
})

test('registers both commands, /undo-turn without immediate', async ($, on) => {
  const { reg } = fake(on)
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/repo' })
  expect(reg.map((r) => r.name)).toEqual(['checkpoints', 'undo-turn'])
  expect(reg[1].immediate).toBeUndefined()
})
