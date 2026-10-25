"""NeMo Agent Toolkit plugin: cela as one function group.

    function_groups:
      cela:
        _type: cela
        repo_dir: /path/to/repo
    workflow:
      tool_names: [cela]   # cela__start, __plan, __req, __cover, __check, __gate, __claim, __note, __state

Each tool runs the Node engine (cela.js) through ``cela_nat.engine``. The
engine decides; these tools only pass arguments through and return what the
engine printed. Expected failures come back as ``{"ok": false, "error": ...}``
rather than exceptions, so the model can read them.

Loaded through the ``nat.plugins`` entry point (see pyproject.toml). Keep
``from __future__ import annotations`` out of this module: NeMo Agent Toolkit
1.8 reads tool signatures without evaluating string annotations.
"""

from typing import Annotated
from typing import Any
from typing import Literal

from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field

from nat.plugin_api import Builder
from nat.plugin_api import FunctionGroup
from nat.plugin_api import FunctionGroupBaseConfig
from nat.plugin_api import register_function_group

from cela_nat.engine import Engine
from cela_nat.engine import resolve_engine

TOOLS = ("start", "plan", "req", "cover", "check", "gate", "claim", "note", "state")


class CelaConfig(FunctionGroupBaseConfig, name="cela"):
    """cela tools: the engine runs the checks and names the verdict, so the model never grades its own work."""

    repo_dir: str = Field(default=".", description="Repository the engine works in (its git root is used).")
    cela_js_path: str | None = Field(
        default=None,
        description="Path to cela.js. Default: $CELA_HOME/skills/cela/tool/cela.js (`cela install --global-only`).",
    )
    node: str = Field(default="node", description="Node.js 22+ executable.")
    timeout_s: float = Field(
        default=1800.0,
        gt=0,
        description="Per-call timeout in seconds. `check` runs the repo's commands; the engine stops each after 10 minutes.",
    )


class NoInput(BaseModel):
    """Takes no arguments."""

    model_config = ConfigDict(extra="ignore")


DESCRIPTIONS = {
    "start": (
        "Call this once, before editing. Records what 'done' means: risk, the task in one line, its requirements "
        "(one testable clause each; the gate needs at least one), every file you will change (tests included), and the "
        "commands that must pass. For a bug fix give `repro` (a command that fails now) and call check with before=true "
        "before editing; when nothing is broken set no_defect=true. The result lists memory records that match the task. "
        "Calling start again begins a new task and archives the current one; use plan and req to change the current one."
    ),
    "plan": "Change the planned files mid-task, with the reason. Call it before check when you must touch a file you did not list.",
    "req": "Add one requirement: a testable clause of the request. Each requirement must be covered by a test before the task can complete.",
    "cover": (
        "Tie a requirement (R1, R2, ...) to the test that proves it: the test file and text that names the test. "
        "The file must be a test file that exists and contains the text, or the call is refused. Call it after writing the test."
    ),
    "check": (
        "Run the required commands, score the oracles, and return the verdict (COMPLETE, CONTINUE, STALLED, BLOCKED, "
        "MISSING_TEST, UNCLEAR_TASK) with its reasons. Call after editing and covering. before=true runs only the repro, "
        "before any source edit. On CONTINUE fix the first reason, then check again. Call one cela tool at a time."
    ),
    "gate": (
        "Reprint the current verdict (COMPLETE, CONTINUE, STALLED, BLOCKED, MISSING_TEST, UNCLEAR_TASK) with its reasons, "
        "without running anything; check already returned it. Report the verdict exactly as returned; never claim "
        "COMPLETE unless check or this tool returned it."
    ),
    "claim": "Record a fact from outside the repository the change relies on. Set verified=true only after you read its source.",
    "note": "Log an assumption, decision, risk, question, or blocker. A blocker makes gate report BLOCKED; then stop and say what you need.",
    "state": "Show the task: the plan, rounds used, the last check, recent notes, and what gate would say now. Writes nothing.",
}


