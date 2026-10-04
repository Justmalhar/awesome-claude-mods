# File Tree Pane

`/tree` opens a side pane with the working directory's files, coloured by git status. Press a folder to expand it, press a file to put `@path` in the prompt.

## What this shows
A `Pane` opened from a command (`$.ui.open`) with `Button` rows and an `Input`, redrawn through `$.ui.invalidate`. Also lazy `$.fs.list`, one `git status --porcelain` via `$.process.run`, and `$.prompt.fill` in `append` mode.

## Demo
Not captured from a live session. A pane can't be seen in `claude -p`, so the drawing is covered by `$.ui.mount` tests (expand and collapse, press a file, type in the filter, row cap) and `claude plugin validate`.

## How it works
- `session.start` registers `/tree` (`immediate`, so it opens while Claude works).
- `/tree` runs `git status`, then opens the pane (`focus`, `closeOnEscape`). If the surface won't place it, a toast gives the reason.
- The `Pane` render hook lists directories on demand (`$.fs.list`, one level, cached until the next refresh). `.git`, `node_modules` and `.DS_Store` are hidden. Folders come first.
- Colours: modified yellow `M`, added green `A`, untracked dim cyan `?`, deleted red `D`. A folder containing changes shows a yellow `M`.
- A file press appends `@relative/path ` to the draft (`mode: "append"`, with a space inserted if the draft doesn't end in one), so repeated presses build a list. A toast appears if the prompt refuses it.
- The filter box at the top keeps rows whose path contains the text (case-insensitive). It filters expanded rows only; collapsed folders aren't searched.
- At most 200 rows are drawn, then a `+N more` line. Names are cut to the pane width. The host scrolls.
- `turn.complete` re-runs `git status` and redraws, once the pane has been opened.

What `claude plugin validate` reports:

```
hooks: session.start, command.run{command=tree}, turn.complete, ui.render{component=Pane}
calls: $.command.register, $.fs.list (via entries), $.process.run (via refresh), $.prompt.fill (via insert), $.prompt.read (via insert), $.session.cwd (via draw), $.session.repo (via refresh), $.ui.invalidate (via redraw, refresh), $.ui.open, $.ui.resolve, $.ui.toast
```

## Run it
Requires Claude Code 2.1.287 or later and `git` on `PATH` (the tree still works without it, uncoloured).

```bash
claude --plugin-dir ./mods/file-tree-pane        # one session, then type /tree
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install file-tree-pane@awesome-claude-mods --scope user
```

Test it: `claude plugin test mods/file-tree-pane`. The tests run against a virtual project, not a live session.

## Notes / limitations
- Draws only in the terminal and the Desktop Code tab. Elsewhere (`-p`, VS Code, cloud) `/tree` does nothing visible. It does not use the `AbovePrompt` band.
- Without a git repo, or if `git status` fails, files are uncoloured.
- Status colours refresh on open and after each turn, not when you edit a file yourself.
- Quoted paths (names with spaces or unusual characters, which git escapes) are shown uncoloured. Paths with spaces are inserted as plain `@path` without quotes.
- Row cap is fixed at 200; use the filter to narrow. The module keeps expanded folders in memory only, so a reload collapses them.
- A closed pane still redraws on `turn.complete` (harmless, one `git status` per turn).
- Rows are truncated by hand to the pane width, so a very long name loses its end.
- Not checked in a live session: pane placement, scrolling and how the colours look.

## Dependencies
None.
