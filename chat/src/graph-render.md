# Graph view: drawing rules

The graph view is an 80x24 screen in plain ASCII, drawn the way a BBS door game would: boxes for jobs, `-->` edges, a title bar, a log panel, hotkeys along the bottom. Plain ASCII is identical on every host and every terminal; never use Unicode box-drawing characters. The same rules drive `ceci status --watch` in a terminal and the HTML player, from one renderer (`tui.js`), so a screen drawn here should match theirs character for character.

## You emit events, not frames

After every state change, emit one event line. Never draw animation frames yourself: the player and the CLI compute every moving part (packets, spinner, blink, typing) from these lines.

| Protocol | Event line | Meaning |
| --- | --- | --- |
| ceci | `<job> <status> [cela:<token>] [gate:<word>]` | status is ready, running, blocked, done, or gate; cela token is ok, pending, stalled, blocked, or missing_test |
| trouble | `h <H#> <p> <label>` | hypothesis H# now has posterior p (0 to 1) |
| trouble | `vote <role> <yes\|no> <N>` | that role's gate vote and its N/10 score |
| cela | `check <id> <ok\|fail\|open> <label>` | a checklist item's state |

A line may start with `tNN` to set the turn number; otherwise each event is the next turn. Examples: `j4 running cela:pending`, `j4 done cela:ok`, `j3 done gate:approved`, `h H1 0.61 stale edge cache after deploy`, `vote detective no 5`.

## Layout (ceci)

- Row 0 is the title bar: ` ceciCela  TUI | ceci: <title>`, and on the right `turn NN/NN  graph:<mode>`.
- Rows 1 to 16 are the graph. Column = depth (a job with no dependencies is depth 0; otherwise 1 + the deepest dependency). Row = order within that column, at most three rows; more show as `+N more`. At most four columns; more show as `>> +N jobs`.
- Boxes are 16 wide and 4 tall. Columns start at x = 2 and step by 23 (20 when there are four columns). Rows start at y = 1 and step by 5.
- Border: `+--------------+` when the job is not done, `+==============+` when it is done.
- Line 2 of a box: `|<id> <goal>|`, cut to 14 characters.
- Line 3 of a box, the status: ` done  cela OK` (done, gate COMPLETE), ` done`, ` | run  cela..` (running with cela pending; the first mark is the spinner `| / - \`), ` | running`, ` ! GATE: human` (a gate job; it blinks), ` ready`, ` pending`, or ` cela:STALLED` and the like.
- Edges leave the parent's right side on its line 2, run to the gutter before the child's column, bend once with `+`, run vertically with `|`, and enter the child's line 2 with `->`. Crossing lines become `+`. Edges from a done parent are bright; from an unfinished parent, dim.
- Packets (`*` with an `o` trail) move along every edge from a done parent into a running or gate job.
- Row 17: the legend, ` LEGEND +--+ pending  +==+ done  |/-\ running  ! GATE waiting  * packet --> deps`, shown unless the user typed `legend` to hide it.
- Rows 18 to 22: the log panel, `+-- log.md ----...+`, the last three events as `| turn NN  <event>`, a `_` cursor after the newest.
- Row 23: ` [G]raph [F]rames [L]egend [SPC]pause [S]tep [T]heme [-+]speed [R]eset` and, on the right, `<n>ev=<bytes>B`: the number of events and their total size.

trouble and cela keep the same title bar, log panel, and footer. trouble's centre panel is one posterior bar per hypothesis (` H1  <label>  [##########....]  0.61`) and the gate: one line of votes (` GATE  keeper YES 7   detective NO 5   maintainer YES 8   physicist YES 7`) and, under it, the outcome (`       -> distill`, `-> fix`, or `-> waiting`). cela's is the checklist (` [x] C1   <label>`, `[!]` for fail, `[ ]` for open).

## Toggles

`graph on`, `graph off`, `graph frames`, and `legend` may appear anywhere in a user turn. Store `graph:` in `state.md` (omit it when it is `on`). `graph off` stops all drawing for the rest of the run, and stays off after `state.md` is re-uploaded. `graph frames` reveals the first screen column by column: in text, that is three code blocks of the same screen cut at column 27, 54, and 80.

## Where the screen goes

| Host | Surface | Each turn |
| --- | --- | --- |
| Claude | an artifact built once from `graph-player.html` | edit the artifact: append the event line to its `EVENTS` array |
| ChatGPT | a canvas document built once from `graph-player.html` | edit the canvas in place: append the event line |
| Grok | a Grok Studio window built once from `graph-player.html`, when it opens from this chat | edit in place: append the event line |
| Microsoft 365 Copilot, or anywhere without a live HTML surface | the reply | the event line; the full 80x24 screen in a code block only when the graph's shape changed or the user asks |

The player is about 10 KB. Emitting it again every turn would undo what the event lines save, so a conversation contains it once. A new conversation rebuilds it once from `state.md`, whose `events:` list carries the history.
