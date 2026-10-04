// File Tree Pane: `/tree` opens a pane with the working directory's files.
//
// Directories load lazily (one $.fs.list each) when expanded. Colours come from
// one `git status --porcelain` run, refreshed on open and on turn.complete.
// Pressing a file appends `@path ` to the prompt. The host reads `on(...)` and
// `$.noun.method(...)` from source, so they are spelled literally.

const PANE = "file-tree-pane";
const HIDDEN = new Set([".git", "node_modules", ".DS_Store"]);
const MAX_ROWS = 200; // ponytail: no paging; narrow with the filter box
const COLORS = { M: "yellow", A: "green", "?": "cyan", D: "red" };

// Module state resets on reload, which only costs the expanded folders.
const expanded = new Set(); // absolute dir paths
const listings = new Map(); // dir -> sorted entries; cleared on refresh
let changes = new Map(); // absolute path (dirs end in "/") -> M | A | ? | D
let filter = "";
let isOpened = false; // ponytail: never reset on close, so a closed pane still redraws on turn.complete

export function register(on) {
  on("session.start", async ($, e, next) => {
    try {
      await $.command.register({ name: "tree", description: "Open the file tree pane", immediate: true });
    } catch {
      // name taken or unsupported: the rest of the mod is harmless without it
    }
    return next(e);
  });

  on("command.run", { command: "tree" }, async ($, e, next) => {
    try {
      await refresh($);
      const r = await $.ui.open({ id: PANE, title: "Files", focus: true, closeOnEscape: true });
      isOpened = true;
      if (r && r.isPlaced === false) {
        $.ui.toast(r.reason || "The terminal is too narrow for the file tree pane.");
      }
    } catch {
      toast($, "Could not open the file tree.");
    }
    return {};
  });

  on("turn.complete", async ($, e, next) => {
    if (isOpened) {
      try {
        await refresh($);
      } catch {
        // stale colours beat a failed turn
      }
    }
    return next(e);
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e);
    }
    try {
      return await draw($, e);
    } catch {
      const { Text } = $.ui.resolve(e);
      return Text({ dimColor: true, children: "Could not read the file tree." });
    }
  });
}

function toast($, text) {
  try {
    $.ui.toast(text);
  } catch {
    // a toast is a courtesy
  }
}

async function refresh($) {
  listings.clear();
  const next = new Map();
  try {
    const repo = await $.session.repo();
    if (repo) {
      const r = await $.process.run(["git", "status", "--porcelain"], { cwd: repo.root, timeoutMs: 10000 });
      for (const line of r.exitCode === 0 ? r.stdout.split("\n") : []) {
        if (line.length < 4) continue;
        const xy = line.slice(0, 2);
        const path = line.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""); // ponytail: quoted paths with escapes are shown uncoloured
        next.set(`${repo.root}/${path}`, xy === "??" ? "?" : xy.includes("D") ? "D" : xy.includes("A") ? "A" : "M");
      }
    }
  } catch {
    // not a repo, or git is missing: draw the tree uncoloured
  }
  changes = next;
  await $.ui.invalidate("ui.render");
}

// A file's own code, else the code of an untracked/deleted parent dir.
function codeOf(path) {
  const own = changes.get(path);
  if (own) return own;
  for (const [p, c] of changes) if (p.endsWith("/") && path.startsWith(p)) return c;
  return "";
}

function dirHasChanges(path) {
  for (const p of changes.keys()) if (p.startsWith(`${path}/`)) return true;
  return false;
}

async function entries($, dir) {
  let list = listings.get(dir);
  if (!list) {
    try {
      list = (await $.fs.list(dir)).filter((x) => !HIDDEN.has(x.name));
    } catch {
      list = []; // unreadable dir shows empty
    }
    list.sort((a, b) => (a.kind === "dir") !== (b.kind === "dir") ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name));
    listings.set(dir, list);
  }
  return list;
}

async function walk($, dir, depth, out) {
  for (const x of await entries($, dir)) {
    const path = `${dir}/${x.name}`;
    const isDir = x.kind === "dir";
    out.push({ path, name: x.name, depth, isDir });
    if (isDir && expanded.has(path)) await walk($, path, depth + 1, out);
  }
}

async function insert($, rel) {
  try {
    // append adds right after the draft, so separate it from what is typed
    const { text } = await $.prompt.read();
    const sep = text && !/\s$/.test(text) ? " " : "";
    const r = await $.prompt.fill({ text: `${sep}@${rel} `, mode: "append" });
    if (!r.isFilled) toast($, "The prompt could not take the path.");
  } catch {
    toast($, "The prompt could not take the path.");
  }
}

function redraw($) {
  Promise.resolve($.ui.invalidate("ui.render")).catch(() => {});
}

async function draw($, e) {
  const { Box, Text, Button, Input } = $.ui.resolve(e);
  const cwd = await $.session.cwd();
  const cols = e.props?.bodyColumns ?? 60;
  const rows = [];
  await walk($, cwd, 0, rows);
  const needle = filter.toLowerCase();
  const shown = needle ? rows.filter((r) => r.path.slice(cwd.length + 1).toLowerCase().includes(needle)) : rows;

  const children = [
    Input({
      key: "filter",
      placeholder: "filter",
      value: filter,
      onInput: (v) => { filter = v; redraw($); },
      onSubmit: (v) => { filter = v; redraw($); },
    }),
  ];
  for (const r of shown.slice(0, MAX_ROWS)) {
    const code = r.isDir ? (dirHasChanges(r.path) ? "M" : "") : codeOf(r.path);
    const mark = r.isDir ? (expanded.has(r.path) ? "v " : "> ") : "  ";
    // ponytail: truncated by hand, a Button label can't take wrap
    const label = `${"  ".repeat(r.depth)}${mark}${r.name}${r.isDir ? "/" : ""}`.slice(0, Math.max(10, cols - 4));
    children.push(
      Box({
        key: `r:${r.path}`,
        flexDirection: "row",
        children: [
          Text({ color: COLORS[code], dimColor: code === "?", children: `${code || " "} ` }),
          Button({
            key: r.path,
            plain: true,
            label,
            onPress: r.isDir
              ? () => { expanded.has(r.path) ? expanded.delete(r.path) : expanded.add(r.path); redraw($); }
              : () => { insert($, r.path.slice(cwd.length + 1)); },
          }),
        ],
      }),
    );
  }
  if (shown.length > MAX_ROWS) {
    children.push(Text({ dimColor: true, wrap: "truncate-end", children: `+${shown.length - MAX_ROWS} more` }));
  }
  if (shown.length === 0) {
    children.push(Text({ dimColor: true, wrap: "truncate-end", children: needle ? "No match." : "Empty directory." }));
  }
  return Box({ flexDirection: "column", children });
}