@register_function_group(config_type=CelaConfig)
async def cela(config: CelaConfig, builder: Builder):
    # Fail at build time, not on the model's first call, when node or the engine is missing.
    resolve_engine(config.cela_js_path, config.node)
    engine = Engine(config.repo_dir, config.cela_js_path, config.node, config.timeout_s)
    group = FunctionGroup(config=config)

    async def start(
        risk: Annotated[
            Literal["LOW", "MODERATE", "HIGH", "CRITICAL"],
            Field(description="LOW local/easy to revert; MODERATE shared code or behavior change; HIGH persistence, "
                  "security, public API, concurrency; CRITICAL money, auth, destructive ops, migrations."),
        ],
        files: Annotated[list[str], Field(description="Every file you intend to change, repo-relative, including tests.")],
        run: Annotated[list[str], Field(description="Commands that must pass, e.g. ['npm test']. Use the repo's real test command.")],
        repro: Annotated[str | None, Field(description="Bug fixes: a command that fails now and must pass after.")] = None,
        no_defect: Annotated[bool, Field(description="True when nothing is broken (HIGH/CRITICAL then need no repro).")] = False,
        depth: Annotated[Literal["lean", "full"] | None, Field(description="full adds discovery and audit steps.")] = None,
        task: Annotated[str | None, Field(description="The request in one line, as the user put it.")] = None,
        reqs: Annotated[list[str] | None, Field(description="The request's testable clauses, one per entry, including errors, empty input, and boundaries.")] = None,
    ) -> dict[str, Any]:
        return await engine.start(risk, files, run, repro=repro, no_defect=no_defect, depth=depth, task=task, reqs=reqs)

    async def req(
        text: Annotated[str, Field(description="One testable clause of the request.")],
    ) -> dict[str, Any]:
        return await engine.req(text)

    async def cover(
        req: Annotated[str, Field(description="The requirement id, e.g. R1.")],
        file: Annotated[str, Field(description="The test file, repo-relative.")],
        text: Annotated[str, Field(description="Text that is in that file and names the test, e.g. its title.")],
    ) -> dict[str, Any]:
        return await engine.cover(req, file, text)

    async def plan(
        why: Annotated[str, Field(description="Why the plan changed. It is logged.")],
        add: Annotated[list[str] | None, Field(description="Files to add to the plan, repo-relative.")] = None,
        drop: Annotated[list[str] | None, Field(description="Files to remove from the plan.")] = None,
    ) -> dict[str, Any]:
        return await engine.plan(why, add=add, drop=drop)

    async def check(
        before: Annotated[bool, Field(description="Run only the repro, before editing source, to prove the bug exists.")] = False,
    ) -> dict[str, Any]:
        return await engine.check(before=before)

    async def gate(args: NoInput) -> dict[str, Any]:
        return await engine.gate()

    async def claim(
        text: Annotated[str, Field(description="The fact, in one sentence.")],
        source: Annotated[str | None, Field(description="URL or path the fact comes from.")] = None,
        verified: Annotated[bool, Field(description="True only after you read the source.")] = False,
        off_path: Annotated[bool, Field(description="True when the fact does not affect the changed code.")] = False,
    ) -> dict[str, Any]:
        return await engine.claim(text, external=True, source=source, verified=verified, off_path=off_path)

    async def note(
        type: Annotated[  # noqa: A002 - the engine's word, and what the model sees
            Literal["assumption", "decision", "risk", "blocker", "question"],
            Field(description="Kind of note. A blocker stops the task as BLOCKED."),
        ],
        text: Annotated[str, Field(description="The note. Never include secrets.")],
    ) -> dict[str, Any]:
        return await engine.note(type, text)

    async def state(args: NoInput) -> dict[str, Any]:
        return await engine.state()

    for fn in (start, plan, req, cover, check, gate, claim, note, state):
        group.add_function(fn.__name__, fn, description=DESCRIPTIONS[fn.__name__])

    yield group
