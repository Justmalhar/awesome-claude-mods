// Auto Checkpoint: a hidden git snapshot of the working tree at the start of every turn.
//
// turn.start: build a commit of the whole tree (tracked + untracked, minus .gitignore)
//   through a temporary index, point refs/claude-checkpoints/<epoch>-<turnId> at it, prune.
//   The user's index, HEAD, branches, stash and working tree are never touched.
// command.run: /checkpoints lists them, /undo-turn restores the latest after a confirmation.
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are spelled literally.

const NOT_REPO = "Not a git repository (or git is missing): auto-checkpoint does nothing here.";

// Shared bash prelude. $1.. are the script's args. Defines snap NAME MSG: prints the commit sha.
const PRELUDE = `
set -u
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo NOTREPO; exit 0; }
cd "$(git rev-parse --show-toplevel)" || exit 1
export GIT_AUTHOR_NAME="\${GIT_AUTHOR_NAME:-claude-checkpoint}" GIT_AUTHOR_EMAIL="\${GIT_AUTHOR_EMAIL:-checkpoint@localhost}"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
# tree of the working tree right now (tracked + untracked, minus ignored), via a throwaway index
now_tree() {
  idx=$(mktemp) || return 1
  rm -f "$idx" # a 0-byte file is not a valid index
  GIT_INDEX_FILE=$idx git add -A >/dev/null 2>&1 && GIT_INDEX_FILE=$idx git write-tree
  rm -f "$idx"
}
snap() {
  idx=$(mktemp) || return 1
  GIT_INDEX_FILE=$idx; export GIT_INDEX_FILE
  if git rev-parse -q --verify HEAD >/dev/null; then git read-tree HEAD; set -- "$@" -p HEAD; else git read-tree --empty; fi
  git add -A >/dev/null 2>&1
  tree=$(git write-tree) && c=$(git commit-tree "$tree" "\${@:3}" -m "$2") && git update-ref "refs/claude-checkpoints/$1" "$c"
  rc=$?
  unset GIT_INDEX_FILE; rm -f "$idx"
  [ $rc -eq 0 ] && echo "$c"
  return $rc
}
`;

// ponytail: ties inside one second (same commit date) order by ref name, so "newest" is arbitrary only for sub-second turns
// $1 = name (<epoch>-<turnId>), $2 = keep. Snapshot, then prune everything beyond the newest $2.
const SNAPSHOT = `${PRELUDE}
n=$(printf %s "$1" | tr -c 'A-Za-z0-9._-' '_')
snap "$n" "claude checkpoint $n" || exit 1
git for-each-ref --sort=-refname --sort=-committerdate --format='%(refname)' refs/claude-checkpoints \\
  | tail -n +$(( $2 + 1 )) | while read -r r; do git update-ref -d "$r"; done
`;

const LIST = `${PRELUDE}
w=$(now_tree)
git for-each-ref --sort=-refname --sort=-committerdate --format='%(refname:strip=2) %(objectname) %(committerdate:relative)' refs/claude-checkpoints \\
  | while read -r n o d; do s=$(git diff --shortstat "$o" "$w" | sed 's/^ //'); echo "$n | $d | \${s:-no changes}"; done
`;

// $1 = ref name or "" for the newest non-pre-undo one. Prints "<name> <sha>" or nothing.
const RESOLVE = `
if [ -n "$1" ]; then
  o=$(git rev-parse -q --verify "refs/claude-checkpoints/$1^{commit}") && echo "$1 $o"
else
  git for-each-ref --sort=-refname --sort=-committerdate --format='%(refname:strip=2) %(objectname)' refs/claude-checkpoints | grep -v '^pre-undo-' | head -n 1
fi
`;

// Files to delete on undo: untracked now (ignored files excluded) AND absent from the checkpoint.
// Anything untracked before the turn is in the checkpoint tree, so it is never listed.
// A third condition guards a changed .gitignore: the file must also be newer than the checkpoint commit.
// ponytail: newline-separated names (a filename containing a newline is never removed, only skipped by accident of parsing)
const VICTIMS = `
victims() {
  git -c core.quotepath=off ls-files -o --exclude-standard | sort > "$t/now"
  git -c core.quotepath=off ls-tree -r --name-only "$o" | sort > "$t/then"
  ct=$(git log -1 --format=%ct "$o")
  d=$(date -r "$ct" +%Y%m%d%H%M.%S 2>/dev/null || date -d "@$ct" +%Y%m%d%H%M.%S) && touch -t "$d" "$t/stamp" || return 1
  comm -23 "$t/now" "$t/then" | while IFS= read -r f; do [ "$f" -nt "$t/stamp" ] && echo "$f"; done
}
`;

