# Powerline Bar

A one-row coloured band above the prompt: working directory, git branch with state glyphs, model, and context fill.

```
 app   ⎇ main   +2 ~2 ?1 ↑2 ↓1   sonnet   ctx 42%
```

Each segment is a block with its own background. The git blocks are green when clean, yellow when dirty (staged, unstaged or untracked files) and red on merge conflicts. The context block turns yellow at 60% and red at 85%.

## What this shows
`ui.render` for the `AbovePrompt` site, a cached refresh driven by `session.start`, `turn.complete` and `$.clock.every`, one `git status` run through `$.process.run`, and a band that composes with other mods' bands.

## Demo
Not run in a live session: the drawing is covered by `$.ui.mount` tests only (no screenshot). Segments, colours and narrow-width behaviour come from those tests.

## How it works
`refresh()` reads the directory, model and context, and runs `git status --porcelain=v2 --branch` once. It caches the result and redraws only when it changed. It runs on `session.start`, after every `turn.complete`, and every 5 seconds. Drawing never spawns git.

- **Branch**: the branch name, or the short SHA when HEAD is detached.
- **Git glyphs**: `+n` staged, `~n` unstaged, `?n` untracked, `!n` conflicts, `↑n` ahead, `↓n` behind, `✓` clean.
- **Narrow terminals**: segments are dropped from the right until the row fits `bodyColumns`. It never wraps.
- **Other bands**: the bar returns a column of `[bar, theirs]` when another mod draws in the band, and just the bar otherwise.
- **Errors**: a missing `git`, a non-repo directory or a 3 s timeout hides the git blocks. The draw hook catches everything and falls back to `next(e)`.

Config: `segments`, a comma-separated list in order, default `cwd,branch,git,model,context`. Set it with `/config` or `pluginConfigs`.

What `claude plugin validate` reports:

```
hooks: session.start, turn.complete, ui.render{component=AbovePrompt}
calls: $.clock.every, $.env.get (via refresh), $.process.run (via refresh), $.session.cwd (via refresh), $.session.model (via refresh), $.session.usage (via refresh), $.ui.invalidate (via refresh), $.ui.resolve
```

## Run it
Requires Claude Code 2.1.287 or later and `git` on `PATH`.

```bash
claude --plugin-dir ./mods/powerline-bar        # one session
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install powerline-bar@awesome-claude-mods --scope user
```

Test it: `claude plugin test mods/powerline-bar`.

## Notes / limitations
- Draws in the terminal and the Desktop Code tab only. VS Code and `claude -p` draw nothing.
- Uses the `AbovePrompt` band, which every mod shares. This one composes: it stacks above whatever mods after it draw. A mod that returns a tree without calling `next` replaces this bar if it runs first.
- Plain Unicode, no Nerd Font arrows. The colour change is the separator.
- Data is up to 5 s stale between turns. A refresh already running when a turn ends skips that turn's refresh.
- The model name is shown as the session reports it. Context shows nothing until the first response.
- Needs a truecolor or 256-colour terminal for the block colours.

## Dependencies
None.
