# Auto Checkpoint

Takes a hidden git snapshot of your working tree at the start of every turn, and gives you `/checkpoints` to list them and `/undo-turn` to roll the tree back to the latest one.

## What this shows
`turn.start`, `command.run` and `$.process.run` driving plain git, `$.command.register`, and `$.ui.ask` as a confirmation gate before a destructive action.

## Demo
Headless `claude -p` with the mod loaded in a throwaway repo (`a.txt` committed, `wip.txt` untracked), asked to create `notes.txt`. Before the turn's edit, one ref appeared:

```
4ca5ef7 commit	refs/claude-checkpoints/1791077022-2280d44f-9391-44e3-912f-89e3fcb59e5a
tree: a.txt wip.txt        (notes.txt did not exist yet)
status afterwards: ?? notes.txt, ?? wip.txt   (index and stash untouched)
```

`/undo-turn` and `/checkpoints` were exercised against real git through the mod's own scripts (see Notes), not in an interactive session.

## How it works
- **`turn.start`**: builds a commit of the whole working tree (tracked + untracked, honouring `.gitignore`) through a temporary `GIT_INDEX_FILE` (`read-tree HEAD`, `add -A`, `write-tree`, `commit-tree -p HEAD`) and points `refs/claude-checkpoints/<epoch>-<turnId>` at it. Your index, HEAD, branches, stash and files are never touched; only that ref and the object database are written. Then it deletes every checkpoint ref beyond the newest `keep` (default 20).
- **`/checkpoints`**: name, age, and `git diff --shortstat` between each checkpoint and the working tree now (untracked files included).
- **`/undo-turn [name]`**: shows the diffstat and the files it would delete, asks via `$.ui.ask` (Restore / Cancel; dismissed counts as Cancel), writes `refs/claude-checkpoints/pre-undo-<epoch>` first so the undo is itself undoable (`/undo-turn pre-undo-<epoch>`), restores contents with `git restore --source=<commit> --worktree -- .` (index and HEAD untouched), then removes only files that are untracked now, absent from the checkpoint tree, and newer than the checkpoint commit. No `git clean`, no `reset --hard`. Registered without `immediate`, so it waits for the turn to end.
- Without a git repo (or git) everything is a no-op and the commands say so.

What `claude plugin validate` reports:

```
hooks: turn.start, session.start, command.run{command=checkpoints}, command.run{command=undo-turn}
calls: $.clock.now (via epoch), $.command.register, $.process.run (via sh), $.ui.ask
```

## Run it
Requires Claude Code 2.1.289 or later, `git` 2.23+ (`git restore`) and `bash` on `PATH`. Setting `keep` is under the plugin's `/config` rows.

```bash
claude --plugin-dir ./mods/auto-checkpoint
```

## Notes / limitations
- Verified against real git in a throwaway repo by importing the hooks module with a shell-backed `$`: snapshot with index byte-identical afterwards, pre-existing untracked file captured, ignored files excluded, pruning to the cap, undo removing only new files, redo via `pre-undo-*`, no-repo and empty-repo (root commit). The unit tests use a scripted fake git; the live `-p` run covers `turn.start` only.
- Snapshots copy file contents into git objects: large untracked binaries make each turn slower and the repo bigger until `git gc` prunes pruned refs' objects.
- Undo reverts everything changed since the checkpoint, including your own edits made during the turn. That is why it asks, and why it snapshots first.
- Deleted-then-restored directories are fine; empty directories left by removed files stay. File names containing newlines are not handled.
- Two undos in the same second share a `pre-undo-<epoch>` name (the first is overwritten). Sub-second turns tie-break by ref name when pruning.
- Ignored files are never snapshotted, so undo cannot bring them back and never deletes them.
- Not a sandbox: a `bash` script run by the mod, with the repo found from the session directory (nested repos and submodules are not snapshotted separately).
- Does not use the `AbovePrompt` band.

## Dependencies
None.