// $1 = ref name or "". Prints the preview: header line, diffstat, files that would be removed.
const PREVIEW = `${PRELUDE}${VICTIMS}
r=$(${RESOLVE}); [ -n "$r" ] || { echo NOCKPT; exit 0; }
set -- $r; n=$1; o=$2; t=$(mktemp -d)
echo "checkpoint $n"
git diff --stat "$o" "$(now_tree)"
echo "--- would remove (new since checkpoint):"
victims
rm -rf "$t"
`;

// $1 = ref name or "", $2 = epoch. Pre-undo snapshot, restore worktree, remove victims.
const RESTORE = `${PRELUDE}${VICTIMS}
r=$(${RESOLVE}); [ -n "$r" ] || { echo NOCKPT; exit 0; }
set -- $r "$2"; n=$1; o=$2; ep=$3; t=$(mktemp -d)
victims > "$t/victims"
snap "pre-undo-$ep" "claude checkpoint pre-undo-$ep" >/dev/null || { echo "pre-undo snapshot failed, nothing changed"; exit 1; }
# restore --worktree rewrites file contents only: index and HEAD stay as they are (checkout would stage).
git restore --source="$o" --worktree -- . || { echo "restore failed (pre-undo-$ep holds your state)"; exit 1; }
k=0; while IFS= read -r f; do [ -n "$f" ] && rm -f -- "$f" && k=$((k+1)); done < "$t/victims"
rm -rf "$t"
echo "restored $n, removed $k new file(s); to redo: /undo-turn pre-undo-$ep"
`;

function sh($, script, ...args) {
  return $.process.run(["bash", "-c", script, "auto-checkpoint", ...args]);
}

async function epoch($) {
  return String(Math.floor((await $.clock.now()) / 1000));
}

export function register(on, options = {}) {
  const keep = Number.isInteger(options.keep) && options.keep > 0 ? options.keep : 20;
  on("turn.start", async ($, e, next) => {
    try {
      // ponytail: every turn.start snapshots; if the host fires it for subagent turns too, filter here
      await sh($, SNAPSHOT, `${await epoch($)}-${e.turnId}`, String(keep));
    } catch {} // fail soft: a checkpoint failure never blocks the turn
    return next(e);
  });

  on("session.start", async ($, e, next) => {
    const result = await next(e);
    try {
      await $.command.register({ name: "checkpoints", description: "List auto-checkpoints and what changed since each." });
      // immediate:false (omitted): must wait for the turn to end, never restore under a streaming turn
      await $.command.register({ name: "undo-turn", description: "Restore the working tree to the latest checkpoint.", argumentHint: "[checkpoint-name]" });
    } catch {} // name already taken
    return result;
  });

  on("command.run", { command: "checkpoints" }, async ($) => {
    try {
      const r = await sh($, LIST);
      if (r.stdout.startsWith("NOTREPO")) return { text: NOT_REPO };
      return { text: r.stdout.trim() ? `name | age | changed vs now (tracked files)\n${r.stdout.trim()}` : "No checkpoints yet." };
    } catch (err) {
      return { text: NOT_REPO };
    }
  });

  on("command.run", { command: "undo-turn" }, async ($, e) => {
    const name = (e.args || "").trim().replace(/^refs\/claude-checkpoints\//, "");
    try {
      const p = await sh($, PREVIEW, name);
      if (p.stdout.startsWith("NOTREPO")) return { text: NOT_REPO };
      if (p.stdout.startsWith("NOCKPT")) return { text: "No checkpoint to restore." };
      let answer;
      try {
        answer = await $.ui.ask(`Restore the working tree?\n${p.stdout.trim()}`, ["Restore", "Cancel"]);
      } catch {
        answer = "Cancel"; // dismissed or non-interactive
      }
      if (answer !== "Restore") return { text: "Undo cancelled. Nothing changed." };
      const r = await sh($, RESTORE, name, await epoch($));
      return { text: r.stdout.trim() || "Undo failed." };
    } catch (err) {
      return { text: "Undo failed, nothing changed." };
    }
  });
}
