"""The NeMo Agent Toolkit plugin. Skipped unless nvidia-nat-core is importable."""

import json
from pathlib import Path

import pytest

pytest.importorskip("nat.plugin_api", reason="nvidia-nat-core is not installed")

from nat.builder.workflow_builder import WorkflowBuilder  # noqa: E402  (the toolkit's own docs test with it)
from nat.runtime.loader import PluginTypes  # noqa: E402
from nat.runtime.loader import discover_and_register_plugins  # noqa: E402
from nat.runtime.loader import discover_entrypoints  # noqa: E402

from cela_nat.register import CelaConfig  # noqa: E402
from cela_nat.register import TOOLS  # noqa: E402

from conftest import TEST_CMD  # noqa: E402
from conftest import fix  # noqa: E402


def test_entry_point_is_discovered_and_registers_the_group():
    """A plugin that fails to import is only logged by the loader, so check it explicitly."""
    from nat.cli.type_registry import GlobalTypeRegistry

    assert "cela" in {ep.name for ep in discover_entrypoints(PluginTypes.COMPONENT)}
    discover_and_register_plugins(PluginTypes.COMPONENT)
    assert GlobalTypeRegistry.get().get_function_group(CelaConfig).config_type is CelaConfig
    assert CelaConfig.static_type() == "cela"


async def test_group_exposes_every_tool_named_after_the_yaml_key(buggy_repo, engine_path):
    async with WorkflowBuilder() as b:
        group = await b.add_function_group("cela", CelaConfig(repo_dir=str(buggy_repo), cela_js_path=engine_path))
        assert sorted(await group.get_accessible_functions()) == sorted(f"cela__{t}" for t in TOOLS)


async def test_tool_schemas_are_what_the_model_needs():
    """The JSON schema an LLM sees for each tool (what tool_calling_agent passes to bind_tools)."""
    pytest.importorskip("nat.plugins.langchain", reason="nvidia-nat-langchain is not installed")
    discover_and_register_plugins(PluginTypes.COMPONENT)
    from langchain_core.utils.function_calling import convert_to_openai_tool  # noqa: PLC0415
    from nat.plugin_api import LLMFrameworkEnum  # noqa: PLC0415

    async with WorkflowBuilder() as b:
        await b.add_function_group("cela", CelaConfig(cela_js_path=str(Path(__file__).resolve().parents[2] / "skill" / "tool" / "cela.js")))
        tools = {t.name: convert_to_openai_tool(t)["function"] for t in await b.get_tools(["cela"], wrapper_type=LLMFrameworkEnum.LANGCHAIN)}
    assert set(tools) == {f"cela__{t}" for t in TOOLS}
    start = tools["cela__start"]["parameters"]
    assert start["required"] == ["risk", "files", "run"]
    assert start["properties"]["risk"]["enum"] == ["LOW", "MODERATE", "HIGH", "CRITICAL"]
    assert tools["cela__note"]["parameters"]["properties"]["type"]["enum"] == ["assumption", "decision", "risk", "blocker", "question"]
    assert tools["cela__plan"]["parameters"]["required"] == ["why"]
    assert tools["cela__req"]["parameters"]["required"] == ["text"]
    assert tools["cela__cover"]["parameters"]["required"] == ["req", "file", "text"]
    assert tools["cela__gate"]["parameters"]["properties"] == {}
    assert tools["cela__state"]["parameters"]["properties"] == {}
    assert "never claim COMPLETE" in tools["cela__gate"]["description"]
    for name, spec in tools.items():
        assert spec["description"] and spec["description"] != name, f"{name} has no description"


async def test_tools_drive_the_engine_from_start_to_complete(buggy_repo, engine_path):
    async with WorkflowBuilder() as b:
        await b.add_function_group("cela", CelaConfig(repo_dir=str(buggy_repo), cela_js_path=engine_path, include=list(TOOLS)))
        tool = {t: await b.get_function(f"cela__{t}") for t in TOOLS}

        started = await tool["start"].ainvoke({"risk": "LOW", "files": ["src/add.js"], "run": [TEST_CMD], "task": "make add add", "reqs": ["adds two numbers"]})
        assert started["ok"], started
        checked = await tool["check"].ainvoke({})
        assert "cela gate: CONTINUE" in checked["stdout"]
        assert (await tool["gate"].ainvoke({}))["verdict"] == "CONTINUE"
        await tool["note"].ainvoke({"type": "decision", "text": "fix the operator, not the test"})
        await tool["plan"].ainvoke({"why": "keep the plan honest", "drop": ["README.md"]})
        await tool["claim"].ainvoke({"text": "node:test ships with Node 22", "source": "https://nodejs.org/api/test.html", "verified": True})
        fix(buggy_repo)
        assert (await tool["cover"].ainvoke({"req": "R1", "file": "test/add.test.js", "text": "adds"}))["ok"]
        await tool["check"].ainvoke({"before": False})
        done = await tool["gate"].ainvoke({})
        state = await tool["state"].ainvoke({})

    assert done["verdict"] == "COMPLETE", done
    assert state["gate"]["verdict"] == "COMPLETE"
    assert state["notes"][-1]["text"] == "fix the operator, not the test"
    kinds = [json.loads(line)["kind"] for line in (buggy_repo / ".cela" / "state.jsonl").read_text().splitlines()]
    assert kinds == ["start", "check", "gate", "gate", "note", "plan", "claim", "cover", "check", "gate", "gate"]


async def test_bad_tool_input_is_rejected_before_the_engine_runs(buggy_repo, engine_path):
    async with WorkflowBuilder() as b:
        await b.add_function_group("cela", CelaConfig(repo_dir=str(buggy_repo), cela_js_path=engine_path, include=["start"]))
        start = await b.get_function("cela__start")
        with pytest.raises(Exception, match="validation error"):
            await start.ainvoke({"risk": "SEVERE", "files": [], "run": []})
    assert not (buggy_repo / ".cela").exists()


async def test_missing_engine_fails_at_build_time(tmp_path):
    async with WorkflowBuilder() as b:
        with pytest.raises(Exception, match="engine not found"):
            await b.add_function_group("cela", CelaConfig(cela_js_path=str(tmp_path / "nope.js")))
