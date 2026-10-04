# AGENTS.md

Notes for AI agents working in this repo. The README covers the human workflow.

- **Static analysis.** The host reads `on("event", …)` and `$.noun.method(…)` from source, and `claude plugin validate` lists them. Spell them literally. Don't loop over event names, alias `$`, or destructure it. Helpers that need the host take `$` as an argument.
- **Single file per mod.** `hooks.json` `modules` takes exactly one path, and a hooks module has no Node APIs. Don't import sibling files from a hook. Read [docs/API-NOTES.md](docs/API-NOTES.md) first: it has the verified API surface.
- **Event shape.** `tool.call` events carry `e.tool` plus the tool's own args: `command` (Bash), `file_path`/`content` (Write), `file_path`/`old_string`/`new_string` (Edit), `edits[]` (MultiEdit). Return `next(e)` to allow, `{ deny: "reason" }` to refuse.
- **The deny reason goes to the model.** Write it as an instruction. Never include the sensitive value in it.
- **Time budget.** A hook has 10 s of its own time; time inside a `$` call doesn't count. Never poll without a `$` call in the loop.
- **Guards fail closed.** A hook that throws is skipped, so a guard needs `.catch(async () => ({ deny: "…" }))`.
- **Surfaces.** Hooks run everywhere; drawing only works in the terminal and Desktop Code tab. Anything that draws needs a text fallback. Only one mod can use the `AbovePrompt` band at a time, so document it.
- **Tests use the official kit** (`*.test.ts`, `claude plugin test`). A passing test isn't proof the host behaves the same. For a new event or `$` call, also run `claude -p --plugin-dir ./mods/<name> "<prompt>"` once. Use a framing that gets the model to attempt the action, or it may refuse before the hook runs.
- **Fixtures.** Assemble token-shaped strings at runtime (`"AKIA" + "…"`). Literals get the push rejected.
- **Don't commit** `.claude-plugin/types/` (generated per mod) or `.env`.
- **Git.** Work on `cc-feature/*`, `cc-fix/*`, `cc-ui/*` branches with small, meaningful commits.
