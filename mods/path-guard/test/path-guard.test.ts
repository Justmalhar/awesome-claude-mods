import { expect, test } from 'claude-code/testing'
// @ts-ignore: plain ESM hooks module. The kit cannot set userConfig, so the
// option rules (deny_globs, allow_outside, guard_reads) call register() directly.
import { register } from '../hooks/path-guard.mjs'

const ROOT = '/work/proj'
const HOME = '/home/me'
const denied = (r: any) => typeof r?.deny === 'string'

function stubs(on: any, opts: { repo?: string | null; cwd?: string } = {}) {
  on('tool.call', () => ({ result: 'ran' }))
  on('session.repo', () => ({ value: opts.repo === null ? null : { root: opts.repo ?? ROOT } }))
  on('session.cwd', () => ({ value: opts.cwd ?? ROOT }))
  on('env.get', () => ({ value: HOME }))
}
const w = (file_path: string, tool = 'Write') => ({ tool, file_path, content: 'x' })

// Run the real handler with a fake `$`, passing userConfig-style options.
async function direct(options: Record<string, any>, e: any, cwd = ROOT) {
  let handler: any
  register((_name: string, fn: any) => {
    handler = fn
    return { catch: () => {} }
  }, options)
  const $ = { session: { cwd: async () => cwd, repo: async () => ({ root: ROOT }) }, env: { get: async () => HOME } }
  return handler($, e, async () => ({ result: 'ran' }))
}

test('allows relative and absolute paths inside the project', async ($, on) => {
  stubs(on)
  for (const p of ['src/a.ts', './src/a.ts', `${ROOT}/src/a.ts`, 'a/b/../c.ts', ROOT + '/']) {
    expect(denied(await $.tool.call(w(p)))).toBe(false)
  }
})

test('denies absolute paths outside the project, naming the rule', async ($, on) => {
  stubs(on)
  const out: any = await $.tool.call(w('/etc/hosts'))
  expect(out.deny).toMatch(/outside the project root/)
  expect(out.deny).toMatch(/Stay inside the project/)
  expect(denied(await $.tool.call(w('/work/proj-evil/a.ts')))).toBe(true) // prefix is not containment
  expect(denied(await $.tool.call(w('/work/a.ts')))).toBe(true)
})

test('denies ../ traversal and ./a/../../x, allows .. that stays inside', async ($, on) => {
  stubs(on)
  expect(denied(await $.tool.call(w('../outside.txt')))).toBe(true)
  expect(denied(await $.tool.call(w('./a/../../x')))).toBe(true)
  expect(denied(await $.tool.call(w(`${ROOT}/src/../../../etc/passwd`)))).toBe(true)
  expect(denied(await $.tool.call(w('../../../../../../etc/passwd')))).toBe(true) // clamps at /
  expect(denied(await $.tool.call(w('a/../b.ts')))).toBe(false)
})

test('expands ~ against HOME', async ($, on) => {
  stubs(on)
  expect(denied(await $.tool.call(w('~/.bashrc')))).toBe(true)
  expect(denied(await $.tool.call(w('~')))).toBe(true)
  expect(denied(await $.tool.call(w('~user/x')))).toBe(false) // only ~ and ~/ expand; ~user is a plain relative name
})

test('resolves relative paths against cwd, not the root', async ($, on) => {
  stubs(on, { cwd: `${ROOT}/pkg` })
  expect(denied(await $.tool.call(w('../src/a.ts')))).toBe(false)
  expect(denied(await $.tool.call(w('../../x')))).toBe(true)
})

test('falls back to cwd when there is no repo', async ($, on) => {
  stubs(on, { repo: null, cwd: '/scratch/p' })
  expect(denied(await $.tool.call(w('a.ts')))).toBe(false)
  expect(denied(await $.tool.call(w('/scratch/other/a.ts')))).toBe(true)
})

