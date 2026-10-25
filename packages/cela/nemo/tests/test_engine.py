"""cela_nat.engine against the real cela.js. No NeMo Agent Toolkit needed."""

import asyncio
import json
import sys
from pathlib import Path

import pytest

from cela_nat.engine import Engine
from cela_nat.engine import default_engine_path
from cela_nat.engine import resolve_engine
from cela_nat.engine import run_engine

from conftest import TEST_CMD
from conftest import fix


def test_default_engine_path_follows_cela_home():
    assert default_engine_path({"CELA_HOME": "/x"}) == Path("/x/skills/cela/tool/cela.js")
    assert default_engine_path({"HOME": "/h"}) == Path("/h/.cela/skills/cela/tool/cela.js")


async def test_full_loop_reaches_complete_with_the_engines_own_verdicts(buggy_repo, engine_path):
    e = Engine(str(buggy_repo), engine_path)

    assert (await e.gate())["verdict"] == "UNCLEAR_TASK"
    started = await e.start("LOW", ["src/add.js"], [TEST_CMD], task="make add add", reqs=["adds two numbers"])
    assert started["ok"], started
    assert ": risk LOW, depth lean" in started["stdout"]
    assert "requirements: 1 (R1)" in started["stdout"]

    failing = await e.check()
    assert failing["ok"] and "runtime  fail" in failing["stdout"]
    assert "cela gate: CONTINUE" in failing["stdout"], "check returns the verdict itself"
    g = await e.gate()
    assert (g["verdict"], g["exit_code"], g["ok"]) == ("CONTINUE", 3, True)
    assert any("runtime is fail" in r for r in g["reasons"])
    assert any("coverage is fail" in r for r in g["reasons"])

    fix(buggy_repo)
    bad = await e.cover("R1", "test/add.test.js", "not in the file")
    assert bad["ok"] is False and "is not in test/add.test.js" in bad["error"]
    assert (await e.cover("R1", "test/add.test.js", "adds"))["ok"]
    checked = await e.check()
    assert checked["ok"] and "cela gate: COMPLETE" in checked["stdout"]
    done = await e.gate()
    assert (done["verdict"], done["exit_code"]) == ("COMPLETE", 0)

    state = await e.state()
    assert state["ok"] and state["task"] is True
    assert state["spec"]["files"] == ["src/add.js"]
    assert state["spec"]["task"] == "make add add"
    assert state["spec"]["reqs"] == [{"id": "R1", "text": "adds two numbers"}]
    assert state["covers"] == [{"req": "R1", "file": "test/add.test.js", "text": "adds"}]
    assert state["rounds"] == 2
    assert state["gate"]["verdict"] == "COMPLETE"
    # gate's result is the engine's JSON, untouched apart from ok/exit_code.
    raw = json.loads((await run_engine(["gate", "--json"], repo_dir=str(buggy_repo), cela_js_path=engine_path))["stdout"])
    assert {k: v for k, v in done.items() if k not in ("ok", "exit_code")} == raw


async def test_non_continue_verdicts_are_answers_not_errors(buggy_repo, engine_path):
    e = Engine(str(buggy_repo), engine_path)
    assert (await e.start("LOW", ["src/add.js"], [TEST_CMD]))["ok"]
    assert (await e.note("blocker", "need the product decision on rounding"))["ok"]
    g = await e.gate()
    assert (g["ok"], g["verdict"], g["exit_code"]) == (True, "BLOCKED", 1)
    assert g["reasons"] == ["need the product decision on rounding"]


async def test_usage_errors_come_back_as_readable_errors(buggy_repo, engine_path):
    e = Engine(str(buggy_repo), engine_path)
    bad = await e.start("SEVERE", ["src/add.js"], [TEST_CMD])
    assert bad["ok"] is False and bad["exit_code"] == 2
    assert "start needs --risk" in bad["error"]
    secret = await e.note("decision", "token=abcdef123456")
    assert secret["ok"] is False and "secret" in secret["error"]


async def test_claims_and_plan_amendments_reach_the_log(buggy_repo, engine_path):
    e = Engine(str(buggy_repo), engine_path)
    await e.start("CRITICAL", ["src/add.js"], [TEST_CMD], no_defect=True)
    assert (await e.claim("Node 22 has node:test", external=True, source="https://nodejs.org/api/test.html"))["ok"]
    assert (await e.plan("release note", add=["NOTES.md"]))["ok"]
    state = await e.state()
    assert state["spec"]["files"] == ["src/add.js", "NOTES.md"]
    log = [json.loads(line) for line in (buggy_repo / ".cela" / "state.jsonl").read_text().splitlines()]
    claim = next(ev for ev in log if ev["kind"] == "claim")
    assert (claim["external"], claim["verified"], claim["source"]) == (True, False, "https://nodejs.org/api/test.html")


