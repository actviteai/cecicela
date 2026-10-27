# Graph view: drawing rules

The graph view is an 80x24 screen in plain ASCII, drawn the way a BBS door game would: boxes for jobs, `-->` edges, a title bar, a log panel, and a command line along the bottom. Plain ASCII is identical on every host and every terminal; in text, never use Unicode box-drawing characters (the player's ansi theme draws its own). The same rules drive `ceci status --watch` in a terminal and the HTML player, from one renderer (`tui.js`), so a screen drawn here should match theirs character for character.

## You emit events, not frames

After every state change, emit one event line. Never draw animation frames yourself: the player and the CLI compute every moving part (packets, spinner, blink, typing) from these lines.

| Protocol | Event line | Meaning |
| --- | --- | --- |
| ceci | `<job> <status> [cela:<token>] [gate:<word>]` | status is ready, running, blocked, done, or gate; cela token is ok, pending, stalled, blocked, or missing_test |
| ceci | `<job> step <what happened, with its real result>` | real work on a running job (medium and creator budgets) |
| any | `step <what happened>` | real progress in this conversation: evidence received, the graph written (medium and creator) |
| trouble | `h <H#> <p> <label>` | hypothesis H# now has posterior p (0 to 1) |
| trouble | `vote <role> <yes\|no> <N>` | that role's gate vote and its N/10 score |
| cela | `check <id> <ok\|fail\|open> <label>` | a checklist item's state |

A line may start with `@YYYY-MM-DDTHH:MMZ`, the UTC minute it happened, when you know the time from this conversation (the host told you, or the user's pasted output shows it); never guess one. Without it, the log numbers the events (`#07`). A line may also start with `tNN` to set the turn number. Examples: `j4 running cela:pending`, `j4 done cela:ok`, `j3 done gate:approved`, `h H1 0.61 stale edge cache after deploy`, `vote detective no 5`.

## Layout (ceci)

Every row comes from `state.md`; nothing on the screen is decoration that claims work.

- Row 0, the title bar: ` ceciCela | ceci: <title>` on the left; `<done>/<total> done  <budget>` on the right (` graph:<mode>` in front when it is not `on`).
- Rows 1 to 15, the graph. Depth = 0 for a job with no dependencies, else 1 + the deepest dependency. Four depths to a band, side by side; a fifth depth wraps to a new band under the first, and the edge into it runs down the right gutter, back along the gap row, and down into the new band. A band is as tall as its busiest depth (at most three boxes); more boxes show as `+N more`.
- When the graph does not fit, the view follows the work: it starts one depth before the earliest running or gate job (else the earliest ready or blocked one). Row 16 says what is out of view: `<< N earlier`, `N later >>`.
- Boxes are 16 wide and 4 tall: border `+--------------+` when not done, `+==============+` when done; line 2 `|<id> <goal>|`, cut to 14; line 3 the status: ` done  cela OK`, ` done`, ` | run  cela..` (the first mark is the spinner `| / - \`), ` | running`, ` | 2 steps` (creator), ` ! GATE: human` (it blinks), ` ready`, ` pending`, or ` cela:STALLED` and the like.
- Edges leave the parent's line 2 and enter the child's line 2 with `->`; corners and crossings are `+`. Packets (`*` with an `o` trail) move along edges from a done parent into a running or gate job.
- Row 16, the summary: a 16-cell bar and the real counts (` [###########.....] 4/6 done  1 running  1 at gate  2 ready`).
- Row 17, the focus: `NOW   <job> > <newest step>` (medium and creator, when there is a step), else `GATE`, `RUN`, or `NEXT` with the job that needs attention, else `DONE`. `legend` swaps in ` LEGEND +--+ pending  +==+ done  |/-\ running  ! GATE waiting  * packet --> deps`.
- Rows 18 to 22, the log panel: `+-- log.md ---...+` and the last three events, each labelled with its minute (`05:56Z`), its turn (`turn 12`), or its number (`#11`); a `_` cursor after the newest.
- Row 23, in text: ` type: help  budget <level>  animate  graph on|off  legend` and, on the right, `as of <HH:MM>Z` (the newest stamped event), or `<n> ev <bytes>B` when no event is stamped. The player puts its keys here instead (below).

trouble and cela keep the same title bar, log panel, and footer. trouble's centre panel is one posterior bar per hypothesis (` H1  <label>  [##########....]  0.61`) and the gate: one line of votes (` GATE  keeper YES 7   detective NO 5   maintainer YES 8   physicist YES 7`) and, under it, the outcome (`       -> distill`, `-> fix`, or `-> waiting`). cela's is the checklist (` [x] C1   <label>`, `[!]` for fail, `[ ]` for open).

## Budget

`budget:` in `state.md` (after `graph:`) is how often you update the view, and that is all the animation costs: the spinner, packets, blink, typing, and the NOW ticker are drawn by the player for free. The user sets it with ceci's start question or by typing `budget low`, `budget medium`, or `budget creator`. The default is `low`. trouble and cela keep it for the conversation.

| | low | medium | creator |
| --- | --- | --- | --- |
| Event lines | state changes only: job status, posteriors and votes, checklist items | plus up to three `step` lines per turn, at real milestones | plus a `step` line for every real thing that happened this turn |
| Player, when built | one edit per turn that changed something, appending that turn's lines | the same | the same |
| Text screen, without a player | only when the user asks | when the graph's shape changes | every turn that changed something (about 600 tokens each) |
| What the screen adds | nothing | the NOW ticker: the newest step | the ticker, step counts on running boxes, and, in the player, effects on real changes only: the newest event's job flashes, a job that just finished throws sparks, the title cycles colours; the ansi theme by default |

A step is honest at every budget:

- It is something that happened in this conversation: the user pasted output (copy its numbers exactly), you wrote or changed the graph, the user answered a gate. Never work the user has not reported, or anything in a coding agent you did not see.
- It is written after it happened, never as intent: `step user pasted npm test: 41 pass, 0 fail`, not `step running tests`.
- No estimates, no progress percentages nobody printed, no activity invented to keep the screen moving. A lower budget shows less, never something different.

## Toggles

`graph on`, `graph off`, `graph frames`, `legend`, `animate`, and `budget low|medium|creator` may appear anywhere in a user turn. `animate` builds the live player where the host has a surface for it (below), and turns the graph on. Store `graph:` in `state.md` (omit it when it is `on`). `graph off` stops all drawing for the rest of the run, and stays off after `state.md` is re-uploaded. `graph frames` reveals the first screen column by column: in text, that is three code blocks of the same screen cut at column 27, 54, and 80. `show graph` draws the text screen once, in a code block, at any budget. `help` lists these. Confirm each one in one line before anything else that turn.

## The player

The player's bottom row is its only key panel; each `[X]` is also a button: G graph, L legend, B budget, T theme (phosphor, amber, or ansi: the 16-colour BBS palette with box-drawing lines), space pause, R replay the events from the first, - + speed. B opens a panel that explains the three budgets and copies `budget <level>` for the user to paste here: the page cannot change how often you update it, only the chat can. Its footer shows the newest event's minute and its age (`05:40Z 12m ago`), so a page you have not updated looks stale instead of current.

After each update, say in one line what it now shows: `view: <done>/<total> done, as of <HH:MM>Z` (leave out `as of` when no event is stamped). When the budget skips an update, or you cannot make one, say `view not updated`. Never let the page show a state that `state.md` does not have.

## Where the screen goes

| Host | Surface, when the user chose the live player | Each turn |
| --- | --- | --- |
| Claude | an artifact built once from `graph-player.html` | edit the artifact: append the event line to its `EVENTS` array |
| ChatGPT | a canvas document built once from `graph-player.html` | edit the canvas in place: append the event line |
| Grok | a Grok Studio window built once from `graph-player.html`, when it opens from this chat | edit in place: append the event line |
| Microsoft 365 Copilot, anywhere without a live HTML surface, or the user did not choose the player | the reply | the event line; the full 80x24 screen in a code block only when the graph's shape changed or the user asks |

The player is about 35 KB (roughly 10,000 tokens), so it is built only when the user chose it: ceci's start question, or typing `animate`. Emitting it again every turn would undo what the event lines save, so a conversation contains it once. A new conversation rebuilds it once from `state.md`, whose `events:` list carries the history.

To build it, replace the `STATE` string with the `state.md` text above its `events:` list, and put the events in `EVENTS`, one per line. For trouble or cela there is no `state.md`: `STATE` is `kind: trouble` (or `kind: cela`) and a `title:` line, for example `"kind: trouble\ntitle: \"stale page after deploy\"\n"`, and the `h`, `vote`, or `check` lines go in `EVENTS`.
