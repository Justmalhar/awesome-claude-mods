import { expect, test } from 'claude-code/testing'

const ROOT = '/work/proj'
// A virtual project: no real disk is read.
const baseTree = (): Record<string, [string, string][]> => ({
  [ROOT]: [['src', 'dir'], ['README.md', 'file'], ['.git', 'dir'], ['node_modules', 'dir'], ['.DS_Store', 'file'], ['new.txt', 'file']],
  [`${ROOT}/src`]: [['a.ts', 'file'], ['gone.ts', 'file']],
})
const STATUS = ' M src/a.ts\n D src/gone.ts\n?? new.txt\nA  README.md\n'

type Log = { toasts: string[]; fills: any[]; draft: string; fillOk: boolean; tree: Record<string, [string, string][]>; runs: number; gitExit: number; opens: any[]; isPlaced: boolean }

function stubs(on: any, o: Partial<Log> = {}) {
  const log: Log = { toasts: [], fills: [], draft: '', fillOk: true, tree: baseTree(), runs: 0, gitExit: 0, opens: [], isPlaced: true, ...o }
  on('session.start', () => ({ cwd: ROOT }))
  on('command.register', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.repo', () => ({ value: { root: ROOT } }))
  on('process.run', () => {
    log.runs++
    return { value: { exitCode: log.gitExit, stdout: log.gitExit ? '' : STATUS, stderr: '' } }
  })
  on('fs.list', (_: any, e: any) => ({ value: (log.tree[e.path ?? e.dir] ?? []).map(([name, kind]) => ({ name, kind, size: 1, isLink: false })) }))
  on('prompt.read', () => ({ value: { text: log.draft, cursor: log.draft.length } }))
  on('prompt.fill', (_: any, e: any) => {
    log.fills.push({ text: e.text, mode: e.mode })
    if (log.fillOk) log.draft += e.text
    return { value: { isFilled: log.fillOk, text: log.draft, cursor: log.draft.length } }
  })
  on('ui.toast', (_: any, e: any) => {
    log.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_: any, e: any) => {
    log.opens.push(e)
    return { value: log.isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'too narrow' } }
  })
  return log
}

const mount = ($: any, columns = 60) =>
  $.ui.mount({ plugin: 'file-tree-pane', component: 'Pane', surface: 'terminal', requestId: 'file-tree-pane', viewport: { columns, rows: 30 }, props: { bodyColumns: columns } })

async function openTree($: any) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: ROOT })
  await $.command.run({ command: 'tree', args: '' })
}

test('/tree opens the pane with focus and one git status run', async ($, on) => {
  const log = stubs(on)
  await openTree($)
  expect(log.opens[0]).toMatchObject({ id: 'file-tree-pane', title: 'Files', focus: true, closeOnEscape: true })
  expect(log.runs).toBe(1)
})

test('toasts the reason when the pane is not placed', async ($, on) => {
  const log = stubs(on, { isPlaced: false })
  await openTree($)
  expect(log.toasts).toContain('too narrow')
})

test('hides .git, node_modules and .DS_Store; folders first; lazy until expanded', async ($, on) => {
  stubs(on)
  await openTree($)
  const ui = await mount($)
  expect(await ui.find({ key: `${ROOT}/src` })).toBeDefined()
  expect(await ui.find({ key: `${ROOT}/README.md` })).toBeDefined()
  expect(await ui.find({ key: `${ROOT}/.git` })).toBeUndefined()
  expect(await ui.find({ key: `${ROOT}/node_modules` })).toBeUndefined()
  expect(await ui.find({ key: `${ROOT}/.DS_Store` })).toBeUndefined()
  expect(await ui.find({ key: `${ROOT}/src/a.ts` })).toBeUndefined()
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons[0].key).toBe(`${ROOT}/src`)
  await ui.unmount()
})

test('pressing a directory expands then collapses it', async ($, on) => {
  stubs(on)
  await openTree($)
  const ui = await mount($)
  await ui.press({ key: `${ROOT}/src` })
  expect(await ui.find({ key: `${ROOT}/src/a.ts` })).toBeDefined()
  await ui.press({ key: `${ROOT}/src` })
  expect(await ui.find({ key: `${ROOT}/src/a.ts` })).toBeUndefined()
  await ui.unmount()
})