test('denies writes into .git at any depth, not look-alikes', async ($, on) => {
  stubs(on)
  expect((await $.tool.call(w('.git/config')) as any).deny).toMatch(/inside \.git/)
  expect(denied(await $.tool.call(w('sub/.git/hooks/pre-commit', 'Edit')))).toBe(true)
  expect(denied(await $.tool.call(w('.github/ci.yml')))).toBe(false)
  expect(denied(await $.tool.call(w('.gitignore')))).toBe(false)
})

test('covers Write, Edit and MultiEdit; ignores Read and Bash by default', async ($, on) => {
  stubs(on)
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    expect(denied(await $.tool.call(w('/etc/x', tool)))).toBe(true)
  }
  expect(denied(await $.tool.call(w('/etc/x', 'Read')))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Bash', command: 'echo > /etc/x' }))).toBe(false)
})

test('fails closed when the host call throws', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  on('session.repo', () => ({ deny: 'boom' }))
  on('session.cwd', () => ({ value: ROOT }))
  on('env.get', () => ({ value: HOME }))
  const out: any = await $.tool.call(w('src/a.ts'))
  expect(out.deny).toMatch(/Path Guard failed/)
})

test('deny_globs: ** * ? and bare patterns', async () => {
  const o = { deny_globs: '**/*.lock, infra/**, src/?.ts, /root-only.txt, docs/*.md' }
  const d = async (p: string) => denied(await direct(o, w(p)))
  expect(await d('yarn.lock')).toBe(true) // ** matches zero directories
  expect(await d('a/b/c/Cargo.lock')).toBe(true)
  expect(await d('infra/main.tf')).toBe(true)
  expect(await d('infra/a/b/c.tf')).toBe(true)
  expect(await d('src/a.ts')).toBe(true)
  expect(await d('src/ab.ts')).toBe(false) // ? is one char
  expect(await d('root-only.txt')).toBe(true)
  expect(await d('sub/root-only.txt')).toBe(false) // a pattern with a slash is anchored to the root
  expect(await d('docs/a.md')).toBe(true)
  expect(await d('docs/x/a.md')).toBe(false) // * stops at /
  expect(await d('my-infra/x')).toBe(false)
  expect(await d('src/a.tsx')).toBe(false)
  expect(await d('lockfile.txt')).toBe(false)
})

test('deny_globs: bare pattern matches at any depth; regex chars are literal', async () => {
  const o = { deny_globs: '*.lock,a+b.txt' }
  expect(denied(await direct(o, w('deep/er/x.lock')))).toBe(true)
  expect(denied(await direct(o, w('a+b.txt')))).toBe(true)
  expect(denied(await direct(o, w('aab.txt')))).toBe(false)
  expect((await direct(o, w('x.lock')) as any).deny).toMatch(/deny_globs pattern "\*\.lock"/)
})

test('allow_outside: listed dirs and ~ are allowed, siblings are not', async () => {
  const o = { allow_outside: '/tmp, ~/scratch' }
  const d = async (p: string) => denied(await direct(o, w(p)))
  expect(await d('/tmp/a.txt')).toBe(false)
  expect(await d('/tmp/../etc/x')).toBe(true) // traversal out of the allowed dir
  expect(await d('/tmpfoo/a')).toBe(true)
  expect(await d('~/scratch/n.md')).toBe(false)
  expect(await d('~/other/n.md')).toBe(true)
  expect(await d('/tmp/.git/config')).toBe(true) // .git still denied
})

test('deny_globs also applies to allowed outside paths, by absolute path', async () => {
  const o = { allow_outside: '/tmp', deny_globs: '/tmp/secret/**' }
  expect(denied(await direct(o, w('/tmp/secret/k')))).toBe(true)
  expect(denied(await direct(o, w('/tmp/ok/k')))).toBe(false)
})

test('guard_reads: Read is checked only when enabled, .git stays readable', async () => {
  expect(denied(await direct({ guard_reads: true }, w('/etc/hosts', 'Read')))).toBe(true)
  expect(denied(await direct({ guard_reads: true }, w('.git/HEAD', 'Read')))).toBe(false)
  expect(denied(await direct({ guard_reads: false }, w('/etc/hosts', 'Read')))).toBe(false)
  expect(denied(await direct({}, w('/etc/hosts', 'Read')))).toBe(false)
})
