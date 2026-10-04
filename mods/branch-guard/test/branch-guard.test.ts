import { expect, test } from 'claude-code/testing'

const denied = (r: any) => typeof r?.deny === 'string'

// Fake git: branch is what `git branch --show-current` prints, repo=false makes rev-parse fail.
function stubs(on: any, o: { branch?: string; repo?: boolean; answer?: string | 'reject' } = {}, asked: string[] = []) {
  const { branch = 'main', repo = true, answer = 'Refuse' } = o
  // $.ui.ask reaches the stub as a tool.call of AskUserQuestion; every other tool.call is the edit itself
  on('tool.call', ($: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    asked.push(e.questions[0].question)
    return answer === 'reject' ? { deny: 'dismissed' } : { result: { answers: { [e.questions[0].question]: answer } } }
  })
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('process.run', ($: any, e: any) => {
    const cmd = (e.argv ?? []).join(' ')
    if (cmd.includes('rev-parse')) return { value: { exitCode: repo ? 0 : 128, stdout: repo ? '/work/proj\n' : '', stderr: '' } }
    return { value: { exitCode: 0, stdout: branch + '\n', stderr: '' } }
  })
}

const write = (p = '/work/proj/a.ts') => ({ tool: 'Write', file_path: p, content: 'x' })

test('on main: Refuse denies with the worktree instruction', async ($, on) => {
  const asked: string[] = []
  stubs(on, { answer: 'Refuse' }, asked)
  const out: any = await $.tool.call(write())
  expect(denied(out)).toBe(true)
  expect(out.deny).toMatch(/git worktree add \.\.\/proj-<slug> -b cc-feature\/<slug>/)
  expect(asked.length).toBe(1)
  expect(asked[0]).toMatch(/You're on main/)
})

test('on main: Create worktree also denies; Edit and MultiEdit are guarded too', async ($, on) => {
  stubs(on, { answer: 'Create worktree (recommended)' })
  expect(denied(await $.tool.call({ tool: 'Edit', file_path: '/work/proj/a.ts', old_string: 'a', new_string: 'b' }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'MultiEdit', file_path: '/work/proj/a.ts', edits: [] }))).toBe(true)
})

test('on a feature branch: passes without asking', async ($, on) => {
  const asked: string[] = []
  stubs(on, { branch: 'cc-feature/x' }, asked)
  expect(denied(await $.tool.call(write()))).toBe(false)
  expect(asked.length).toBe(0)
})

test('detached HEAD is not protected', async ($, on) => {
  stubs(on, { branch: '' })
  expect(denied(await $.tool.call(write()))).toBe(false)
})

test('not a git repo, or a file outside the repo: passes', async ($, on) => {
  stubs(on, { repo: false })
  expect(denied(await $.tool.call(write()))).toBe(false)
})

test('file outside the session repo passes even on main', async ($, on) => {
  stubs(on, {})
  expect(denied(await $.tool.call(write('/elsewhere/a.ts')))).toBe(false)
})

test('Edit anyway is remembered for the repo and branch', async ($, on) => {
  const asked: string[] = []
  stubs(on, { answer: 'Edit anyway' }, asked)
  expect(denied(await $.tool.call(write()))).toBe(false)
  expect(denied(await $.tool.call(write()))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Bash', command: 'git commit -m x' }))).toBe(false)
  expect(asked.length).toBe(1)
})

test('a dismissed or non-interactive ask denies', async ($, on) => {
  stubs(on, { answer: 'reject' })
  const out: any = await $.tool.call(write())
  expect(out.deny).toMatch(/git worktree add/)
})

test('mutating git in Bash is guarded, read-only git and other commands are not', async ($, on) => {
  stubs(on, { answer: 'Refuse' })
  for (const command of ['git commit -m x', 'git push origin main', 'cd a && git -C b reset --hard', 'git rebase -i HEAD~2', 'git cherry-pick abc']) {
    expect(denied(await $.tool.call({ tool: 'Bash', command }))).toBe(true)
  }
  for (const command of ['git status', 'git log --oneline', 'git diff', 'ls']) {
    expect(denied(await $.tool.call({ tool: 'Bash', command }))).toBe(false)
  }
})

test('fails closed when git itself fails to run', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('process.run', () => ({ deny: 'spawn failed' }))
  expect(denied(await $.tool.call(write()))).toBe(true)
})
