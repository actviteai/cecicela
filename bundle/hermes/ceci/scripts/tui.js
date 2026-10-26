/*
 * ceciCela TUI renderer: an 80x24 pure-ASCII screen, BBS-door style.
 *
 * One module, two hosts. `ceci status --watch` loads it with require() and
 * prints ANSI; graph-player.html inlines this exact file and prints <pre>
 * spans. Both call render() on the same model, so the screens are the same
 * bytes. The model never draws frames: it emits one event line per state
 * change, and everything that moves (packets, spinner, blink, typing) is
 * computed here from (model, tick).
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
  var SPIN = '|/-\\';
  var CELA = { ok: 'COMPLETE', complete: 'COMPLETE', pending: 'pending', stalled: 'STALLED', blocked: 'BLOCKED', missing_test: 'MISSING_TEST' };
  var STATUSES = ['ready', 'running', 'blocked', 'done', 'gate'];
  var ROLES = ['keeper', 'detective', 'maintainer', 'physicist'];
  var FOOTER = ' [G]raph [F]rames [L]egend [SPC]pause [S]tep [T]heme [-+]speed [R]eset';
  var LEGEND = ' LEGEND +--+ pending  +==+ done  |/-\\ running  ! GATE waiting  * packet --> deps';
  // How often the model updates the view (playbooks/graph.md, Budget). The drawing itself costs no tokens.
  var BUDGETS = ['low', 'medium', 'creator'];

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

  // ---------------------------------------------------------------- events

  /**
   * One event line. ceci:    [tNN] <job> <status> [cela:<ok|pending|stalled|blocked|missing_test>] [gate:<word>]
   *                         [tNN] <job> step <what was done, with its real result>
   *                trouble: [tNN] h <H#> <p> <label...>   |   [tNN] vote <role> <yes|no> <N>
   *                cela:    [tNN] check <id> <ok|fail|open> <label...>
   *                any:     [tNN] step <what was done>     (no job: planning, evidence received)
   * Returns null for a line that is not an event.
   */
  function parseEvent(line) {
    var parts = String(line).trim().split(/\s+/);
    var ev = { raw: String(line).trim(), turn: null };
    if (/^t\d+$/.test(parts[0] || '')) ev.turn = Number(parts.shift().slice(1));
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
      legend: model.legend !== false,
      now: null,
      jobs: clone(model.jobs || []),
      hypotheses: (model.hypotheses || []).map(function (h) { return { id: h.id, label: h.label, p: h.p }; }),
      votes: {},
      checks: (model.checks || []).map(function (c) { return { id: c.id, label: c.label, state: c.state }; }),
      events: model.events || [],
      log: [],
      step: events.length,
    };
    var turn = 0;
    events.forEach(function (line) {
      var ev = parseEvent(line);
      if (!ev) return;
      turn = ev.turn === null ? turn + 1 : ev.turn;
      out.log.push({ turn: turn, text: ev.raw.replace(/^t\d+\s+/, '') });
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
   * The ceci model from state.md text: optional `title:` and `graph:` header
   * lines, the `jobs:` graph, and an optional `events:` list. Lenient: it is
   * for drawing. `ceci status` validates the file strictly before it draws.
   * A `kind: trouble` or `kind: cela` line makes it the model for that
   * protocol instead, so one player draws all three in chat.
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
        else if (top[1] === 'title') model.title = scalar(top[2] || '') || '';
        else if (top[1] === 'graph') model.graph = scalar(top[2] || '') || 'on';
        else if (top[1] === 'budget') model.budget = scalar(top[2] || '') || 'low';
        else if (top[1] === 'kind' && /^(ceci|trouble|cela)$/.test(scalar(top[2] || '') || '')) model.kind = scalar(top[2]);
        if ((top[2] || '').trim() === '[]') section = top[1] === 'events' ? 'events' : 'jobs';
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

  function layout(jobs) {
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
    var levels = [];
    jobs.forEach(function (j) {
      var lv = depth[j.id];
      if (levels.indexOf(lv) === -1) levels.push(lv);
    });
    levels.sort(function (a, b) { return a - b; });
    var shown = levels.slice(0, MAX_COLS);
    var n = Math.max(shown.length, 1);
    var pitch = n === 1 ? 0 : Math.min(23, Math.floor((W - 3 - BOX_W) / (n - 1)));
    var gutter = pitch - BOX_W;
    var xs = shown.map(function (_, i) { return 2 + i * pitch; });
    var pos = {};
    var overflow = [];
    var rowsUsed = shown.map(function () { return 0; });
    jobs.forEach(function (j) {
      var col = shown.indexOf(depth[j.id]);
      if (col === -1) return;
      var r = rowsUsed[col];
      rowsUsed[col] += 1;
      if (r >= GRAPH_ROWS) return;
      pos[j.id] = { col: col, x: xs[col], y: GRAPH_TOP + r * ROW_PITCH };
    });
    shown.forEach(function (_, col) {
      if (rowsUsed[col] > GRAPH_ROWS) overflow.push({ x: xs[col], more: rowsUsed[col] - GRAPH_ROWS });
    });
    return {
      pos: pos,
      xs: xs,
      gutter: gutter,
      overflow: overflow,
      hiddenCols: levels.length - shown.length,
      hiddenJobs: jobs.filter(function (j) { return shown.indexOf(depth[j.id]) === -1; }).length,
    };
  }

  // ---------------------------------------------------------------- canvas

  function Canvas() {
    this.ch = [];
    this.at = [];
    for (var y = 0; y < H; y += 1) {
      this.ch.push(new Array(W + 1).join(' ').split(''));
      this.at.push(new Array(W + 1).join(' ').split(''));
    }
  }
  Canvas.prototype.put = function (x, y, c, a) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    this.ch[y][x] = c;
    this.at[y][x] = a || ' ';
  };
  Canvas.prototype.text = function (x, y, s, a) {
    for (var i = 0; i < s.length; i += 1) this.put(x + i, y, s.charAt(i), a);
  };
  Canvas.prototype.line = function (x, y, c, a) {
    var cur = this.ch[y] && this.ch[y][x];
    if (cur === undefined) return;
    if ((cur === '-' && c === '|') || (cur === '|' && c === '-') || cur === '+') c = '+';
    this.put(x, y, c, a);
  };
  Canvas.prototype.out = function () {
    return { lines: this.ch.map(function (r) { return r.join(''); }), attrs: this.at.map(function (r) { return r.join(''); }) };
  };

  // ---------------------------------------------------------------- panels

  function edgePath(lay, parent, child) {
    var p = lay.pos[parent.id];
    var c = lay.pos[child.id];
    if (!p || !c) return null;
    var off = Math.max(0, Math.floor((lay.gutter - 1) / 2));
    var g = lay.xs[c.col - 1] + BOX_W + off;
    var y0 = p.y + 1;
    var y1 = c.y + 1;
    var cells = [];
    var x;
    for (x = p.x + BOX_W; x < g; x += 1) cells.push([x, y0, '-']);
    var step = y1 > y0 ? 1 : -1;
    if (y0 === y1) cells.push([g, y0, '-']);
    else {
      cells.push([g, y0, '+']);
      for (var y = y0 + step; y !== y1; y += step) cells.push([g, y, '|']);
      cells.push([g, y1, '+']);
    }
    for (x = g + 1; x < c.x - 1; x += 1) cells.push([x, y1, '-']);
    cells.push([c.x - 1, y1, '>']);
    return cells;
  }

  function statusText(job, tick, budget) {
    var spin = SPIN.charAt(tick % 4);
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

  function drawGraph(cv, model, tick) {
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
        if (cell[2] === '>') cv.put(cell[0], cell[1], '>', a);
        else cv.line(cell[0], cell[1], cell[2], a);
      });
    });
    edges.forEach(function (e, i) {
      var live = e.cells && e.parent.status === 'done' && (e.child.status === 'running' || e.child.status === 'gate');
      if (!live) return;
      var run = e.cells.slice(0, -1);
      if (!run.length) return;
      var at = (tick + i * 3) % run.length;
      cv.put(run[at][0], run[at][1], '*', 'p');
      if (at > 0) cv.put(run[at - 1][0], run[at - 1][1], 'o', 'p');
    });
    model.jobs.forEach(function (job) {
      var p = lay.pos[job.id];
      if (!p) return;
      var edge = job.status === 'done' ? '=' : '-';
      var a = job.status === 'done' ? 'b' : ' ';
      var bar = '+' + new Array(BOX_W - 1).join(edge) + '+';
      cv.text(p.x, p.y, bar, a);
      cv.text(p.x, p.y + BOX_H - 1, bar, a);
      cv.text(p.x, p.y + 1, '|' + pad(job.id + ' ' + job.label, BOX_W - 2) + '|', a);
      var st = statusText(job, tick, model.budget);
      cv.text(p.x, p.y + 2, '|' + pad(st, BOX_W - 2) + '|', job.status === 'gate' ? 'k' : a);
    });
    lay.overflow.forEach(function (o) {
      cv.text(o.x, GRAPH_TOP + GRAPH_ROWS * ROW_PITCH, pad('+' + o.more + ' more', BOX_W), 'd');
    });
    if (lay.hiddenCols > 0) cv.text(W - 14, GRAPH_TOP + GRAPH_ROWS * ROW_PITCH, pad('>> +' + lay.hiddenJobs + ' jobs', 14), 'd');
  }

  function bar(p, width) {
    var n = Math.max(0, Math.min(width, Math.round(p * width)));
    return '[' + new Array(n + 1).join('#') + new Array(width - n + 1).join('.') + ']';
  }

  function drawTrouble(cv, model) {
    var hs = model.hypotheses.slice(0, 8);
    hs.forEach(function (h, i) {
      var line = ' ' + pad(h.id, 3) + ' ' + pad(h.label, 34) + ' ' + bar(h.p, 14) + '  ' + h.p.toFixed(2);
      cv.text(0, GRAPH_TOP + 1 + i, pad(line, W), i === 0 ? 'b' : ' ');
    });
    var votes = ROLES.map(function (role) {
      var v = model.votes[role];
      return role + ' ' + (v ? (v.yes ? 'YES' : 'NO') + (v.score === null || isNaN(v.score) ? '' : ' ' + v.score) : '...');
    });
    var all = ROLES.every(function (r) { return model.votes[r]; });
    var verdict = !all ? 'waiting' : ROLES.every(function (r) { return model.votes[r].yes; }) ? 'fix' : 'distill';
    cv.text(0, GRAPH_TOP + 11, pad(' GATE  ' + votes.join('   '), W), verdict === 'waiting' ? 'k' : 'b');
    cv.text(0, GRAPH_TOP + 12, pad('       -> ' + verdict, W), verdict === 'waiting' ? 'k' : 'b');
  }

  function drawCela(cv, model) {
    var marks = { ok: 'x', fail: '!', open: ' ' };
    model.checks.slice(0, 14).forEach(function (c, i) {
      var mark = marks[c.state] === undefined ? '?' : marks[c.state];
      cv.text(0, GRAPH_TOP + 1 + i, pad(' [' + mark + '] ' + pad(c.id, 4) + ' ' + c.label, W), c.state === 'fail' ? 'k' : c.state === 'ok' ? 'b' : ' ');
    });
    cv.text(0, GRAPH_TOP + 15, pad(' review checklist only: no tool ran, no gate was measured', W), 'd');
  }

  // ---------------------------------------------------------------- render

  /**
   * render(model, { tick, step, reveal, typed }) -> { lines: [24 x 80], attrs: [24 x 80] }
   *   tick    animation counter (spinner, blink, packets, cursor)
   *   step    how many events to apply (default all)
   *   reveal  frames mode: columns shown so far (default 80)
   *   typed   characters of the newest log line typed so far (default all)
   * attrs: ' ' normal, 'i' inverse, 'b' bright, 'd' dim, 'k' blink, 'p' packet.
   */
  function render(input, opts) {
    opts = opts || {};
    var tick = opts.tick || 0;
    var model = applyEvents(input, opts.step);
    var cv = new Canvas();
    var label = model.kind === 'ceci' ? 'ceci' : model.kind;
    var right = 'turn ' + two(model.turn) + '/' + two(countTurns(input.events || [])) + '  graph:' + model.graph + (model.budget === 'low' ? '' : '  ' + model.budget) + ' ';
    var left = ' ceciCela  TUI | ' + label + ': ' + model.title;
    cv.text(0, 0, pad(pad(left, W - right.length) + right, W), 'i');
    if (model.graph === 'off') {
      cv.text(0, 8, pad('', 22) + 'graph off -- type "graph on" to draw', 'd');
    } else if (model.kind === 'trouble') drawTrouble(cv, model);
    else if (model.kind === 'cela') drawCela(cv, model);
    else drawGraph(cv, model, tick);
    if (model.budget !== 'low' && model.now && model.graph !== 'off') {
      // The newest real step, typed out like the log: medium and creator only.
      var said = (model.now.job === null ? '' : model.now.job + ' > ') + model.now.text;
      if (opts.typed !== undefined) said = said.slice(0, Math.max(0, opts.typed));
      cv.text(0, 17, ' NOW ', 'i');
      cv.text(5, 17, pad(' ' + said, W - 5), 'b');
    } else if (model.legend) cv.text(0, 17, pad(LEGEND, W), 'd');
    cv.text(0, 18, '+-- log.md ' + new Array(W - 11).join('-') + '+');
    var recent = model.log.slice(-3);
    for (var i = 0; i < 3; i += 1) {
      var entry = recent[i];
      var text = '';
      if (entry) {
        text = 'turn ' + two(entry.turn) + '  ' + entry.text;
        if (i === recent.length - 1 && opts.typed !== undefined) text = text.slice(0, Math.max(0, opts.typed));
        if (i === recent.length - 1 && tick % 2 === 0) text += '_';
      } else if (i === recent.length && tick % 2 === 0) text = '_';
      cv.text(0, 19 + i, '| ' + pad(text, W - 4) + ' |');
    }
    cv.text(0, 22, '+' + new Array(W - 1).join('-') + '+');
    var events = input.events || [];
    var cost = events.length + 'ev=' + events.reduce(function (n, e) { return n + bytes(e) + 1; }, 0) + 'B';
    cv.text(0, 23, pad(pad(FOOTER, W - cost.length - 1) + ' ' + cost, W));
    var out = cv.out();
    if (opts.reveal !== undefined && opts.reveal < W) {
      var r = Math.max(0, opts.reveal);
      out.lines = out.lines.map(function (l) { return pad(l.slice(0, r), W); });
      out.attrs = out.attrs.map(function (l) { return pad(l.slice(0, r), W); });
    }
    return out;
  }

  function countTurns(events) {
    var turn = 0;
    events.forEach(function (line) {
      var ev = parseEvent(line);
      if (ev) turn = ev.turn === null ? turn + 1 : ev.turn;
    });
    return turn;
  }

  var ANSI = { i: '\u001b[7m', b: '\u001b[1m', d: '\u001b[2m', k: '\u001b[5m', p: '\u001b[1m' };

  /** ANSI for a terminal: phosphor green, or amber with theme 'amber'. */
  function toAnsi(screen, theme) {
    var color = theme === 'amber' ? '\u001b[33m' : '\u001b[32m';
    return screen.lines.map(function (line, y) {
      var attrs = screen.attrs[y];
      var out = color;
      var cur = ' ';
      for (var x = 0; x < line.length; x += 1) {
        var a = attrs.charAt(x);
        if (a !== cur) {
          out += '\u001b[0m' + color + (ANSI[a] || '');
          cur = a;
        }
        out += line.charAt(x);
      }
      return out + '\u001b[0m';
    }).join('\n');
  }

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

  return {
    H: H,
    W: W,
    ROLES: ROLES,
    BUDGETS: BUDGETS,
    applyEvents: applyEvents,
    fromStateMd: fromStateMd,
    layout: layout,
    parseEvent: parseEvent,
    render: render,
    toAnsi: toAnsi,
    toHtml: toHtml,
  };
}));
