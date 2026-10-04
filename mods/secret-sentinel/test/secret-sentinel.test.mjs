import { test } from "node:test";
import assert from "node:assert/strict";
import { mockHost } from "../../../lib/mock-host.mjs";
import { register } from "../hooks/secret-sentinel.mjs";

// Fixtures are assembled at runtime so no real-looking token sits in the repo
// (GitHub push protection would reject it).
const AWS = "AKIA" + "ABCDEFGH12345678";
const GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
const ANT = "sk-ant-" + "api03-Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1";
const PEM = "-----BEGIN " + "RSA PRIVATE KEY-----";

async function run(e) {
  const h = mockHost();
  register(h.on);
  return { out: await h.emit("tool.call", e), h };
}
const denied = (r) => typeof r.out?.deny === "string";

test("blocks provider keys in Write, Edit, MultiEdit and Bash", async () => {
  assert.ok(denied(await run({ tool: "Write", file_path: "a.js", content: `const k = "${AWS}"` })));
  assert.ok(denied(await run({ tool: "Edit", file_path: "a.js", new_string: `t=${GH}` })));
  assert.ok(denied(await run({ tool: "MultiEdit", file_path: "a.js", edits: [{ new_string: "ok" }, { new_string: ANT }] })));
  assert.ok(denied(await run({ tool: "Bash", command: `curl -H "Authorization: Bearer ${ANT}" x` })));
  assert.ok(denied(await run({ tool: "Write", file_path: "k.pem", content: `${PEM}\nabc` })));
});

test("the reason never contains the secret, and says where", async () => {
  const { out, h } = await run({ tool: "Write", file_path: "a.js", content: `x\ny = "${AWS}"` });
  assert.ok(!out.deny.includes(AWS));
  assert.match(out.deny, /AWS access key.*line 2/);
  assert.equal(h.calls.toast.length, 1);
});

test("blocks a random-looking hard-coded credential, not placeholders or env reads", async () => {
  const random = "Zx9Qw8Er7Ty6Ui5Op4As3Df2";
  assert.ok(denied(await run({ tool: "Write", file_path: "c.py", content: `password = "${random}"` })));
  for (const content of [
    'api_key = "your-api-key-goes-here"',
    'api_key = os.environ["API_KEY"]',
    'token = "aaaaaaaaaaaaaaaaaaaaaaaa"',
    'const api_key = "<paste key here>"',
  ]) {
    assert.ok(!denied(await run({ tool: "Write", file_path: "c.py", content })), content);
  }
});

test("ignores other tools, template files, and lines marked allow", async () => {
  assert.ok(!denied(await run({ tool: "Read", file_path: "a.js", content: AWS })));
  assert.ok(!denied(await run({ tool: "Write", file_path: ".env.example", content: `KEY=${AWS}` })));
  assert.ok(!denied(await run({ tool: "Write", file_path: "a.js", content: `k = "${AWS}" // secret-sentinel:allow` })));
});

test("lets harmless calls through unchanged", async () => {
  const e = { tool: "Bash", command: "git status && ls -la" };
  assert.deepEqual((await run(e)).out, e);
});
