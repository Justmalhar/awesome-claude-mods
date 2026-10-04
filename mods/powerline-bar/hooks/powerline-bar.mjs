// Powerline Bar: one coloured row in the AbovePrompt band.
// Everything the band shows is gathered by refresh() and cached; drawing only reads the cache.

const DEFAULT_SEGMENTS = 'cwd,branch,git,model,context'
const GREEN = '#2e7d32'
const YELLOW = '#f9a825'
const RED = '#c62828'
const BLUE = '#1565c0'
const GREY = '#455a64'
const PURPLE = '#6a1b9a'

let cache = { cwd: '', home: '', model: '', percent: undefined, git: null }
let busy = false

// One `git status --porcelain=v2 --branch` -> counts. null when not a repo.
function parseGit(out) {
  const g = { branch: '', staged: 0, unstaged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0 }
  let sha = ''
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.oid ')) sha = line.slice(13, 20)
    else if (line.startsWith('# branch.head ')) g.branch = line.slice(14)
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) [g.ahead, g.behind] = [Number(m[1]), Number(m[2])]
    } else if (line[0] === '1' || line[0] === '2') {
      if (line[2] !== '.') g.staged++
      if (line[3] !== '.') g.unstaged++
    } else if (line[0] === 'u') g.conflicts++
    else if (line[0] === '?') g.untracked++
  }
  if (g.branch === '(detached)') g.branch = sha
  return g.branch ? g : null
}

// Gather cwd, model, context and git. Never throws; a failed piece is just left out.
async function refresh($) {
  if (busy) return
  busy = true
  try {
    const snap = { cwd: '', home: '', model: '', percent: undefined, git: null }
    try { snap.cwd = String(await $.session.cwd()) } catch {}
    try { snap.home = String((await $.env.get('HOME')) ?? '') } catch {}
    try { snap.model = String((await $.session.model()) ?? '') } catch {}
    try { snap.percent = (await $.session.usage())?.context?.percent } catch {}
    try {
      const r = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd: snap.cwd || undefined, timeoutMs: 3000 })
      if (r.exitCode === 0) snap.git = parseGit(r.stdout)
    } catch {} // no git, not a repo, or timed out: hide the git segments
    const changed = JSON.stringify(snap) !== JSON.stringify(cache)
    cache = snap
    if (changed) await $.ui.invalidate('ui.render')
  } catch {} finally {
    busy = false
  }
}

function cwdLabel() {
  const { cwd, home } = cache
  if (!cwd) return ''
  if (home && cwd === home) return '~'
  return cwd.split('/').filter(Boolean).pop() || '/'
}

// [text, background] for each requested segment that has something to show.
function segmentsFor(names) {
  const g = cache.git
  const dirty = g && (g.staged || g.unstaged || g.untracked)
  const gitBg = !g ? GREY : g.conflicts ? RED : dirty ? YELLOW : GREEN
  const out = []
  for (const name of names) {
    if (name === 'cwd' && cwdLabel()) out.push([cwdLabel(), BLUE])
    else if (name === 'branch' && g) out.push(['⎇ ' + g.branch, gitBg])
    else if (name === 'git' && g) {
      const bits = []
      if (g.conflicts) bits.push('!' + g.conflicts)
      if (g.staged) bits.push('+' + g.staged)
      if (g.unstaged) bits.push('~' + g.unstaged)
      if (g.untracked) bits.push('?' + g.untracked)
      if (g.ahead) bits.push('↑' + g.ahead)
      if (g.behind) bits.push('↓' + g.behind)
      out.push([bits.join(' ') || '✓', gitBg])
    } else if (name === 'model' && cache.model) out.push([cache.model, PURPLE])
    else if (name === 'context' && typeof cache.percent === 'number') {
      const p = cache.percent
      out.push(['ctx ' + p + '%', p >= 85 ? RED : p >= 60 ? YELLOW : GREY])
    }
  }
  return out
}

export function register(on, options) {
  const names = String(options?.segments || DEFAULT_SEGMENTS).split(',').map((s) => s.trim())

  on('session.start', async ($, e, next) => {
    refresh($)
    $.clock.every(5000, () => refresh($))
    return next(e)
  })

  // Branch and counts move when Claude edits files.
  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      const theirs = await next(e)
      const segs = segmentsFor(names)
      if (!segs.length) return theirs
      // Narrow terminal: drop segments from the right instead of wrapping.
      const room = e.props?.bodyColumns ?? Infinity
      let used = 0
      const fit = segs.filter(([text], i) => (used += text.length + 2) <= room || i === 0)
      const { Box, Text } = $.ui.resolve(e)
      // ponytail: coloured blocks, no Nerd Font arrows; the colour change is the separator.
      const mine = Box({
        flexDirection: 'row',
        children: fit.map(([text, bg], i) =>
          Text({ key: 'seg-' + i, color: '#ffffff', backgroundColor: bg, bold: i === 0, wrap: 'truncate', children: [' ' + text + ' '] }),
        ),
      })
      // ponytail: an engine ref is the engine's own (empty) AbovePrompt drawing, so skip it; only a mod's tree stacks under the bar.
      if (!theirs || theirs.type === 'engine') return mine
      return Box({ flexDirection: 'column', children: [mine, theirs] })
    } catch {
      return next(e) // a draw hook must never throw
    }
  })
}
