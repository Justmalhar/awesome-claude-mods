# awesome-claude-mods

A curated collection of [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview): plugins of JavaScript event handlers that guard tool calls, add commands, and draw their own UI inside Claude Code. Each mod is a complete, dependency-free plugin you can read in one sitting.

> A mod runs with your permissions and is not sandboxed. Read the source and the declared `hooks:` / `calls:` before you install one.

| Mod | What it does | Hooks | Calls | Draws in |
|---|---|---|---|---|
| [`secret-sentinel`](mods/secret-sentinel/) | Blocks Write, Edit and Bash calls that contain an API key, token or private key. | `tool.call` | `$.ui.toast` | Nothing (toast only) |

Requires Claude Code 2.1.287 or later.

## Install

```bash
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install secret-sentinel@awesome-claude-mods --scope user
# or try one for a single session
git clone https://github.com/justmalhar/awesome-claude-mods && cd awesome-claude-mods
claude --plugin-dir ./mods/secret-sentinel
```

After installing while a session is open, run `/reload-plugins`.

## Contributing

1. Copy the layout of `mods/secret-sentinel/` and the README from [`_template/`](_template/README.md).
2. One file of code in `hooks/`, no dependencies, no build step.
3. Add tests in `test/` using [`lib/mock-host.mjs`](lib/mock-host.mjs).
4. `npm test && npm run validate` must pass. CI also fails if the README's `hooks:`/`calls:` lines differ from the validator's.
5. Add the mod to `.claude-plugin/marketplace.json` and the table above.

Never put a real-looking token in a fixture. Build it at runtime, as the tests do, or GitHub push protection will reject the push.

See [PRD.md](PRD.md), [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) and [AGENTS.md](AGENTS.md).
