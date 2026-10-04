<div align="center">

# Awesome Claude Mods

**Guardrails, status bars, panes and workflow helpers for [Claude Code](https://code.claude.com), written as [mods](https://code.claude.com/docs/en/plugins/mods/overview).**

[![validate](https://github.com/Justmalhar/awesome-claude-mods/actions/workflows/validate.yml/badge.svg)](https://github.com/Justmalhar/awesome-claude-mods/actions/workflows/validate.yml)
![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-d97757)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Mods](https://img.shields.io/badge/mods-11-blue)

</div>

Every mod here is a single readable file with no dependencies and no build step. Each one has tests, and CI checks that its README states exactly which hooks and `$` calls it uses. Install one, install the bundle, or read the source and write your own.

## Contents

- [Available Mods](#available-mods)
  - [Guards](#guards) · [Status and prompt](#status-and-prompt) · [Panes](#panes) · [Workflow](#workflow)
- [Quick start](#quick-start)
- [What is a mod?](#what-is-a-mod)
- [Bundles](#bundles)
- [Configure a mod](#configure-a-mod)
- [Trust and safety](#trust-and-safety)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Resources](#resources)

## Available Mods

Install any of these with the [quick start](#quick-start) below. Names say what a mod does. A `*-guard` blocks or asks, a `*-bar` draws above the prompt, and a `*-pane` opens a side pane. Each link goes to the mod's own README, which lists its limits and the exact hooks and calls it makes.

### Guards

Each runs on `tool.call` and refuses with a message that tells Claude what to do instead. They fail closed: if a guard itself errors, the call is denied rather than let through.

- [`secret-guard`](mods/secret-guard/) - Blocks Write, Edit and Bash calls that would put an API key, token or private key into a file or command. The denial never repeats the secret.
- [`sensitive-file-guard`](mods/sensitive-file-guard/) - Blocks Read, Write, Edit, Grep, Glob and Bash calls that touch `.env` files, private keys, and credential stores such as `~/.ssh` and `~/.aws`.
- [`path-guard`](mods/path-guard/) - Keeps file edits inside the project root and out of `.git`. Optional deny globs and an allow-outside list.
- [`branch-guard`](mods/branch-guard/) - Asks before Claude edits files or runs mutating git on `main` or `master`, and points it at a `git worktree` instead.
- [`test-guard`](mods/test-guard/) - Stops Claude from making tests pass by weakening them: new `.skip`/`.only`, fewer assertions, gutted or deleted test files.

### Status and prompt

Bands compose: each mod puts the previous one's drawing inside its own, so these stack instead of fighting over the space.

- [`powerline-bar`](mods/powerline-bar/) - One row above the prompt with directory, git branch and state (staged, unstaged, untracked, ahead/behind), model, and context fill. Drops segments from the right in a narrow terminal.
- [`cost-bar`](mods/cost-bar/) - Session cost, 5-hour and 7-day plan limits, and an optional budget bar that turns yellow and red as you spend.
- [`spinner-stats`](mods/spinner-stats/) - Adds elapsed time, the running tool, and the tool-call count to Claude Code's own spinner without replacing it.

### Panes

- [`file-tree-pane`](mods/file-tree-pane/) - `/tree` opens a lazy file tree coloured by git status. Press a file to put `@path` in your prompt. Filter box included.

### Workflow

- [`auto-checkpoint`](mods/auto-checkpoint/) - Snapshots your working tree into hidden git refs at the start of every turn, without touching your index, stash or branches. `/checkpoints` lists them and `/undo-turn` rolls back, after asking.
- [`notify-on-finish`](mods/notify-on-finish/) - Desktop notification when a long turn ends, so you can look away. macOS, with a Linux fallback.

## Quick start

```bash
# 1. Add this repo as a marketplace
claude plugin marketplace add Justmalhar/awesome-claude-mods

# 2. Install what you want
claude plugin install secret-guard@awesome-claude-mods --scope user
claude plugin install powerline-bar@awesome-claude-mods --scope user

# 3. In an open session, load them without restarting
/reload-plugins
```

Try a mod for one session without installing it:

```bash
git clone https://github.com/Justmalhar/awesome-claude-mods && cd awesome-claude-mods
claude --plugin-dir ./mods/powerline-bar
```

Install everything:

```bash
for m in $(ls mods); do claude plugin install "$m@awesome-claude-mods" --scope user; done
```

## What is a mod?

A mod is a Claude Code plugin whose JavaScript handlers run **inside** Claude Code. A handler is called when something happens (a tool call, a submitted prompt, the spinner being drawn). It can observe the event, change it, or take it over. That lets a mod do what settings hooks, skills and MCP servers can't:

- **Block or rewrite a tool call** before it runs, with a reason Claude can act on
- **Draw** a pane, a band above the prompt, or restyle the spinner
- **Add `/commands`** that run instantly, even while Claude is working
- **Keep state** across events, so one handler records and another shows it

Mods need Claude Code **2.1.287 or later**. Drawing works in the terminal and the Desktop Code tab. In the VS Code extension and `claude -p`, handlers still run but nothing is drawn.

## Bundles

| Goal | Install |
|---|---|
| **Safe defaults** for any project | `secret-guard` `sensitive-file-guard` `path-guard` `branch-guard` |
| **Terminal dashboard** | `powerline-bar` `cost-bar` `spinner-stats` `file-tree-pane` |
| **Let Claude run longer** | `auto-checkpoint` `test-guard` `notify-on-finish` |

## Configure a mod

Mods with options declare them in their manifest. Set them in `/plugin configure <mod>@awesome-claude-mods`, or from the shell:

```bash
claude plugin install cost-bar@awesome-claude-mods --config budget_usd=20
```

| Mod | Options |
|---|---|
| `powerline-bar` | `segments`: comma-separated, default `cwd,branch,git,model,context` |
| `cost-bar` | `budget_usd`: empty means no budget bar |
| `path-guard` | `deny_globs`, `allow_outside`, `guard_reads` |
| `branch-guard` | `protected_branches`: default `main,master` |
| `auto-checkpoint` | `keep`: snapshots to retain, default 20 |
| `notify-on-finish` | `threshold_seconds`: default 20, and `sound` |

## Trust and safety

A mod is code that runs with your permissions, inside Claude Code. It isn't sandboxed and can read your files, start processes, and approve tool calls. So:

- **Read before you install.** Every mod is one file. Or list what it does without running it: `claude plugin validate ./mods/<name>` prints its `hooks:` and `calls:`.
- **Check the README matches.** CI fails any mod whose README differs from the validator's output.
- **Guards are safety nets, not security boundaries.** They match patterns, so shell indirection like `$(cat .env)` slips past. Use permission rules, sandboxing, and push protection as the real gate. Each guard's README lists what it misses.
- **Nothing here calls a network service.** The few that start processes run local tools only (`git`, `osascript`, `notify-send`, `sh`).

## Roadmap

11 shipped, about 45 planned: more guards (`network-guard`, `dependency-guard`, `sql-guard`, `shell-guard`, `loop-guard`), more panes (`search-pane`, `git-log-pane`, `todo-board-pane`), workflow (`test-on-stop`, `format-on-edit`, `worktree-manager`) and observability (`audit-log`, `tool-timeline-pane`). The full list and status is in [CATALOGUE.md](CATALOGUE.md). Want one sooner? Open an issue.

## Contributing

New mods are welcome, and so are fixes to the existing ones.

1. Copy the layout of [`mods/secret-guard/`](mods/secret-guard/) and its README from [`_template/`](_template/README.md).
2. One hooks file in `hooks/`, no dependencies, no build step, no imports between files.
3. Name it for the feature: `*-guard`, `*-bar`, `*-pane`, or `<thing>-on-<event>`.
4. Add `test/<name>.test.ts` with the official kit. Read [docs/API-NOTES.md](docs/API-NOTES.md) first for the verified API surface and the pitfalls.
5. `npm test && npm run validate` must pass. Add the mod to `.claude-plugin/marketplace.json`, this README and [CATALOGUE.md](CATALOGUE.md).
6. Guards must fail closed, and a mod's README must say what it can't do.

Never put a real-looking token in a fixture. Build it at runtime, as the tests do, or GitHub push protection rejects the push. AI agents working here should also read [AGENTS.md](AGENTS.md). Product and design notes: [PRD.md](PRD.md), [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md).

## Resources

- [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview), [create a mod](https://code.claude.com/docs/en/plugins/mods/create), [events](https://code.claude.com/docs/en/plugins/mods/events), [interface](https://code.claude.com/docs/en/plugins/mods/interface), [API](https://code.claude.com/docs/en/plugins/mods/api), [testing](https://code.claude.com/docs/en/plugins/mods/test)
- [Official sample mods](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods): `token-weather`, `blast-radius`, `replay-theater`
- [Source of Claude Code's built-in mods](https://github.com/anthropics/claude-code/tree/main/mods) and the [TypeScript declarations](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts)

---

Shared as-is. Not an official Anthropic product.
