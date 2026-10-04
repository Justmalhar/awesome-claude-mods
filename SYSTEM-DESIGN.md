# SYSTEM-DESIGN: awesome-claude-mods

## Functional requirements
See PRD FR1-FR4.

## Non-functional requirements
Zero dependencies, fast CI (under a minute), deterministic tests, fail-safe guards.

## High-level design
A static repo, no backend. Claude Code reads `.claude-plugin/marketplace.json`, installs a plugin from `mods/<name>`, and loads its hooks module in-process.

```
user ── /plugin install ──► marketplace.json ──► mods/<name>/
                                                   ├─ .claude-plugin/plugin.json   manifest
                                                   └─ hooks/hooks.json ─► <name>.mjs  register(on)
Claude Code ── event ──► handler($, e, next) ──► next(e) | rewrite | { deny }
                              └─ $ calls (declared, listed by `claude plugin validate`)
```

## Low-level design

### Mod anatomy
| File | Role |
|---|---|
| `.claude-plugin/plugin.json` | name, version, description, author |
| `hooks/hooks.json` | `{ description, modules: ["./x.mjs"] }` |
| `hooks/x.mjs` | `export function register(on)`; the only code |
| `test/x.test.mjs` | `node:test` against `lib/mock-host.mjs` |
| `README.md` | from `_template/`, with the validator's `hooks:`/`calls:` lines |
| `.gitignore` | `.claude-plugin/types/` |

### secret-sentinel
`tool.call` → skip unless `e.tool` ∈ {Write, Edit, MultiEdit, Bash} and the file isn't `*.example|sample|template` → `textOf(e)` joins command/content/new_string/edits → `scan` per line (skip lines with `secret-sentinel:allow`) → `matchLine`: provider regexes first, then a generic `key = "value"` rule gated by Shannon entropy ≥ 3.5 and a placeholder filter → `{ deny }` with kind, line, redacted prefix. All regexes are linear-time.

### Test harness
`lib/mock-host.mjs` registers handlers, filters by event fields, chains `next`, and records `$.ui.toast`. Extend `$` when a mod needs more.

### CI
`npm test`, then `scripts/validate.sh`: `claude plugin validate` per mod, and a check that the README contains the reported `hooks:` and `calls:` lines.

## REST API routes
None.

## DB schema
None.

## Package dependencies
None at runtime. Dev: Node 22+, the `claude` CLI for validation.

## Frontend / Backend / DB
Not applicable. Mods that draw use Claude Code's own elements (`Box`, `Text`, `Button`) inside a `Pane` or the `AbovePrompt` band.

## Security model
Mods are unsandboxed and can approve tool calls. Mitigations: no dependencies, declared calls cross-checked in CI, review by reading one file, and README limitations stated plainly.
