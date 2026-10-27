/*
 * ceciCela TUI renderer: an 80x24 screen, BBS-door style.
 *
 * One module, two hosts. `ceci status --watch` loads it with require() and
 * prints ANSI; graph-player.html inlines this exact file and prints <pre>
 * spans. Both call render() on the same model, so the screens are the same
 * characters. The model never draws frames: it emits one event line per state
 * change, and everything that moves (packets, spinner, blink, typing, the
 * creator effects) is computed here from (model, tick).
 *
 * Honesty: every mark on the screen comes from state.md or an event line. The
 * effects only decorate a real change (the newest event, a job that really
 * finished); nothing moves to suggest work that no event reported.
 *
 * Generated copies: packages/core/lib/tui.js is the source.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CeciTUI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 80;
  var H = 24;
  var BOX_W = 16;
  var BOX_H = 4;
  var ROW_PITCH = 5;
  var GRAPH_TOP = 1;
  var GRAPH_ROWS = 3;
  var MAX_COLS = 4;
  var SPIN = { ascii: '|/-\\', cp437: '\u25d0\u25d3\u25d1\u25d2' };
  var CELA = { ok: 'COMPLETE', complete: 'COMPLETE', pending: 'pending', stalled: 'STALLED', blocked: 'BLOCKED', missing_test: 'MISSING_TEST' };
  var STATUSES = ['ready', 'running', 'blocked', 'done', 'gate'];
  var ROLES = ['keeper', 'detective', 'maintainer', 'physicist'];
  // The one key panel: row 23. The player makes each [X] clickable; the CLI reads the keys.
  var KEYS = {
    player: ['[G]raph', '[L]egend', '[B]udget', '[T]heme', '[SPC]pause', '[R]eplay', '[-+]speed'],
    cli: ['[G]raph', '[L]egend', '[B]udget', '[T]heme', '[SPC]pause', '[R]eplay', '[Q]uit'],
  };
  // In a chat without a player, nothing is clickable: the footer names what to type.
  var CHAT_FOOTER = ' type: help  budget <level>  animate  graph on|off  legend';
  var LEGEND = ' LEGEND +--+ pending  +==+ done  |/-\\ running  ! GATE waiting  * packet --> deps';
  // How often the model updates the view (playbooks/graph.md, Budget). The drawing itself costs no tokens.
  var BUDGETS = ['low', 'medium', 'creator'];
  var BUDGET_INFO = {
    low: 'status changes only (the fewest tokens)',
    medium: 'plus up to 3 real milestones per job, NOW line',
    creator: 'every real step, with live-audience effects',
  };
  var THEMES = ['phosphor', 'amber', 'ansi'];
  var STAMP = /^@(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?Z)$/;

  function pad(text, width) {
    text = String(text);
    if (text.length >= width) return text.slice(0, width);
    return text + new Array(width - text.length + 1).join(' ');
  }

  function bytes(text) {
    var n = 0;
    for (var i = 0; i < text.length; i += 1) {
      var c = text.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i += 1, 4) : 3;
    }
    return n;
  }

  function two(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** "12m", "3h", "2d" since an ISO minute stamp, or null without a clock. */
  function ago(at, now) {
    if (!at || typeof now !== 'number') return null;
    var mins = Math.floor((now - Date.parse(at)) / 60000);
    if (isNaN(mins)) return null;
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 48 * 60) return Math.floor(mins / 60) + 'h ago';
    return Math.floor(mins / 1440) + 'd ago';
  }

  // ---------------------------------------------------------------- events

  /**
   * One event line. ceci:    [@TIME] [tNN] <job> <status> [cela:<ok|pending|stalled|blocked|missing_test>] [gate:<word>]
   *                         [@TIME] [tNN] <job> step <what was done, with its real result>
   *                trouble: [tNN] h <H#> <p> <label...>   |   [tNN] vote <role> <yes|no> <N>
   *                cela:    [tNN] check <id> <ok|fail|open> <label...>
   *                any:     [tNN] step <what was done>     (no job: planning, evidence received)
   * @TIME is a UTC minute (@2026-10-27T05:40Z) that `ceci event` writes; chat
   * events carry none. Returns null for a line that is not an event.
   */
  function parseEvent(line) {
    var parts = String(line).trim().split(/\s+/);
    var ev = { raw: String(line).trim(), turn: null, at: null };
    for (var lead = 0; lead < 2 && parts.length; lead += 1) {
      var stamp = STAMP.exec(parts[0]);
      if (stamp) ev.at = stamp[1];
      else if (/^t\d+$/.test(parts[0])) ev.turn = Number(parts[0].slice(1));
      else break;
      parts.shift();
    }
    ev.body = parts.join(' ');
    if (!parts.length || !parts[0]) return null;
    if (parts[0] === 'h' && parts.length >= 3 && /^[0-9.]+$/.test(parts[2])) {
      ev.type = 'h';
      ev.id = parts[1];
      ev.p = Number(parts[2]);
      ev.label = parts.slice(3).join(' ');
      return ev;
    }
    if (parts[0] === 'vote' && parts.length >= 3) {
      ev.type = 'vote';
      ev.role = parts[1];
      ev.yes = parts[2].toLowerCase() === 'yes';
      ev.score = parts[3] === undefined ? null : Number(parts[3]);
      return ev;
    }
    if (parts[0] === 'check' && parts.length >= 3) {
      ev.type = 'check';
      ev.id = parts[1];
      ev.state = parts[2];
      ev.label = parts.slice(3).join(' ');
      return ev;
    }
    if (parts[0] === 'step' && parts.length >= 2 && STATUSES.indexOf(parts[1]) === -1) {
      ev.type = 'step';
      ev.job = null;
      ev.text = parts.slice(1).join(' ');
      return ev;
    }
    if (parts.length >= 3 && parts[1] === 'step') {
      ev.type = 'step';
      ev.job = parts[0];
      ev.text = parts.slice(2).join(' ');
      return ev;
    }
    if (parts.length >= 2 && STATUSES.indexOf(parts[1]) !== -1) {
      ev.type = 'job';
      ev.job = parts[0];
      ev.status = parts[1];
      for (var i = 2; i < parts.length; i += 1) {
        var kv = /^(cela|gate):(\S+)$/.exec(parts[i]);
        if (kv && kv[1] === 'cela') ev.cela = CELA[kv[2].toLowerCase()] || null;
        else if (kv) ev.gate = kv[2];
      }
      return ev;
    }
    return null;
  }

  function clone(jobs) {
    return jobs.map(function (job) {
      return { id: job.id, label: job.label, depends_on: job.depends_on.slice(), status: job.status, cela: job.cela, gate: job.gate, steps: 0 };
    });
  }

  /** Apply the first `step` events (all when step is undefined) to a model. Returns a new model. */
  function applyEvents(model, step) {
    var events = (model.events || []).slice(0, step === undefined ? undefined : step);
    var out = {
      kind: model.kind || 'ceci',
      title: model.title || '',
      graph: model.graph || 'on',
      budget: BUDGETS.indexOf(model.budget) === -1 ? 'low' : model.budget,
      legend: model.legend === true,
      now: null,
      latest: null,
      jobs: clone(model.jobs || []),
      hypotheses: (model.hypotheses || []).map(function (h) { return { id: h.id, label: h.label, p: h.p }; }),
      votes: {},
      checks: (model.checks || []).map(function (c) { return { id: c.id, label: c.label, state: c.state }; }),
      events: model.events || [],
      log: [],
      step: events.length,
      at: null,
    };
    var turn = 0;
    var n = 0;
    events.forEach(function (line) {
      var ev = parseEvent(line);
      if (!ev) return;
      n += 1;
      turn = ev.turn === null ? turn + 1 : ev.turn;
      out.log.push({ n: n, turn: turn, explicit: ev.turn !== null, at: ev.at, text: ev.body });
      out.latest = ev;
      if (ev.at) out.at = ev.at;
      if (ev.type === 'job') {
        var job = out.jobs.filter(function (j) { return j.id === ev.job; })[0];
        if (!job) return;
        job.status = ev.status;
        if (ev.cela !== undefined) job.cela = ev.cela;
        if (ev.gate !== undefined) job.gate = ev.gate;
      } else if (ev.type === 'step') {
        var worker = ev.job === null ? null : out.jobs.filter(function (j) { return j.id === ev.job; })[0];
        if (worker) worker.steps += 1;
        out.now = { job: ev.job, text: ev.text };
      } else if (ev.type === 'h') {
        var h = out.hypotheses.filter(function (x) { return x.id === ev.id; })[0];
        if (h) {
          h.p = ev.p;
          if (ev.label) h.label = ev.label;
        } else out.hypotheses.push({ id: ev.id, label: ev.label, p: ev.p });
      } else if (ev.type === 'vote') {
        out.votes[ev.role] = { yes: ev.yes, score: ev.score };
      } else if (ev.type === 'check') {
        var c = out.checks.filter(function (x) { return x.id === ev.id; })[0];
        if (c) {
          c.state = ev.state;
          if (ev.label) c.label = ev.label;
        } else out.checks.push({ id: ev.id, label: ev.label, state: ev.state });
      }
    });
    out.turn = turn;
    return out;
  }

  // ---------------------------------------------------------------- state.md

  function scalar(raw) {
    raw = String(raw).trim();
    if (raw === 'null' || raw === '') return null;
    if (raw.charAt(0) === '"') {
      try { return JSON.parse(raw); } catch (e) { return raw.slice(1, -1); }
    }
    if (raw.charAt(0) === '[') {
      var inner = raw.slice(1, -1).trim();
      if (!inner) return [];
      var items = [];
      var start = 0;
      var quoted = false;
      for (var i = 0; i < inner.length; i += 1) {
        if (quoted && inner.charAt(i) === '\\') i += 1;
        else if (inner.charAt(i) === '"') quoted = !quoted;
        else if (!quoted && inner.charAt(i) === ',') {
          items.push(scalar(inner.slice(start, i)));
          start = i + 1;
        }
      }
      items.push(scalar(inner.slice(start)));
      return items;
    }
    return raw;
  }

  /**
   * The ceci model from state.md text: optional `title:`, `graph:`, and
   * `budget:` header lines, the `jobs:` graph, and an optional `events:` list.
   * Lenient: it is for drawing. `ceci status` validates the file strictly
   * before it draws. A `kind: trouble` or `kind: cela` line makes it the model
   * for that protocol instead, so one player draws all three in chat.
   */
  function fromStateMd(text) {
    var lines = String(text).replace(/\r\n/g, '\n').split('\n');
    var model = { kind: 'ceci', title: '', graph: 'on', jobs: [], events: [] };
    var section = 'head';
    var job = null;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var top = /^([a-z_]+):(?: (.*))?$/.exec(line);
      if (top) {
        if (top[1] === 'jobs') section = 'jobs';
        else if (top[1] === 'events') section = 'events';
        else if (top[1] === 'feedback') section = 'feedback';
        else if (top[1] === 'title') model.title = scalar(top[2] || '') || '';
        else if (top[1] === 'graph') model.graph = scalar(top[2] || '') || 'on';
        else if (top[1] === 'budget') model.budget = scalar(top[2] || '') || 'low';
        else if (top[1] === 'kind' && /^(ceci|trouble|cela)$/.test(scalar(top[2] || '') || '')) model.kind = scalar(top[2]);
        if ((top[2] || '').trim() === '[]') section = top[1] === 'jobs' ? 'jobs' : top[1];
        return;
      }
      if (section === 'jobs') {
        var start = /^ {2}- id: (.*)$/.exec(line);
        if (start) {
          job = { id: scalar(start[1]), label: '', depends_on: [], status: 'blocked', cela: null, gate: null };
          model.jobs.push(job);
          return;
        }
        var field = /^ {4}([a-z_]+):(?: (.*))?$/.exec(line);
        if (field && job) {
          var value = scalar(field[2] || '');
          if (field[1] === 'goal') job.label = value || '';
          else if (field[1] === 'depends_on') job.depends_on = value || [];
          else if (field[1] === 'status') job.status = value;
          else if (field[1] === 'cela_gate') job.cela = value;
        }
      } else if (section === 'events') {
        var item = /^ {2}- (.*)$/.exec(line);
        if (item) model.events.push(String(scalar(item[1])));
      }
    });
    return model;
  }

  // ---------------------------------------------------------------- layout

  var RANK = { gate: 0, running: 1, ready: 2, blocked: 3, done: 4 };

  /** Depth of every job: 0 without dependencies, else 1 + the deepest dependency. */
  function depths(jobs) {
    var depth = {};
    var byId = {};
    jobs.forEach(function (j) { byId[j.id] = j; });
    function d(id, seen) {
      if (depth[id] !== undefined) return depth[id];
      if (seen[id] || !byId[id]) return 0;
      seen[id] = true;
      var deps = byId[id].depends_on.filter(function (x) { return byId[x]; });
      var v = deps.length ? 1 + Math.max.apply(null, deps.map(function (x) { return d(x, seen); })) : 0;
      depth[id] = v;
      return v;
    }
    jobs.forEach(function (j) { d(j.id, {}); });
    return depth;
  }

  /**
   * Where each job is drawn. Depth runs left to right, four columns to a band;
   * when the bands' rows allow, the graph wraps onto the next band, so a long
   * chain shows up to twelve steps. When it still does not fit, the window
   * follows the work: it starts one depth before the earliest job at a gate or
   * running (else the earliest unfinished one) and, near the end, slides back
   * to show as much finished work as fits. A depth with more jobs than its band
   * has rows shows the most active ones. Nothing hidden is dropped silently:
   * hiddenBefore, hiddenAfter, and overflow carry the counts.
   */
  function layout(jobs) {
    var depth = depths(jobs);
    var levels = [];
    var count = {};
    jobs.forEach(function (j) {
      var lv = depth[j.id];
      if (levels.indexOf(lv) === -1) levels.push(lv);
      count[lv] = (count[lv] || 0) + 1;
    });
    levels.sort(function (a, b) { return a - b; });
    // Bands from level index s: four levels each, as tall as their busiest level, three rows in all.
    function bands(s) {
      var out = [];
      var rows = 0;
      for (var i = s; i < levels.length; i += MAX_COLS) {
        var band = levels.slice(i, i + MAX_COLS);
        var h = Math.min(GRAPH_ROWS, Math.max.apply(null, band.map(function (lv) { return count[lv]; })));
        if (rows + h > GRAPH_ROWS) break;
        out.push({ levels: band, row: rows, h: h });
        rows += h;
      }
      return out;
    }
    function reach(s) {
      var bs = bands(s);
      return bs.reduce(function (n, b) { return n + b.levels.length; }, 0);
    }
    var first = 0;
    if (reach(0) < levels.length) {
      var active = function (statuses) {
        var ls = jobs.filter(function (j) { return statuses.indexOf(j.status) !== -1; }).map(function (j) { return levels.indexOf(depth[j.id]); });
        return ls.length ? Math.min.apply(null, ls) : -1;
      };
      var focus = active(['gate', 'running']);
      if (focus === -1) focus = active(['ready', 'blocked']);
      first = focus === -1 ? levels.length - 1 : Math.max(0, focus - 1);
      // Near the end, slide back while the last depth stays in view.
      while (first > 0 && first - 1 + reach(first - 1) >= levels.length) first -= 1;
      if (first + reach(first) < levels.length && focus === -1) first = Math.max(0, levels.length - reach(first));
    }
    var bs = bands(first);
    var multi = bs.length > 1;
    var pos = {};
    var overflow = [];
    var shown = [];
    var pitch = 0;
    var bandTop = [];
    bs.forEach(function (band, bi) {
      var n = multi ? MAX_COLS : band.levels.length;
      pitch = n === 1 ? 0 : Math.min(23, Math.floor((W - 3 - BOX_W) / (n - 1)));
      bandTop[bi] = GRAPH_TOP + band.row * ROW_PITCH;
      band.levels.forEach(function (lv, col) {
        shown.push(lv);
        var x = 2 + col * pitch;
        var here = jobs.map(function (j, i) { return { job: j, i: i }; }).filter(function (o) { return depth[o.job.id] === lv; });
        var pick = here.slice().sort(function (p, q) {
          return ((RANK[p.job.status] === undefined ? 3 : RANK[p.job.status]) - (RANK[q.job.status] === undefined ? 3 : RANK[q.job.status])) || p.i - q.i;
        }).slice(0, band.h).sort(function (p, q) { return p.i - q.i; });
        pick.forEach(function (o, r) { pos[o.job.id] = { col: col, band: bi, top: bandTop[bi], x: x, y: bandTop[bi] + r * ROW_PITCH }; });
        var rest = here.filter(function (o) { return !pos[o.job.id]; });
        if (rest.length) {
          var allDone = rest.every(function (o) { return o.job.status === 'done'; });
          overflow.push({ x: x, y: bandTop[bi] + band.h * ROW_PITCH - 1, more: rest.length, done: allDone });
        }
      });
    });
    var lo = shown.length ? shown[0] : 0;
    var hi = shown.length ? shown[shown.length - 1] : 0;
    var before = jobs.filter(function (j) { return depth[j.id] < lo; }).length;
    var after = jobs.filter(function (j) { return shown.length && depth[j.id] > hi; }).length;
    return {
      pos: pos,
      gutter: pitch - BOX_W,
      overflow: overflow,
      depth: depth,
      shown: shown,
      bands: bs.length,
      lastCol: bs.length ? bs[bs.length - 1].levels.length - 1 : 0,
      hiddenBefore: before,
      hiddenAfter: after,
      hiddenJobs: before + after,
    };
  }

  // ---------------------------------------------------------------- canvas

  function Canvas() {
    this.ch = [];
    this.at = [];
    this.kind = [];
    for (var y = 0; y < H; y += 1) {
      this.ch.push(new Array(W + 1).join(' ').split(''));
      this.at.push(new Array(W + 1).join(' ').split(''));
      this.kind.push(new Array(W + 1).join(' ').split(''));
    }
  }
  /** kind: ' ' text, 'L' line art, 'B' bar, 'P' packet, 'S' spinner. Only marks with a kind change glyphs under cp437. */
  Canvas.prototype.put = function (x, y, c, a, kind) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    this.ch[y][x] = c;
    this.at[y][x] = a || ' ';
    this.kind[y][x] = kind || ' ';
  };
  Canvas.prototype.text = function (x, y, s, a, kind) {
    for (var i = 0; i < s.length; i += 1) this.put(x + i, y, s.charAt(i), a, kind);
  };
  Canvas.prototype.line = function (x, y, c, a) {
    var cur = this.ch[y] && this.ch[y][x];
    if (cur === undefined) return;
    if ((cur === '-' && c === '|') || (cur === '|' && c === '-') || cur === '+') c = '+';
    this.put(x, y, c, a, 'L');
  };
  Canvas.prototype.attr = function (x, y, a) {
    if (x >= 0 && x < W && y >= 0 && y < H) this.at[y][x] = a;
  };
  Canvas.prototype.empty = function (x, y) {
    return x >= 0 && x < W && y >= 0 && y < H && this.ch[y][x] === ' ';
  };
  Canvas.prototype.out = function () {
    return { lines: this.ch.map(function (r) { return r.join(''); }), attrs: this.at.map(function (r) { return r.join(''); }) };
  };

  // Box drawing for the cp437 glyph set. A '+' joins the line marks around it.
  var JOIN = {
    s: { rd: '\u250c', ld: '\u2510', ru: '\u2514', lu: '\u2518', lrd: '\u252c', lru: '\u2534', rud: '\u251c', lud: '\u2524', lrud: '\u253c', lr: '\u2500', ud: '\u2502' },
    d: { rd: '\u2552', ld: '\u2555', ru: '\u2558', lu: '\u255b', lrd: '\u2564', lru: '\u2567', rud: '\u255e', lud: '\u2561', lrud: '\u256a', lr: '\u2550', ud: '\u2502' },
  };
  var PLAIN = { '-': '\u2500', '|': '\u2502', '=': '\u2550', '>': '\u25ba' };

  function cp437(cv) {
    var src = cv.ch.map(function (r) { return r.slice(); });
    var isLine = function (x, y) { return x >= 0 && x < W && y >= 0 && y < H && cv.kind[y][x] === 'L'; };
    var horiz = function (x, y) { return isLine(x, y) && '-=+>'.indexOf(src[y][x]) !== -1; };
    var vert = function (x, y) { return isLine(x, y) && '|+'.indexOf(src[y][x]) !== -1; };
    for (var y = 0; y < H; y += 1) {
      for (var x = 0; x < W; x += 1) {
        var k = cv.kind[y][x];
        var c = src[y][x];
        if (k === 'L') {
          if (c === '+') {
            var key = (horiz(x - 1, y) ? 'l' : '') + (horiz(x + 1, y) ? 'r' : '') + (vert(x, y - 1) ? 'u' : '') + (vert(x, y + 1) ? 'd' : '');
            var dbl = (isLine(x - 1, y) && src[y][x - 1] === '=') || (isLine(x + 1, y) && src[y][x + 1] === '=');
            cv.ch[y][x] = JOIN[dbl ? 'd' : 's'][key] || '\u253c';
          } else if (PLAIN[c]) cv.ch[y][x] = PLAIN[c];
        } else if (k === 'B') cv.ch[y][x] = c === '#' ? '\u2588' : c === '.' ? '\u2591' : c;
        else if (k === 'P') cv.ch[y][x] = c === '*' ? '\u25cf' : c === 'o' ? '\u2022' : '\u00b7';
      }
    }
  }

  // ---------------------------------------------------------------- panels

  function edgePath(lay, parent, child) {
    var p = lay.pos[parent.id];
    var c = lay.pos[child.id];
    var cells = [];
    var x;
    var y;
    if (!p && !c) return null;
    if (!p) {
      // A dependency scrolled off to the left: a stub into a first-column child.
      if (lay.depth[parent.id] >= lay.shown[0] || c.col !== 0 || c.band !== 0) return null;
      for (x = 0; x < c.x - 1; x += 1) cells.push([x, c.y + 1, '-']);
      cells.push([c.x - 1, c.y + 1, '>']);
      return cells;
    }
    if (!c) {
      // A dependent scrolled off to the right: a stub out of a last-column parent.
      if (lay.depth[child.id] <= lay.shown[lay.shown.length - 1] || p.band !== lay.bands - 1 || p.col !== lay.lastCol) return null;
      for (x = p.x + BOX_W; x < W - 1; x += 1) cells.push([x, p.y + 1, '-']);
      cells.push([W - 1, p.y + 1, '>']);
      return cells;
    }
    var y0 = p.y + 1;
    var y1 = c.y + 1;
    var step;
    if (c.band > p.band) {
      // Wrap to a later band: down the gutter right of the parent, along the
      // empty row above the child's band, down the gutter left of the child.
      var xr = Math.min(W - 1, p.x + BOX_W + 1);
      var gap = c.top - 1;
      var xl = c.x - 2;
      for (x = p.x + BOX_W; x < xr; x += 1) cells.push([x, y0, '-']);
      cells.push([xr, y0, '+']);
      for (y = y0 + 1; y < gap; y += 1) cells.push([xr, y, '|']);
      cells.push([xr, gap, '+']);
      for (x = xr - 1; x > xl; x -= 1) cells.push([x, gap, '-']);
      cells.push([xl, gap, '+']);
      for (y = gap + 1; y < y1; y += 1) cells.push([xl, y, '|']);
      cells.push([xl, y1, '+']);
      cells.push([c.x - 1, y1, '>']);
      return cells;
    }
    if (c.col === 0 || c.band !== p.band) return null;
    var off = Math.max(0, Math.floor((lay.gutter - 1) / 2));
    var g = c.x - lay.gutter + off;
    for (x = p.x + BOX_W; x < g; x += 1) cells.push([x, y0, '-']);
    step = y1 > y0 ? 1 : -1;
    if (y0 === y1) cells.push([g, y0, '-']);
    else {
      cells.push([g, y0, '+']);
      for (y = y0 + step; y !== y1; y += step) cells.push([g, y, '|']);
      cells.push([g, y1, '+']);
    }
    for (x = g + 1; x < c.x - 1; x += 1) cells.push([x, y1, '-']);
    cells.push([c.x - 1, y1, '>']);
    return cells;
  }

  function statusText(job, tick, budget, spinSet) {
    var spin = spinSet.charAt(tick % 4);
    if (job.status === 'done') return job.cela === 'COMPLETE' ? ' done  cela OK' : ' done';
    if (job.status === 'running') {
      if (job.cela === 'pending') return ' ' + spin + ' run  cela..';
      if (budget === 'creator' && job.steps && !job.cela) return ' ' + spin + ' ' + (job.steps > 99 ? '99+' : job.steps) + (job.steps === 1 ? ' step' : ' steps');
      if (job.cela && job.cela !== 'COMPLETE') return ' ' + spin + ' cela:' + job.cela;
      return ' ' + spin + ' running';
    }
    if (job.status === 'gate') return tick % 2 === 0 ? ' ! GATE: human' : '   GATE: human';
    if (job.cela && job.cela !== 'COMPLETE' && job.cela !== 'pending') return ' cela:' + job.cela;
    if (job.status === 'ready') return ' ready';
    return job.gate ? ' pending  gate' : ' pending';
  }

  // Box colours by state: done green, running yellow, gate blinking, the rest cyan.
  var BOX_ATTR = { done: 'g', running: 'y', gate: 'k' };

  function drawGraph(cv, model, tick, fx) {
    var lay = layout(model.jobs);
    var byId = {};
    model.jobs.forEach(function (j) { byId[j.id] = j; });
    var edges = [];
    model.jobs.forEach(function (child) {
      child.depends_on.forEach(function (pid) {
        if (byId[pid]) edges.push({ parent: byId[pid], child: child });
      });
    });
    edges.forEach(function (e) {
      e.cells = edgePath(lay, e.parent, e.child);
      if (!e.cells) return;
      var a = e.parent.status === 'done' ? 'b' : 'd';
      e.cells.forEach(function (cell) {
        if (cell[2] === '>') cv.put(cell[0], cell[1], '>', a, 'L');
        else cv.line(cell[0], cell[1], cell[2], a);
      });
    });
    edges.forEach(function (e, i) {
      var live = e.cells && e.parent.status === 'done' && (e.child.status === 'running' || e.child.status === 'gate');
      if (!live) return;
      var run = e.cells.slice(0, -1);
      if (!run.length) return;
      var packets = fx.creator ? [0, Math.floor(run.length / 2)] : [0];
      packets.forEach(function (offset) {
        var at = (tick + i * 3 + offset) % run.length;
        var trail = fx.creator ? 3 : 1;
        for (var t = trail; t >= 1; t -= 1) {
          if (at - t >= 0) cv.put(run[at - t][0], run[at - t][1], t === 1 ? 'o' : '.', 'p', 'P');
        }
        cv.put(run[at][0], run[at][1], '*', 'p', 'P');
      });
    });
    var latest = model.latest && model.latest.job ? model.latest : null;
    model.jobs.forEach(function (job) {
      var p = lay.pos[job.id];
      if (!p) return;
      var edge = job.status === 'done' ? '=' : '-';
      var a = BOX_ATTR[job.status] || 'c';
      // The newest event's job flashes for a moment (creator): it is what just changed.
      var flash = fx.creator && latest && latest.job === job.id && fx.fresh !== undefined && fx.fresh < 10 && tick % 2 === 1;
      if (flash) a = 'i';
      var bar = '+' + new Array(BOX_W - 1).join(edge) + '+';
      cv.text(p.x, p.y, bar, a, 'L');
      cv.text(p.x, p.y + BOX_H - 1, bar, a, 'L');
      cv.put(p.x, p.y + 1, '|', a, 'L');
      cv.text(p.x + 1, p.y + 1, pad(job.id + ' ' + job.label, BOX_W - 2), flash ? 'i' : 'b');
      cv.put(p.x + BOX_W - 1, p.y + 1, '|', a, 'L');
      cv.put(p.x, p.y + 2, '|', a, 'L');
      var st = statusText(job, tick, model.budget, fx.spin);
      cv.text(p.x + 1, p.y + 2, pad(st, BOX_W - 2), job.status === 'gate' ? 'k' : flash ? 'i' : a);
      if (job.status === 'running') cv.put(p.x + 2, p.y + 2, st.charAt(1), flash ? 'i' : a, 'S');
      cv.put(p.x + BOX_W - 1, p.y + 2, '|', a, 'L');
      // A job that really just finished gets a burst of sparks (creator).
      if (fx.creator && latest && latest.job === job.id && latest.status === 'done' && fx.fresh !== undefined && fx.fresh < 16) {
        var sparks = '*+.';
        [[-1, -1], [BOX_W, -1], [-1, BOX_H], [BOX_W, BOX_H], [Math.floor(BOX_W / 2), -1], [Math.floor(BOX_W / 2), BOX_H]].forEach(function (d, k) {
          var sx = p.x + d[0];
          var sy = p.y + d[1];
          if (cv.empty(sx, sy)) cv.put(sx, sy, sparks.charAt((fx.fresh + k) % 3), 's');
        });
      }
    });
    lay.overflow.forEach(function (o) {
      cv.text(o.x, o.y, pad('+' + o.more + ' more' + (o.done ? ' done' : ''), BOX_W), 'd');
    });
    return lay;
  }

  function bar(cv, x, y, p, width, a, fx, tick) {
    var n = Math.max(0, Math.min(width, Math.round(p * width)));
    cv.put(x, y, '[', a);
    for (var i = 0; i < width; i += 1) cv.put(x + 1 + i, y, i < n ? '#' : '.', i < n ? a : 'd', 'B');
    cv.put(x + 1 + width, y, ']', a);
    // A highlight runs along the filled part (creator); it never extends it.
    if (fx.creator && n > 0) cv.attr(x + 1 + (tick % n), y, 'w');
  }

  function drawTrouble(cv, model, tick, fx) {
    var hs = model.hypotheses.slice(0, 8);
    hs.forEach(function (h, i) {
      var y = GRAPH_TOP + 1 + i;
      cv.text(0, y, pad(' ' + pad(h.id, 3) + ' ' + pad(h.label, 34) + ' ', 40), i === 0 ? 'b' : ' ');
      bar(cv, 40, y, h.p, 14, i === 0 ? 'g' : 'c', fx, tick);
      cv.text(56, y, pad('  ' + h.p.toFixed(2), W - 56), i === 0 ? 'b' : ' ');
    });
    var votes = ROLES.map(function (role) {
      var v = model.votes[role];
      return role + ' ' + (v ? (v.yes ? 'YES' : 'NO') + (v.score === null || isNaN(v.score) ? '' : ' ' + v.score) : '...');
    });
    var all = ROLES.every(function (r) { return model.votes[r]; });
    var verdict = !all ? 'waiting' : ROLES.every(function (r) { return model.votes[r].yes; }) ? 'fix' : 'distill';
    cv.text(0, GRAPH_TOP + 11, pad(' GATE  ' + votes.join('   '), W), verdict === 'waiting' ? 'k' : 'b');
    cv.text(0, GRAPH_TOP + 12, pad('       -> ' + verdict, W), verdict === 'waiting' ? 'k' : verdict === 'fix' ? 'g' : 'y');
    var cast = ROLES.filter(function (r) { return model.votes[r]; }).length;
    var lead = hs.slice().sort(function (a, b) { return b.p - a.p; })[0];
    cv.text(0, 16, pad(' ' + hs.length + ' hypotheses' + (lead ? '   leading ' + lead.id + ' ' + lead.p.toFixed(2) : '') + '   votes ' + cast + '/4', W), 'd');
  }

  function drawCela(cv, model) {
    var marks = { ok: 'x', fail: '!', open: ' ' };
    model.checks.slice(0, 14).forEach(function (c, i) {
      var mark = marks[c.state] === undefined ? '?' : marks[c.state];
      cv.text(0, GRAPH_TOP + 1 + i, pad(' [' + mark + '] ' + pad(c.id, 4) + ' ' + c.label, W), c.state === 'fail' ? 'k' : c.state === 'ok' ? 'g' : ' ');
    });
    var count = function (s) { return model.checks.filter(function (c) { return c.state === s; }).length; };
    cv.text(0, 16, pad(' ' + count('ok') + ' ok  ' + count('fail') + ' fail  ' + count('open') + ' open   review checklist only: no tool ran, no gate was measured', W), 'd');
  }

  /** Row 16 for ceci: real counts and what the window hides. */
  function drawSummary(cv, model, lay, tick, fx) {
    var count = function (s) { return model.jobs.filter(function (j) { return j.status === s; }).length; };
    var total = model.jobs.length;
    var done = count('done');
    bar(cv, 1, 16, total ? done / total : 0, 16, 'g', fx, tick);
    var parts = [done + '/' + total + ' done'];
    if (count('running')) parts.push(count('running') + ' running');
    if (count('gate')) parts.push(count('gate') + ' at a gate');
    if (count('ready')) parts.push(count('ready') + ' ready');
    var left = ' ' + parts.join('  ');
    var right = (lay.hiddenBefore ? '<< ' + lay.hiddenBefore + ' earlier' : '') + (lay.hiddenBefore && lay.hiddenAfter ? '  ' : '') + (lay.hiddenAfter ? lay.hiddenAfter + ' later >>' : '');
    var room = W - 19;
    cv.text(19, 16, pad(pad(left, room - right.length) + right, room), 'b');
    if (right) cv.text(W - right.length, 16, right, 'd');
  }

  /** Row 17: the newest real step, else the job that needs attention, else the legend. */
  function drawFocus(cv, model, opts) {
    if (model.legend) {
      cv.text(0, 17, pad(LEGEND, W), 'd');
      return;
    }
    var tag = null;
    var said = '';
    if (model.budget !== 'low' && model.now) {
      tag = ' NOW  ';
      said = (model.now.job === null ? '' : model.now.job + ' > ') + model.now.text;
      if (opts.typed !== undefined) said = said.slice(0, Math.max(0, opts.typed));
    } else if (model.kind === 'ceci') {
      var by = function (s) { return model.jobs.filter(function (j) { return j.status === s; }); };
      var gate = by('gate');
      var running = by('running');
      var ready = by('ready');
      if (gate.length) {
        tag = ' GATE ';
        said = gate[0].id + ': ' + gate[0].label + ' -- waiting for a human';
      } else if (running.length) {
        tag = ' RUN  ';
        said = running[0].id + ': ' + running[0].label + (running.length > 1 ? '  (+' + (running.length - 1) + ' more)' : '');
      } else if (ready.length) {
        tag = ' NEXT ';
        said = ready[0].id + ': ' + ready[0].label;
      } else if (model.jobs.length && by('done').length === model.jobs.length) {
        tag = ' DONE ';
        said = 'all ' + model.jobs.length + ' jobs done';
      }
    }
    if (tag === null) {
      cv.text(0, 17, pad(LEGEND, W), 'd');
      return;
    }
    cv.text(0, 17, tag, 'n');
    cv.text(tag.length, 17, pad(' ' + said, W - tag.length), 'b');
  }

  function logLabel(entry) {
    if (entry.at) return entry.at.slice(11, 16) + 'Z';
    if (entry.explicit) return 'turn ' + two(entry.turn);
    return '#' + two(entry.n);
  }

  /** The budget panel (B): what each budget costs, and how to switch on this host. */
  function drawBudgetPanel(cv, model, panel) {
    var x0 = 6;
    var y0 = 5;
    var w = 68;
    var inner = w - 2;
    var rows = [
      '',
    ].concat(BUDGETS.map(function (b) {
      return ' ' + (panel.sel === b ? '>' : ' ') + ' ' + pad(b, 9) + BUDGET_INFO[b] + (model.budget === b ? '  [now]' : '');
    })).concat([
      '',
      ' The drawing is free; the budget is how often the view is updated.',
      ' Every budget shows only real work; a lower one shows less.',
      ' ' + (panel.note || ''),
      ' [Up/Down] choose  [Enter] ' + (panel.action || 'select') + '  [B] close',
    ]);
    var title = '+-- budget: how often the view is updated ';
    cv.text(x0, y0, title + new Array(w - title.length).join('-') + '+', 'b', 'L');
    rows.forEach(function (text, i) {
      var y = y0 + 1 + i;
      cv.put(x0, y, '|', 'b', 'L');
      var sel = BUDGETS.indexOf(text.slice(3, 3 + 9).trim()) !== -1 && text.charAt(1) === '>';
      cv.text(x0 + 1, y, pad(text, inner), sel ? 'i' : ' ');
      cv.put(x0 + w - 1, y, '|', 'b', 'L');
    });
    cv.text(x0, y0 + rows.length + 1, '+' + new Array(w - 1).join('-') + '+', 'b', 'L');
  }

  // ---------------------------------------------------------------- render

  /**
   * render(model, opts) -> { lines: [24 x 80], attrs: [24 x 80] }
   *   tick    animation counter (spinner, blink, packets, cursor)
   *   step    how many events to apply (default all)
   *   reveal  frames mode: columns shown so far (default 80)
   *   typed   characters of the newest log line typed so far (default all)
   *   footer  'player' (default), 'cli', or 'chat': which row 23 to draw
   *   replay  true while the player replays: the title says so
   *   fresh   ticks since the newest event arrived (creator effects)
   *   now     the clock in ms, for "12m ago"; omit for a fixed screen
   *   glyphs  'ascii' (default) or 'cp437' (box drawing, for the ansi theme)
   *   panel   { type: 'budget', sel, note, action } draws the budget panel on top
   * attrs: ' ' normal, 'i' inverse, 'b' bright, 'd' dim, 'k' blink, 'p' packet,
   *        'g' done, 'y' running, 'c' waiting, 'n' tag, 's' spark, 'w' shine,
   *        'h' hotkey, 'f' footer, '1'-'6' the title's colour cycle.
   * Every theme maps every attr; the phosphor and amber themes stay one colour.
   */
  function render(input, opts) {
    opts = opts || {};
    var tick = opts.tick || 0;
    var model = applyEvents(input, opts.step);
    var glyphs = opts.glyphs === 'cp437' ? 'cp437' : 'ascii';
    var fx = { creator: model.budget === 'creator', fresh: opts.fresh, spin: SPIN[glyphs] };
    var cv = new Canvas();
    var label = model.kind;
    var right;
    if (opts.replay) right = 'replay ' + two(model.step) + '/' + two((input.events || []).length) + ' ';
    else if (model.kind === 'ceci') {
      var done = model.jobs.filter(function (j) { return j.status === 'done'; }).length;
      right = done + '/' + model.jobs.length + ' done  ' + model.budget + ' ';
    } else right = model.log.length + ' ev  ' + model.budget + ' ';
    if (model.graph !== 'on') right = 'graph:' + model.graph + '  ' + right;
    var brand = ' ceciCela ';
    var left = brand + '| ' + label + ': ' + model.title;
    cv.text(0, 0, pad(pad(left, W - right.length) + right, W), 'i');
    if (fx.creator) {
      // The brand cycles through the BBS colours: decoration, no data.
      for (var b = 1; b < brand.length - 1; b += 1) cv.attr(b, 0, String(1 + ((b + tick) % 6)));
    }
    var lay = null;
    if (model.graph === 'off') {
      cv.text(0, 8, pad('', 22) + 'graph off -- type "graph on" to draw', 'd');
    } else if (model.kind === 'trouble') drawTrouble(cv, model, tick, fx);
    else if (model.kind === 'cela') drawCela(cv, model);
    else {
      lay = drawGraph(cv, model, tick, fx);
      drawSummary(cv, model, lay, tick, fx);
    }
    if (model.graph !== 'off') drawFocus(cv, model, opts);
    var frame = '+-- log.md ';
    cv.text(0, 18, frame + new Array(W - frame.length).join('-') + '+', 'm', 'L');
    cv.text(4, 18, 'log.md', 'b');
    var recent = model.log.slice(-3);
    for (var i = 0; i < 3; i += 1) {
      var entry = recent[i];
      var text = '';
      if (entry) {
        text = pad(logLabel(entry), 8) + entry.text;
        if (i === recent.length - 1 && opts.typed !== undefined) text = text.slice(0, Math.max(0, opts.typed));
        if (i === recent.length - 1 && tick % 2 === 0) text += '_';
      } else if (i === recent.length && tick % 2 === 0) text = '_';
      cv.put(0, 19 + i, '|', 'm', 'L');
      cv.text(1, 19 + i, ' ' + pad(text, W - 4) + ' ');
      if (entry) cv.text(2, 19 + i, pad(logLabel(entry), 7), 'd');
      cv.put(W - 1, 19 + i, '|', 'm', 'L');
    }
    cv.text(0, 22, '+' + new Array(W - 1).join('-') + '+', 'm', 'L');
    var events = input.events || [];
    var stamp = model.at ? model.at.slice(11, 16) + 'Z' : null;
    var since = stamp ? ago(model.at, opts.now) : null;
    var info = stamp ? 'as of ' + stamp + (since ? ' ' + since : '') : events.length + ' ev ' + events.reduce(function (n, e) { return n + bytes(e) + 1; }, 0) + 'B';
    if (opts.footer === 'chat') {
      cv.text(0, 23, pad(CHAT_FOOTER, W), 'f');
    } else {
      var keys = KEYS[opts.footer === 'cli' ? 'cli' : 'player'];
      var x = 0;
      cv.put(x, 23, ' ', 'f');
      x += 1;
      keys.forEach(function (k) {
        var close = k.indexOf(']') + 1;
        cv.text(x, 23, k.slice(0, close), 'h');
        cv.text(x + close, 23, k.slice(close) + ' ', 'f');
        x += k.length + 1;
      });
      cv.text(x, 23, pad('', W - x), 'f');
    }
    var used = cv.ch[23].join('').replace(/ +$/, '').length;
    // Beside the player's keys, the age matters more than the words "as of".
    if (used + 1 + info.length > W && since) info = stamp + ' ' + since;
    if (used + 1 + info.length > W) info = info.replace(/ \S+ ago$/, '');
    if (used + 1 + info.length <= W) cv.text(W - info.length, 23, info, 'f');
    if (opts.panel && opts.panel.type === 'budget') drawBudgetPanel(cv, model, opts.panel);
    if (glyphs === 'cp437') cp437(cv);
    var out = cv.out();
    if (opts.reveal !== undefined && opts.reveal < W) {
      var r = Math.max(0, opts.reveal);
      out.lines = out.lines.map(function (l) { return pad(l.slice(0, r), W); });
      out.attrs = out.attrs.map(function (l) { return pad(l.slice(0, r), W); });
    }
    return out;
  }

  // ---------------------------------------------------------------- output

  // <terminal>: the player never prints ANSI, so inlining drops this block.
  // SGR per attr and theme. phosphor and amber are one colour plus bold, dim, inverse, and blink.
  function mono(color) {
    return {
      ' ': color, i: color + ';7', b: color + ';1', d: color + ';2', k: color + ';1;5', p: color + ';1',
      g: color + ';1', y: color + ';1', c: color, n: color + ';7', s: color + ';1', w: color + ';7',
      h: color + ';1', f: color, 1: color + ';7', 2: color + ';7', 3: color + ';7', 4: color + ';7', 5: color + ';7', 6: color + ';7',
    };
  }
  var SGR = {
    phosphor: mono('32'),
    amber: mono('33'),
    // The BBS palette: 16 colours, a blue title bar, a yellow-on-blue key bar.
    ansi: {
      ' ': '37', i: '1;37;44', b: '1;37', d: '1;30', k: '1;31;5', p: '1;33',
      g: '1;32', y: '1;33', c: '36', n: '30;46', s: '1;36', w: '1;37;42',
      h: '1;33;44', f: '37;44', m: '35',
      1: '1;31;44', 2: '1;33;44', 3: '1;32;44', 4: '1;36;44', 5: '1;35;44', 6: '1;37;44',
    },
  };

  /** ANSI for a terminal, in the phosphor (default), amber, or ansi theme. */
  function toAnsi(screen, theme) {
    var table = SGR[theme === 'green' ? 'phosphor' : theme] || SGR.phosphor;
    return screen.lines.map(function (line, y) {
      var attrs = screen.attrs[y];
      var out = '';
      var cur = null;
      for (var x = 0; x < line.length; x += 1) {
        var a = attrs.charAt(x);
        if (a !== cur) {
          out += '\u001b[0;' + (table[a] || table[' ']) + 'm';
          cur = a;
        }
        out += line.charAt(x);
      }
      return out + '\u001b[0m';
    }).join('\n');
  }
  // </terminal>

  function esc(c) {
    return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c;
  }

  /** HTML for a <pre>: runs of one attribute become <span class="a-X">. */
  function toHtml(screen) {
    return screen.lines.map(function (line, y) {
      var attrs = screen.attrs[y];
      var out = '';
      var run = '';
      var cur = attrs.charAt(0);
      for (var x = 0; x <= line.length; x += 1) {
        var a = x < line.length ? attrs.charAt(x) : null;
        if (a !== cur) {
          out += cur === ' ' ? run : '<span class="a-' + cur + '">' + run + '</span>';
          run = '';
          cur = a;
        }
        if (x < line.length) run += esc(line.charAt(x));
      }
      return out;
    }).join('\n');
  }

  /** The key a footer hotkey stands for: '[G]' -> 'g', '[SPC]' -> ' ', '[-+]' -> '+'. */
  function hotkey(text) {
    var m = /^\[([^\]]+)\]$/.exec(String(text).trim());
    if (!m) return null;
    if (m[1] === 'SPC') return ' ';
    if (m[1] === '-+') return '+';
    return m[1].toLowerCase();
  }

  return {
    H: H,
    W: W,
    ROLES: ROLES,
    BUDGETS: BUDGETS,
    BUDGET_INFO: BUDGET_INFO,
    THEMES: THEMES,
    ago: ago,
    applyEvents: applyEvents,
    fromStateMd: fromStateMd,
    hotkey: hotkey,
    layout: layout,
    parseEvent: parseEvent,
    render: render,
    // <terminal>
    toAnsi: toAnsi,
    // </terminal>
    toHtml: toHtml,
  };
}));
