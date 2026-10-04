# Mods API notes (verified against the docs and `claude-code.d.ts`, Claude Code 2.1.289)

Read this before writing a mod. Sources: code.claude.com/docs/en/plugins/mods/{reference,interface,api,events,test} and
https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts (13k lines; Claude Code also writes it to
`<mod>/.claude-plugin/types/` on load: grep it for exact types).

## Layout
- `.claude-plugin/plugin.json` (name, version, description, author, optional `userConfig`), `hooks/hooks.json` = `{"modules":["./x.mjs"]}` **one path only**.
- One hooks module per mod: `export function register(on, options)`. `options` = `userConfig` values with defaults filled in. Module has **no Node APIs, no setTimeout, no fetch**: only standard JS + `$`. **Do not import sibling files.** Use `.mjs`/`.js` or `.ts`.
- Write `on("event", …)` and `$.namespace.method(…)` literally (the validator reads them from source). Never alias or destructure `$`.
- `on("same.event")` twice with no matcher = load error. Put all `session.start` work in one hook; `command.register` last (it throws on a taken name; wrap in try/catch).
- Matcher: `{ tool: "Bash" }`, `{ tool: ["Edit","Write"] }`, `{ tool: /^mcp__/ }`, `{ component: "Pane" }`, `{ command: "x" }`.
- Handler `($, e, next)`. `e` is deeply frozen. `next(e)` passes on (resolves to the result). Pass `next({...e, field})` to rewrite. Return without `next` to answer.
- A hook that throws/times out before `next` is **skipped** (fail open). Guards must add `.catch(async ($, e, next) => ({ deny: "…" }))` to fail closed. `next.error.kind` is `throw|timeout`.
- Hook's own execution budget: 10 s (time inside `$` calls other than `$.clock.sleep` doesn't count). Never busy-wait.

## Events (return shapes)
- `tool.call` (`e.tool` + tool args as fields: Bash `command`; Write `file_path`,`content`; Edit `file_path`,`old_string`,`new_string`,`replace_all`; MultiEdit `file_path`,`edits[]`; Read `file_path`): `next(e)` | `{deny: reason}` | `{result}`. `await next(e)` resolves to the tool result (`{deny}` or `isError` when refused/failed). Deny text is read by Claude: write it as an instruction, never include secrets.
- `tool.check` (`e.input` = tool args): `await next(e)` is the permission decision; return `{decision:"allow"|"ask"|"deny", reason}`.
- `prompt.submit` (`e.text`,`e.context`): `next({...e,text})`, `next({...e,context:[...]})`, `{drop: reason}`.
- `turn.start` (`e.turnId`), `turn.step` (async generator, `yield* next(e)`, `result.usage`), `turn.complete` (`e.turnId,answer,durationMs,isAborted,usage`; may return `{text}` for a line under the answer).
- `session.start` (once per mod; register commands/timers here, `$.clock.every(ms, fn)`), `session.end`, `session.compact` (`{skip: reason}`), `session.measure`.
- `command.run` with `{command:"name"}`: return `{text}` (printed + read by Claude) or `{}`. Register in `session.start` via `$.command.register({name, description, argumentHint?, immediate?})`. `e.args` = text after the name.
- `classic.Stop`, `classic.PostToolUse`, … = settings-hook events (`e` is the stdin JSON incl. `transcript_path`).
- `ui.render` with `{component}`: `Pane | AbovePrompt | Spinner | ToolUse | ToolResult | AskUserQuestion | PromptHint | …`.

## `$` namespaces you will use
`$.ui`: `resolve(e)`→`{Box,Text,Button,Input,Select,Link,Code,Markdown,Raster,…}`, `invalidate("ui.render")`, `open({id,title,focus?,closeOnEscape?,rows?,columns?})`→`{isPlaced,reason?}`, `close({id})`, `toast(text)`, `log(text)` (dim transcript line), `status(text)` (line under prompt, prefixed ⚠ + mod name), `ask(question, options[])`→label (rejects if dismissed or `claude -p`).
`$.session`: `cwd()`, `repo()`→`{root,remote,…}|null`, `model()`, `usage()`→`{context:{tokens,window,percent}, rateLimits:[{kind,percentUsed,resetsAt}], cost?}`, `messages()`, `id()`, `compact()`.
`$.process.run(argv[], {cwd,timeoutMs})`→`{exitCode,stdout,stderr}` (no shell; rejects on spawn failure/timeout; default 30 s, max 10 min). `$.process.spawn` streams.
`$.fs`: `read, write, exists, stat, list(dir)→[{name,kind,size,isLink}] (not recursive), ancestors`. 4 MiB cap. `$.store`: `get,set,delete,keys` JSON, shared across sessions. `$.state` + `atom/read/update` from `"claude-code"` needs a `types` d.ts (avoid unless needed).
`$.clock`: `now()`, `sleep(ms)`, `after(ms,fn)`, `every(ms,fn)` → timer with `.cancel()`. `$.http.fetch(url)`. `$.env.get("NAME")` (literal name). `$.audio.play/speak`. `$.model.complete({model:"haiku",system,prompt,maxTokens,timeoutMs})`→`{isAnswered,text,reason}`; `$.model.classify(text,labels)`. `$.prompt.fill({text, mode?})`→`{isFilled}` (puts text in the prompt box), `$.prompt.read()`, `$.prompt.submit({text, asUser?})`. `$.mcp.call`. `$.agent.*`.
Every `$` call is also an event (`fs.read`, `ui.open`, …).

