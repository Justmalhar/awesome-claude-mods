import { expect, test } from 'claude-code/testing'

// Fixtures are assembled at runtime so no real-looking token sits in the repo
// (GitHub push protection would reject it).
const AWS = 'AKIA' + 'ABCDEFGH12345678'
const GH = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const ANT = 'sk-ant-' + 'api03-Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1'
const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----'

const denied = (r: any) => typeof r?.deny === 'string'

// No tool runs: the stub answers when the hook lets a call through.
function stubs(on: any, toasts: string[] = []) {
  on('tool.call', () => ({ result: 'ran' }))
  on('ui.toast', ($: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
}

test('blocks provider keys in Write, Edit, MultiEdit and Bash', async ($, on) => {
  stubs(on)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'a.js', content: `const k = "${AWS}"` }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'Edit', file_path: 'a.js', new_string: `t=${GH}` }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'MultiEdit', file_path: 'a.js', edits: [{ new_string: 'ok' }, { new_string: ANT }] }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'Bash', command: `curl -H "Authorization: Bearer ${ANT}" x` }))).toBe(true)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'k.pem', content: `${PEM}\nabc` }))).toBe(true)
})

test('the reason never contains the secret, and says where', async ($, on) => {
  const toasts: string[] = []
  stubs(on, toasts)
  const out: any = await $.tool.call({ tool: 'Write', file_path: 'a.js', content: `x\ny = "${AWS}"` })
  expect(out.deny.includes(AWS)).toBe(false)
  expect(out.deny).toMatch(/AWS access key.*line 2/)
  expect(toasts.length).toBe(1)
})

test('blocks a random-looking hard-coded credential, not placeholders or env reads', async ($, on) => {
  stubs(on)
  const random = 'Zx9Qw8Er7Ty6Ui5Op4As3Df2'
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'c.py', content: `password = "${random}"` }))).toBe(true)
  for (const content of [
    'api_key = "your-api-key-goes-here"',
    'api_key = os.environ["API_KEY"]',
    'token = "aaaaaaaaaaaaaaaaaaaaaaaa"',
    'const api_key = "<paste key here>"',
  ]) {
    expect(denied(await $.tool.call({ tool: 'Write', file_path: 'c.py', content }))).toBe(false)
  }
})

test('ignores other tools, template files, and lines marked allow', async ($, on) => {
  stubs(on)
  expect(denied(await $.tool.call({ tool: 'Read', file_path: 'a.js', content: AWS }))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: '.env.example', content: `KEY=${AWS}` }))).toBe(false)
  expect(denied(await $.tool.call({ tool: 'Write', file_path: 'a.js', content: `k = "${AWS}" // secret-guard:allow` }))).toBe(false)
})

test('lets harmless calls through', async ($, on) => {
  stubs(on)
  const out: any = await $.tool.call({ tool: 'Bash', command: 'git status && ls -la' })
  expect(out.result).toBe('ran')
})