test('colours files by git status and marks changed directories', async ($, on) => {
  stubs(on)
  await openTree($)
  const ui = await mount($)
  await ui.press({ key: `${ROOT}/src` })
  const color = async (path: string) => {
    const row: any = await ui.find({ key: `r:${path}` })
    return JSON.stringify(row)
  }
  expect(await color(`${ROOT}/src/a.ts`)).toMatch(/yellow/)
  expect(await color(`${ROOT}/src/gone.ts`)).toMatch(/red/)
  expect(await color(`${ROOT}/README.md`)).toMatch(/green/)
  expect(await color(`${ROOT}/new.txt`)).toMatch(/cyan/)
  expect(await color(`${ROOT}/src`)).toMatch(/yellow/) // contains changes
  await ui.unmount()
})

test('pressing files appends @paths, separated, with mode append', async ($, on) => {
  const log = stubs(on)
  await openTree($)
  const ui = await mount($)
  await ui.press({ key: `${ROOT}/README.md` })
  await ui.press({ key: `${ROOT}/new.txt` })
  expect(log.fills[0]).toEqual({ text: '@README.md ', mode: 'append' })
  expect(log.fills[1].mode).toBe('append')
  expect(log.draft).toBe('@README.md @new.txt ')
  await ui.unmount()
})

test('adds a space when the draft does not end in whitespace', async ($, on) => {
  const log = stubs(on, { draft: 'look at' })
  await openTree($)
  const ui = await mount($)
  await ui.press({ key: `${ROOT}/README.md` })
  expect(log.draft).toBe('look at @README.md ')
  await ui.unmount()
})

test('toasts when the prompt refuses the text', async ($, on) => {
  const log = stubs(on, { fillOk: false })
  await openTree($)
  const ui = await mount($)
  await ui.press({ key: `${ROOT}/README.md` })
  expect(log.toasts.length).toBe(1)
  await ui.unmount()
})

test('the filter box narrows visible rows by substring', async ($, on) => {
  stubs(on)
  await openTree($)
  const ui = await mount($)
  await ui.input({ key: 'filter', text: 'read' })
  expect(await ui.find({ key: `${ROOT}/README.md` })).toBeDefined()
  expect(await ui.find({ key: `${ROOT}/new.txt` })).toBeUndefined()
  await ui.input({ key: 'filter', text: 'zzz' })
  expect(await ui.find({ type: 'Text', text: /No match/ })).toBeDefined()
  await ui.input({ key: 'filter', text: '' })
  expect(await ui.find({ key: `${ROOT}/new.txt` })).toBeDefined()
  await ui.unmount()
})

test('caps rendered rows at 200 with a +N more line', async ($, on) => {
  const log = stubs(on)
  const TREE = log.tree
  TREE[`${ROOT}/big`] = Array.from({ length: 250 }, (_, i): [string, string] => [`f${String(i).padStart(3, '0')}.txt`, 'file'])
  TREE[ROOT] = [...TREE[ROOT], ['big', 'dir']]
  await openTree($)
  const ui = await mount($)
  await ui.press({ key: `${ROOT}/big` })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(200)
  expect(await ui.find({ type: 'Text', text: /\+\d+ more/ })).toBeDefined()
  await ui.unmount()
})

test('truncates long names to the pane width', async ($, on) => {
  const log = stubs(on)
  log.tree[ROOT] = [['x'.repeat(120) + '.txt', 'file']]
  await openTree($)
  const ui: any = await mount($, 30)
  const b: any = (await ui.findAll({ type: 'Button' }))[0]
  expect(b.props.label.length).toBe(26) // columns - 4
  await ui.unmount()
})

test('turn.complete refreshes git status once the pane has been opened', async ($, on) => {
  const log = stubs(on)
  on('turn.complete', () => ({ text: '' }))
  await openTree($)
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1, isAborted: false })
  expect(log.runs).toBe(2)
})

test('git failure still draws the tree, uncoloured', async ($, on) => {
  stubs(on, { gitExit: 128 })
  await openTree($)
  const ui = await mount($)
  expect(await ui.find({ key: `${ROOT}/README.md` })).toBeDefined()
  await ui.unmount()
})
