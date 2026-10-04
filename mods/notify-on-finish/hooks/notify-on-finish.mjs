// Notify on Finish: desktop notification when a long main-loop turn ends.
//
// turn.complete: if the turn ran longer than threshold_seconds and was not
// interrupted, notify via osascript (macOS), notify-send (Linux) or a toast.
// Text is passed as argv, never interpolated into a script or shell string.
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are
// spelled literally.

let platform; // ponytail: cached per load; a failed uname is retried next turn

async function os($) {
  if (platform) return platform;
  try {
    const r = await $.process.run(["uname", "-s"]);
    if (r.exitCode === 0) platform = r.stdout.trim();
  } catch {}
  return platform;
}

export function register(on, options) {
  on("turn.complete", async ($, e, next) => {
    try {
      const limit = Number(options?.threshold_seconds ?? 20);
      const secs = Math.round(e.durationMs / 1000);
      // ponytail: a non-numeric threshold falls back to 20 s
      if (e.agentId || e.isAborted || e.durationMs <= (Number.isFinite(limit) ? limit : 20) * 1000) return next(e);

      const cwd = String(await $.session.cwd()).replace(/\/+$/, "");
      const title = cwd.split("/").pop() || "Claude Code";
      const flat = (e.answer || "").replace(/\s+/g, " ").trim();
      const body = flat ? flat.slice(0, 100) : `Finished in ${secs}s`;

      const sys = await os($);
      if (sys === "Darwin") {
        // ponytail: osascript attributes the banner to Script Editor, not Claude Code
        const sound = String(options?.sound ?? "").trim();
        await $.process.run([
          "osascript",
          "-e", "on run argv",
          "-e", "display notification (item 1 of argv) with title (item 2 of argv)" + (sound ? " sound name (item 3 of argv)" : ""),
          "-e", "end run",
          "--", body, title, ...(sound ? [sound] : []),
        ]);
      } else if (sys === "Linux") {
        await $.process.run(["notify-send", "--", title, body]);
      } else {
        await $.ui.toast(`${title}: ${body}`);
      }
    } catch {}
    return next(e);
  });
}
