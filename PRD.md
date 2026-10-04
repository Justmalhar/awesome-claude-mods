# PRD: awesome-claude-mods

## Problem
Claude Code mods are new. Anthropic's playground has three samples; there is no community catalogue, no shared test harness, and no way to see what a mod can do before installing it. Mods run unsandboxed with the user's permissions, so trust is the main adoption barrier.

## Users
- **Claude Code users** who want guardrails, observability or workflow helpers and need to judge the risk quickly.
- **Mod authors** who want a working layout, a test harness and a review bar.

## Goals
1. Every mod is installable with one `claude plugin install` command from this repo's marketplace.
2. Every mod's README states exactly the hooks and calls it uses, verified by CI.
3. Every mod has tests that run with `node --test`, with no Claude Code session.
4. Mods are small, dependency-free, and readable as a tutorial.

## Non-goals
- A mod framework, build step or bundler.
- Hosting mods that need network services or secrets.
- Replacing permission rules or secret scanners. Mods here are safety nets.

## Functional requirements
- FR1 Marketplace manifest lists every mod.
- FR2 `npm test` runs all mod tests; `npm run validate` runs the validator and the README cross-check.
- FR3 A mod template and contribution steps exist.
- FR4 Each mod README documents limitations and the surfaces it works on.

## Non-functional requirements
- No runtime dependencies. Works on Node 22+ for tests; Claude Code 2.1.287+ for mods.
- Mods must fail safe: a guard that errors must not silently leak what it guards.
- No secret-shaped literals in the repo.

## Roadmap
| Order | Mod | Why |
|---|---|---|
| 1 | `secret-sentinel` (shipped) | Clear value, sets the guard pattern |
| 2 | `path-fence` | Per-project allow/deny globs on file tools |
| 3 | `branch-guard` | Refuse writes on main, nudge to a worktree |
| 4 | `auto-checkpoint` | WIP commit per turn plus `/undo-turn` |
| 5 | `egress-allowlist` | Ask before `curl`/`wget` to unknown hosts |
| 6 | `cost-ticker` | Spinner suffix with session cost via `$.session.usage` |
| 7 | `model-router` | Cheap model for trivial turns (verify the API first) |
| 8 | `test-on-stop` | Run tests at turn end, feed failures back |

Open question: whether hook modules may import siblings, which decides if guards can share a `classify` helper. Verify against the reference docs.

## Success metrics
Mods merged with passing CI; stars and installs; zero reports of a mod leaking what it guards.
