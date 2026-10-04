import { expect, test } from 'claude-code/testing'

const denied = (r: any) => typeof r?.deny === 'string'
const run = ($: any, on: any) => on('tool.call', () => ({ result: 'ran' }))

test('blocks sensitive paths in Read, Write, Edit, MultiEdit, Grep and Glob', async ($, on) => {
  run($, on)
  const paths = ['.env', '.env.local', 'config/.env.production', '~/.ssh/id_ed25519', 'certs/server.pem', '~/.aws/credentials', '~/.npmrc', '~/.netrc']
  for (const p of paths) {
    expect(denied(await $.tool.call({ tool: 'Read', file_path: p }))).toBe(true)
  }
  expect(denied(await $.tool.call({ tool: 'Write', file_path: '.env', content: 'x' }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'Edit', file_path: 'a/.env', old_string: 'a', new_string: 'b' }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'MultiEdit', file_path: 'k.p12', edits: [] }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'Grep', pattern: 'x', path: '~/.ssh' }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'Glob', pattern: '**/.env' }))).toBe(true)
})

test('allows templates and look-alikes', async ($, on) => {
  run($, on)
  for (const p of ['.env.example', '.env.sample', '.environment.md', 'src/environment.ts', '~/.ssh/id_rsa.pub']) {
    expect(denied(await $.tool.call({ tool: 'Read', file_path: p }))).toBe(false)
  }
})

test('blocks Bash that names a sensitive file', async ($, on) => {
  run($, on)
  for (const command of ['cat .env', 'less ~/.ssh/id_rsa', 'cp .env /tmp', 'base64 < .env', 'source .env', 'cat "config/.env.local"', 'echo x>.env']) {
    expect(denied(await $.tool.call({ tool: 'Bash', command }))).toBe(true)
  }
})

test('lets harmless Bash through', async ($, on) => {
  run($, on)
  for (const command of ['ls -la', 'echo hello', 'git add .env.example']) {
    const out: any = await $.tool.call({ tool: 'Bash', command })
    expect(out.result).toBe('ran')
  }
})

test('the reason names the pattern and never the path contents', async ($, on) => {
  run($, on)
  const out: any = await $.tool.call({ tool: 'Read', file_path: 'app/.env' })
  expect(out.deny).toMatch(/matching "\.env"/)
  expect(out.deny).toMatch(/paste only/)
})

test('ignores other tools', async ($, on) => {
  run($, on)
  const out: any = await $.tool.call({ tool: 'WebFetch', url: 'https://x/.env' })
  expect(out.result).toBe('ran')
})