async def test_missing_engine_node_or_repo_is_an_error_not_an_exception(tmp_path, buggy_repo, engine_path):
    gone = await Engine(str(buggy_repo), str(tmp_path / "nope.js")).gate()
    assert gone["ok"] is False and "engine not found" in gone["error"]
    assert "install --global-only" in gone["error"]
    no_node = await Engine(str(buggy_repo), engine_path, node="definitely-not-node-xyz").state()
    assert no_node["ok"] is False and "Node.js 22" in no_node["error"]
    no_repo = await Engine(str(tmp_path / "missing"), engine_path).state()
    assert no_repo["ok"] is False and "repo_dir does not exist" in no_repo["error"]
    with pytest.raises(Exception, match="engine not found"):
        resolve_engine(str(tmp_path / "nope.js"))


async def test_timeout_kills_the_engine(tmp_path, buggy_repo):
    slow = tmp_path / "slow.js"
    slow.write_text("setTimeout(() => {}, 60000);\n")
    started = asyncio.get_running_loop().time()
    out = await Engine(str(buggy_repo), str(slow), timeout_s=0.5).gate()
    assert out["ok"] is False and "timed out after 0.5s" in out["error"]
    assert asyncio.get_running_loop().time() - started < 10


@pytest.mark.skipif(sys.platform == "win32", reason="process groups are POSIX")
async def test_timeout_also_stops_the_commands_check_started(tmp_path, buggy_repo, engine_path):
    """`check` runs the repo's commands through a shell; a timeout must not leave them running."""
    marker = tmp_path / "survivor"
    hang = f"sleep 3 && touch {marker}"
    e = Engine(str(buggy_repo), engine_path, timeout_s=1.0)
    assert (await e.start("LOW", ["src/add.js"], [hang]))["ok"]
    out = await e.check()
    assert out["ok"] is False and "timed out" in out["error"]
    await asyncio.sleep(3.5)
    assert not marker.exists(), "the test command outlived the timeout"


async def test_concurrent_calls_run_one_at_a_time(buggy_repo, engine_path):
    """tool_calling_agent runs one turn's tool calls concurrently; gate must see check's round."""
    e = Engine(str(buggy_repo), engine_path)
    assert (await e.start("LOW", ["src/add.js"], [TEST_CMD], reqs=["adds"]))["ok"]
    fix(buggy_repo)
    assert (await e.cover("R1", "test/add.test.js", "adds"))["ok"]
    checked, gated = await asyncio.gather(e.check(), e.gate())
    assert checked["ok"], checked
    assert gated["verdict"] == "COMPLETE", gated


async def test_plan_amends_the_file_list_so_an_extra_file_can_pass(buggy_repo, engine_path):
    e = Engine(str(buggy_repo), engine_path)
    assert (await e.start("LOW", ["src/add.js"], [TEST_CMD]))["ok"]
    assert (await e.req("adds negatives"))["ok"], "a clause can be added after start"
    fix(buggy_repo)
    (buggy_repo / "test" / "more.test.js").write_text(
        "const test = require('node:test');\nconst assert = require('node:assert/strict');\n"
        "test('adds negatives', () => assert.equal(require('../src/add')(-1, -2), -3));\n"
    )
    await e.check()
    first = await e.gate()
    assert first["verdict"] == "CONTINUE" and any("unplanned: test/more.test.js" in r for r in first["reasons"]), first
    assert (await e.plan("cover negative numbers", add=["test/more.test.js"]))["ok"]
    assert (await e.cover("R1", "test/more.test.js", "adds negatives"))["ok"]
    await e.check()
    assert (await e.gate())["verdict"] == "COMPLETE"
    missing_why = await e.plan("")
    assert missing_why["ok"] is False and "--why" in missing_why["error"]


async def test_arguments_are_passed_as_argv_not_through_a_shell(buggy_repo, engine_path):
    e = Engine(str(buggy_repo), engine_path)
    await e.start("LOW", ["src/add.js"], [TEST_CMD])
    text = "keep `add` pure; $(touch pwned) && rm -rf / ; 'quotes'"
    assert (await e.note("decision", text))["ok"]
    assert not (buggy_repo / "pwned").exists()
    notes = (await e.state())["notes"]
    assert notes[-1]["text"] == text


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX path semantics")
def test_engine_module_does_not_import_the_toolkit():
    import importlib
    import cela_nat.engine as engine_module

    importlib.reload(engine_module)
    assert "nat" not in {name.split(".")[0] for name in vars(engine_module) if not name.startswith("_")}
