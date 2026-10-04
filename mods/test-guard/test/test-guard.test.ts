import { expect, test } from 'claude-code/testing'

const denied = (r: any) => typeof r?.deny === 'string'

// `files` is the on-disk state the hook sees through $.fs; nothing else runs.
function stubs(on: any, files: Record<string, string> = {}) {
  on('tool.call', () => ({ result: 'ran' }))
  // the host resolves relative paths against cwd, so match on the suffix
  const key = (p: string) => Object.keys(files).find((k) => p.endsWith(k))
  on('fs.exists', ($: any, e: any) => ({ value: key(e.path) !== undefined }))
  on('fs.read', ($: any, e: any) => ({ value: files[key(e.path)!] }))
}

const T = 'src/foo.test.js'
const edit = (old_string: string, new_string: string, file_path = T) => ({ tool: 'Edit', file_path, old_string, new_string })

test('blocks new skip/only markers', async ($, on) => {
  stubs(on)
  for (const m of ['it.skip("a", f)', 'it.only("a", f)', 'xit("a", f)', 'xdescribe("a", f)', 'it.todo("a")', 'test.todo("a")',
    '@pytest.mark.skip\ndef test_a(): pass', '@unittest.skip("x")', 't.Skip("x")', 'pending("x")']) {
    expect(denied(await $.tool.call(edit('it("a", f)', m)))).toBe(true)
  }
})

test('the reason is an instruction: fix the code, ask the user', async ($, on) => {
  stubs(on)
  const out: any = await $.tool.call(edit('it("a", f)', 'it.skip("a", f)'))
  expect(out.deny).toMatch(/skip\/only/)
  expect(out.deny).toMatch(/Fix the code under test/)
  expect(out.deny).toMatch(/ask the user/)
})

test('blocks an Edit and a MultiEdit that lower the assertion count', async ($, on) => {
  stubs(on)
  const out: any = await $.tool.call(edit('expect(a).toBe(1)\nexpect(b).toBe(2)', 'expect(a).toBe(1)'))
  expect(out.deny).toMatch(/from 2 to 1/)
  const multi = { tool: 'MultiEdit', file_path: 'tests/x.js', edits: [
    { old_string: 'expect(a)', new_string: 'expect(a)' },
    { old_string: 'expect(b)\nexpect(c)', new_string: 'expect(b)' },
  ] }
  expect(denied(await $.tool.call(multi))).toBe(true)
  expect(denied(await $.tool.call(edit('assert x == 1', 'pass', 'test_a.py')))).toBe(true)
  expect(denied(await $.tool.call(edit('t.Fatal("x")', '', 'a_test.go')))).toBe(true)
})

test('blocks a Write that drops assertions or halves an existing file', async ($, on) => {
  stubs(on, { 'a/x.spec.ts': 'expect(1)\nexpect(2)\nl3\nl4\nl5\nl6' })
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'a/x.spec.ts', content: 'expect(1)\nl3\nl4\nl5' }))).toBe(true)
  const out: any = await $.tool.call({ tool: 'Write', file_path: 'a/x.spec.ts', content: 'expect(1)\nexpect(2)' })
  expect(out.deny).toMatch(/shrinks the file from 6 to 2/)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'a/x.spec.ts', content: 'expect(1)\nexpect(2)\nl3\nl4\nl5\nexpect(3)' }))).toBe(false)
})

test('blocks rm, git rm and git checkout -- of a test file', async ($, on) => {
  stubs(on)
  for (const command of ['rm src/foo.test.js', 'rm -f tests/', 'git rm src/a.spec.ts', 'git checkout -- pkg/a_test.go',
    'cd x && rm test_a.py']) {
    expect(denied(await $.tool.call({ tool: 'Bash', command }))).toBe(true)
  }
})

test('allows renames, new tests, added assertions, non-test edits and non-test rm', async ($, on) => {
  stubs(on, { 'a/new.test.js': 'it("a", f)', 'src/real.js': 'x' })
  expect(denied(await $.tool.call(edit('it("old name", f)', 'it("new name", f)')))).toBe(false)
  expect(denied(await $.tool.call(edit('it("a", f)', 'it("a", f)\nit("b", () => { expect(1).toBe(1) })')))).toBe(false)
  expect(denied(await $.tool.call(edit('expect(a)', 'expect(a)\nexpect(b)')))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'new/brand.test.js', content: 'it("a", () => expect(1))' }))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'a/new.test.js', content: 'it("a", f)\nit("b", f)' }))).toBe(false)
  expect(denied(await $.tool.call(edit('x', 'x.skip(1)', 'src/real.js')))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Bash', command: 'rm src/real.js && cat a.test.js' }))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Read', file_path: T }))).toBe(false)
})

test('leaves an existing skip alone and tolerates no assertion removal', async ($, on) => {
  stubs(on)
  // marker already present before and after: not newly introduced
  expect(denied(await $.tool.call(edit('it.skip("a", f) // old', 'it.skip("a", f) // kept')))).toBe(false)
  // documented limit: removing a duplicate assertion is still flagged
  expect(denied(await $.tool.call(edit('expect(a)\nexpect(a)', 'expect(a)')))).toBe(true)
})

test('fails closed when the file read throws', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ deny: 'too big' }))
  const out: any = await $.tool.call({ tool: 'Write', file_path: 'a/big.test.js', content: 'x' })
  expect(out.deny).toMatch(/Test Guard failed/)
})