## Drawing
- **AbovePrompt band composes.** Return a tree to draw; to keep other mods' drawing, include `await next(e)` as a child: `Box({flexDirection:"column", children:[mine, await next(e)]})`. Return `next(e)` to draw nothing. Keep it to ONE row unless you have a reason.
- **Pane**: `await $.ui.open({id, title, …})` from a command/press (appears at any width) or automatically (only ≥144 cols, else `{isPlaced:false}`). In `ui.render {component:"Pane"}` check `e.requestId === id`. Width: `e.props.bodyColumns`. `e.surface` = `terminal|desktop`.
- Spinner: `next({...e, props:{...e.props, suffix:" · x"}})` composes with other mods.
- Elements: `Box` (flex: `flexDirection, columnGap, padding, borderStyle`), `Text` (`color, bold, dimColor, italic, wrap`), `Button` (`key,label,onPress,hotkey,plain,autoFocus`), `Input` (`key,label,placeholder,value,submitLabel,onSubmit,onInput`). Give every control a `key`. Unknown props make Claude Code discard the tree.
- No raw key capture: users reach controls by Tab/arrows/Enter or `hotkey` (one digit or lowercase letter). Esc returns focus to the prompt.
- Redraw: callbacks change a module variable then `$.ui.invalidate("ui.render")`. Throttled to 10/s. Periodic data: `$.clock.every(ms, () => $.ui.invalidate("ui.render"))` started in `session.start`.
- Module-level variables reset on reload; persist with `$.store`.

## Testing (official)
`*.test.ts` in the mod dir, run with `claude plugin test <dir>` (no session/network). `import { expect, mock, test } from "claude-code/testing"`.
- `test(name, async ($, on) => {…})`. `$` fires events through your hooks: `$.tool.call({tool,…})`, `$.command.run({command,args})`, `$.session.start({surface:"terminal",isInteractive:true,cwd})`, `$.turn.start/complete`, `$.prompt.submit`, `$.classic.Stop(...)`.
- `on(name, stub)` answers Claude Code. Register all stubs **before the first `$` call**. Mods-API stubs return `{value}` (or `{deny}` to make the call reject): `process.run` → `{value:{exitCode,stdout,stderr}}`, `fs.read`, `store.get/set`, `ui.toast/log/open/close/status` → `{value:undefined}` (`ui.open` → `{value:{isPlaced:true}}`), `session.cwd`, `session.usage`, `command.register`. Event stubs return the event result (`tool.call` → `{result:"ran"}`, `session.start` → `{cwd}`, `turn.complete` → `{text:""}`, `ui.render` → `{type:"Text",props:{},children:["x"]}`).
- `session.start` does not run by itself: stub `command.register` then `await $.session.start(...)` if your hook needs it.
- Drawings: `const ui = await $.ui.mount({plugin:"<name>", component:"AbovePrompt", surface:"terminal", viewport:{columns:100,rows:30}, props:{…}})`, then `ui.find({type:"Text", text:/x/})`, `ui.press({key})`, `ui.input({key,text})`, `ui.unmount()`. For a composing band stub `ui.render` (what `next(e)` draws).
- `mock.clock(on)` gives a controllable clock (`await clock.advance(ms)`); `mock.store(on, {k:v})`, `mock.env(on,{…})`.
- Assertions: `toBe, toEqual, toMatch, toMatchObject, toContain, toBeDefined, toBeUndefined, toThrow`, `.not`.
- Every distinct `$` call a hook makes needs a stub or the call rejects `no implementation for <name>`.

## Live check (once per mod)
`claude -p --model haiku --permission-mode acceptEdits --plugin-dir ./mods/<name> "<prompt>"`. Models often refuse secret-looking writes themselves; frame the prompt as a test fixture so the tool call actually fires. UI mods can't be seen in `-p`; they are covered by `$.ui.mount` tests and `claude plugin validate`.
