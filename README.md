# awesome-claude-mods

A curated collection of [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview): plugins of JavaScript event handlers that guard tool calls, add commands, and draw their own UI inside Claude Code. Each mod is a complete, dependency-free plugin you can read in one sitting.

> A mod runs with your permissions and is not sandboxed. Read the source and the declared `hooks:` / `calls:` before you install one.

| Mod | What it does | Hooks | Draws in |
|---|---|---|---|
| [`secret-guard`](mods/secret-guard/) | Blocks Write, Edit and Bash calls that would put an API key, token or private key into a file or command. | `tool.call` | Nothing |
| [`path-guard`](mods/path-guard/) | Blocks Write, Edit and MultiEdit calls that target a path outside the project root or inside .git, plus optional deny globs. | `tool.call` | Nothing |
| [`branch-guard`](mods/branch-guard/) | Stops Claude from editing files or running mutating git commands on main or master, and points it at a worktree instead. | `tool.call` | Nothing |
| [`sensitive-file-guard`](mods/sensitive-file-guard/) | Blocks Read, Write, Edit, Grep, Glob and Bash calls that touch .env files, private keys and credential stores. | `tool.call` | Nothing |
| [`test-guard`](mods/test-guard/) | Blocks edits that make tests pass by weakening them: new skip/only markers, fewer assertions, a gutted test file, or deleting a test file. | `tool.call` | Nothing |
| [`powerline-bar`](mods/powerline-bar/) | A one-row powerline-style band above the prompt: directory, git branch and state, model, context fill. | `session.start, turn.complete, ui.render` | Band above prompt |
| [`cost-bar`](mods/cost-bar/) | A one-row band above the prompt with session cost, 5h/7d plan limits and an optional budget bar. | `turn.complete, session.measure, ui.render` | Band above prompt |
| [`spinner-stats`](mods/spinner-stats/) | Adds elapsed time, the running tool and the tool-call count to Claude Code's own spinner. | `session.start, turn.start, tool.call, turn.complete, ui.render` | Spinner |
| [`file-tree-pane`](mods/file-tree-pane/) | Adds /tree: a side pane with a lazy file tree coloured by git status. Press a file to put @path in the prompt. | `session.start, command.run, turn.complete, ui.render` | Side pane |
| [`auto-checkpoint`](mods/auto-checkpoint/) | Snapshots the working tree into hidden git refs at the start of every turn, with /checkpoints to list them and /undo-turn to roll back. | `turn.start, session.start, command.run` | Nothing |
| [`notify-on-finish`](mods/notify-on-finish/) | Sends a desktop notification when a long turn finishes, so you can look away while Claude works. | `turn.complete` | Nothing |

Each mod's README lists the exact `$` calls it makes, checked by CI.

Requires Claude Code 2.1.287 or later.

## Install

```bash
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install secret-guard@awesome-claude-mods --scope user
# or try one for a single session
git clone https://github.com/justmalhar/awesome-claude-mods && cd awesome-claude-mods
claude --plugin-dir ./mods/secret-guard
```

After installing while a session is open, run `/reload-plugins`.

## Contributing

1. Copy the layout of `mods/secret-guard/` and the README from [`_template/`](_template/README.md).
2. One file of code in `hooks/`, no dependencies, no build step.
3. Add `test/<name>.test.ts` with the official kit (`claude-code/testing`). See [docs/API-NOTES.md](docs/API-NOTES.md).
4. `npm test && npm run validate` must pass (`claude plugin test` + `claude plugin validate`). CI also fails if the README's `hooks:`/`calls:` lines differ from the validator's.
5. Add the mod to `.claude-plugin/marketplace.json` and the table above.

Never put a real-looking token in a fixture. Build it at runtime, as the tests do, or GitHub push protection will reject the push.

See [PRD.md](PRD.md), [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) and [AGENTS.md](AGENTS.md).
