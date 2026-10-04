// Branch Guard: on a protected branch (default main, master), asks before Claude
// edits files or runs mutating git, and otherwise tells it to use a worktree.
//
// tool.call (Write, Edit, MultiEdit, Bash): read the branch with git, and if it
// is protected ask once. "Edit anyway" is remembered for repo+branch until the
// mod reloads. Anything else, or no one to ask (-p, dismissed), denies with the
// worktree instruction. The hook never creates the worktree itself.
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are
// spelled literally.

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
// ponytail: regex on the command text. Misses `git` behind a shell alias, `sh -c "git commit"`,
// `command git`, `git --git-dir=x commit`, and scripts that call git. Upgrade: parse argv properly.
const MUTATING_GIT = /\bgit\s+(?:-[Cc]\s+\S+\s+|-\S+\s+)*(?:commit|push|merge|rebase|reset|cherry-pick|revert|am)\b/;
const DEFAULT_PROTECTED = "main,master";
const ALLOW = "Edit anyway";
const CREATE = "Create worktree (recommended)";
const REFUSE = "Refuse";

// ponytail: module-level, so it resets on reload and is not shared across sessions. Use $.store to persist.
const allowed = new Set();

export function register(on, options) {
  const protectedBranches = String(options?.protected_branches ?? DEFAULT_PROTECTED)
    .split(",")
    .map((b) => b.trim())
    .filter((b) => b !== "");

  on("tool.call", { tool: ["Write", "Edit", "MultiEdit", "Bash"] }, async ($, e, next) => {
    const isFile = FILE_TOOLS.has(e.tool);
    if (!isFile && !MUTATING_GIT.test(String(e.command ?? ""))) {
      return next(e);
    }
    const cwd = await $.session.cwd();
    const top = await $.process.run(["git", "rev-parse", "--show-toplevel"], { cwd });
    if (top.exitCode !== 0) {
      return next(e); // not a git repo
    }
    const root = top.stdout.trim();
    // ponytail: only the session repo is checked. A file in another repo, or reached through a
    // symlink (/tmp vs /private/tmp), is judged by the session repo's branch or skipped.
    const path = String(e.file_path ?? "");
    if (isFile && path.startsWith("/") && !path.startsWith(`${root}/`)) {
      return next(e); // outside the repo
    }
    const head = await $.process.run(["git", "branch", "--show-current"], { cwd });
    const branch = head.stdout.trim();
    // Detached HEAD (empty) is not protected: nothing named main or master can be moved from there.
    if (head.exitCode !== 0 || !protectedBranches.includes(branch)) {
      return next(e);
    }
    const key = `${root}\0${branch}`;
    if (allowed.has(key)) {
      return next(e);
    }
    let answer = REFUSE;
    try {
      answer = await $.ui.ask(`You're on ${branch}. Claude is about to edit files here.`, [CREATE, ALLOW, REFUSE]);
    } catch {
      // dismissed, or `claude -p`: no one said yes, so the answer is no
    }
    if (answer === ALLOW) {
      allowed.add(key);
      return next(e);
    }
    return { deny: denyText(root, branch) };
  }).catch(async () => ({
    // fail closed: a skipped guard would let the edit through
    deny: "Branch Guard failed while checking the branch, so this call was not run. Do not retry it unless the user asks you to.",
  }));
}

function denyText(root, branch) {
  const repo = root.split("/").pop();
  return (
    `Branch Guard: the repo is on protected branch "${branch}", so this change was not made. ` +
    `Do not edit files or commit on ${branch}. Create a worktree on a new branch and work there: ` +
    `git worktree add ../${repo}-<slug> -b cc-feature/<slug> ` +
    `(use cc-fix/ or cc-ui/ instead of cc-feature/ when it fits), where <slug> is a short kebab-case name for the task. ` +
    `Then make this change in that worktree. If the user explicitly wants to edit on ${branch}, ask them to approve it.`
  );
}
