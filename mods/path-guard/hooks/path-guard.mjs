// Path Guard: refuses Write/Edit/MultiEdit (and optionally Read) on a path that
// resolves outside the project root, inside .git, or matches a deny glob.
//
// The path is resolved purely in JS (no path module in a mod): `~`, relative
// paths, `.` and `..` are normalised, then compared with the project root.
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are
// spelled literally.

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

export function register(on, options = {}) {
  on("tool.call", async ($, e, next) => {
    const isRead = e.tool === "Read" && options.guard_reads === true;
    if ((!WRITE_TOOLS.has(e.tool) && !isRead) || typeof e.file_path !== "string") {
      return next(e);
    }
    const cwd = await $.session.cwd();
    const root = norm((await $.session.repo())?.root ?? cwd, "/", "");
    const home = String((await $.env.get("HOME")) ?? "");
    const abs = norm(e.file_path, cwd, home);
    const rel = abs === root ? "" : abs.slice(root.length + 1);

    const inside = abs === root || abs.startsWith(root === "/" ? "/" : root + "/");
    const outsideOk = list(options.allow_outside).some((d) => {
      const dir = norm(d, "/", home);
      return abs === dir || abs.startsWith(dir === "/" ? "/" : dir + "/");
    });
    let rule = null;
    if (!inside && !outsideOk) {
      rule = "outside the project root";
    } else if (!isRead && abs.split("/").includes(".git")) {
      // ponytail: any `.git` path segment, also nested repos; it does not read .git files
      rule = "inside .git";
    } else {
      const hit = list(options.deny_globs).find((g) => {
        const re = globRe(g);
        return re.test(abs) || (inside && re.test(`/${rel}`));
      });
      if (hit !== undefined) {
        rule = `deny_globs pattern "${hit}"`;
      }
    }
    if (rule === null) {
      return next(e);
    }
    return {
      deny:
        `Path Guard blocked this ${e.tool} call: "${e.file_path}" resolves to ${abs}, which is ${rule}. ` +
        `Stay inside the project (${root}) and do not write into .git. ` +
        `If the user really wants this path, ask them to allow it (the allow_outside or deny_globs setting) instead of retrying.`,
    };
  }).catch(async () => ({
    // fail closed: a skipped guard would let the write through
    deny: "Path Guard failed while checking this call, so it was not run. Do not retry it unless the user asks you to.",
  }));
}

/** Absolute, normalised path: expands `~`, resolves against `base`, folds `.` and `..` (never above `/`). */
// ponytail: purely lexical; symlinks are not followed and case is compared as-is (macOS is case-insensitive). Add $.process.run(["realpath"]) if that matters.
function norm(p, base, home) {
  let s = p === "~" || p.startsWith("~/") ? home + p.slice(1) : p;
  if (!s.startsWith("/")) {
    s = `${base}/${s}`;
  }
  const out = [];
  for (const part of s.split("/")) {
    if (part === "..") {
      out.pop();
    } else if (part !== "" && part !== ".") {
      out.push(part);
    }
  }
  return "/" + out.join("/");
}

function list(v) {
  return typeof v === "string" ? v.split(",").map((x) => x.trim()).filter((x) => x !== "") : [];
}

/** Glob to RegExp: `**` any depth, `*` within a segment, `?` one char. No `/` in the pattern: matches at any depth. Else anchored to the project root, or to `/` if it starts with one. */
// ponytail: no `[...]` or `{a,b}`; they match literally.
function globRe(glob) {
  const g = glob.includes("/") ? glob : `**/${glob}`;
  let re = g.startsWith("/") || g.startsWith("**") ? "" : "/?";
  for (let i = 0; i < g.length; i += 1) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      const slash = g[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}(?:/.*)?$`); // a matched directory covers what is under it
}
