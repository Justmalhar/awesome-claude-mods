# Branch Guard

Stops Claude from editing files, or running mutating git commands, while the repo is on a protected branch (default `main`, `master`). You get one question; Claude gets an instruction to work in a worktree instead.

## What this shows
A `tool.call` guard that asks first (`$.ui.ask`) and fails closed. State is a module-level `Set`; git is read through `$.process.run`.

## Demo
Headless `claude -p` in a throwaway repo on `main`, asked to write `notes.txt`. `-p` has no one to ask, so the ask rejects and the write was refused, with no file created. Claude relayed:

```
Branch Guard: the repo is on protected branch "main", so this change was not made. Do not edit files or commit on main. Create a worktree on a new branch and work there: git worktree add ../bg-repo-<slug> -b cc-feature/<slug> (use cc-fix/ or cc-ui/ instead of cc-feature/ when it fits), where <slug> is a short kebab-case name for the task. Then make this change in that worktree. If the user explicitly wants to edit on main, ask them to approve it.
```

In an interactive session the question is "You're on main. Claude is about to edit files here." with `Create worktree (recommended)`, `Edit anyway`, `Refuse`. Not seen live here: the interactive dialog is covered by tests only.

## How it works
One `tool.call` hook on `Write`, `Edit`, `MultiEdit` and `Bash`. For Bash it only acts when the command matches `git commit|push|merge|rebase|reset|cherry-pick|revert|am`. It then runs `git rev-parse --show-toplevel` (no repo: allow) and `git branch --show-current` in `$.session.cwd()`. If the branch is protected and `Edit anyway` was not already chosen for that repo and branch this session, it asks. `Edit anyway` allows and is remembered; every other answer, a dismissed dialog, or `-p` denies. The hook never creates the worktree.

Setting `protected_branches` (comma-separated, default `main,master`) is prompted for when the mod is enabled and editable in `/config`.

What `claude plugin validate` reports:

```
hooks: tool.call{tool=Write|Edit|MultiEdit|Bash}
calls: $.process.run, $.session.cwd, $.ui.ask
```

## Run it
Requires Claude Code 2.1.289 or later and `git` on `PATH`.

```bash
claude --plugin-dir ./mods/branch-guard        # one session
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install branch-guard@awesome-claude-mods --scope user
```

## Notes / limitations
- Detached HEAD is treated as not protected: no protected branch moves from there.
- The Bash check is a regex on the command text. It misses git behind an alias, `sh -c "git commit"`, `command git`, `git --git-dir=x commit`, and scripts that call git. It can also match the words inside a quoted string.
- Only the session repo is checked. A file in another repo is allowed if it is outside the session repo's root; a symlinked path (`/tmp` vs `/private/tmp`) can be misjudged.
- "Edit anyway" lasts until the mod reloads; it is not stored across sessions.
- Any failure (git missing, hook error) denies, not allows.
- Draws nothing, so no `AbovePrompt` band use.

## Dependencies
None.
