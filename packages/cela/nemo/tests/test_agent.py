"""A real tool_calling_agent drives the cela tools, with a scripted model instead of an LLM.

This proves the wiring a real model would use: workflow YAML -> agent ->
cela__* tools -> cela.js -> verdict. The scripted model cannot judge
anything; the engine's verdict is what the test checks. Skipped unless
nvidia-nat-langchain is installed (pip install ".[agents,test]").
"""

from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("nat.plugin_api", reason="nvidia-nat-core is not installed")
pytest.importorskip("nat.plugins.langchain", reason="nvidia-nat-langchain is not installed")

import yaml  # noqa: E402  (a toolkit dependency)
from pydantic import BaseModel  # noqa: E402
from pydantic import Field  # noqa: E402

from nat.plugin_api import Builder  # noqa: E402
from nat.plugin_api import LLMBaseConfig  # noqa: E402
from nat.plugin_api import LLMFrameworkEnum  # noqa: E402
from nat.plugin_api import LLMProviderInfo  # noqa: E402
from nat.plugin_api import register_llm_client  # noqa: E402
from nat.plugin_api import register_llm_provider  # noqa: E402
from nat.runtime.loader import load_workflow  # noqa: E402

from conftest import TEST_CMD  # noqa: E402


class ScriptedTurn(BaseModel):
    content: str = ""
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


class ScriptedLLMConfig(LLMBaseConfig, name="cela_test_scripted_llm"):
    """Replays fixed AI messages. Test-only; registered when this module is imported."""

    script: list[ScriptedTurn] = Field(default_factory=list)


@register_llm_provider(config_type=ScriptedLLMConfig)
async def _scripted_provider(config: ScriptedLLMConfig, builder: Builder):
    yield LLMProviderInfo(config=config, description="Scripted test LLM")


@register_llm_client(config_type=ScriptedLLMConfig, wrapper_type=LLMFrameworkEnum.LANGCHAIN)
async def _scripted_client(config: ScriptedLLMConfig, builder: Builder):
    from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
    from langchain_core.messages import AIMessage

    class Scripted(FakeMessagesListChatModel):
        def bind_tools(self, tools, **kwargs):  # tool_calling_agent binds tools; the script already names them
            return self

    yield Scripted(responses=[
        AIMessage(content=t.content, tool_calls=[
            {"name": c["name"], "args": c.get("args", {}), "id": f"call_{i}_{j}"} for j, c in enumerate(t.tool_calls)
        ]) for i, t in enumerate(config.script)
    ])


def _turn(name: str, **args: Any) -> dict[str, Any]:
    return {"tool_calls": [{"name": name, "args": args}]}


async def test_tool_calling_agent_runs_the_protocol_to_a_measured_complete(tmp_path: Path, buggy_repo: Path, engine_path: str):
    # The fix is already in the working tree; a scripted model cannot edit files. The engine still
    # has to measure it: the agent's final answer is only what the scripted model says.
    (buggy_repo / "src" / "add.js").write_text("module.exports = (a, b) => a + b;\n")
    config = {
        "llms": {"llm": {"_type": "cela_test_scripted_llm", "script": [
            _turn("cela__start", risk="LOW", files=["src/add.js"], run=[TEST_CMD], task="make add add", reqs=["adds"]),
            _turn("cela__cover", req="R1", file="test/add.test.js", text="adds"),
            _turn("cela__check"),
            {"content": "cela gate: COMPLETE"},
        ]}},
        "function_groups": {"cela": {"_type": "cela", "repo_dir": str(buggy_repo), "cela_js_path": engine_path}},
        "workflow": {
            "_type": "tool_calling_agent",
            "llm_name": "llm",
            "tool_names": ["cela"],
            "system_prompt": (Path(__file__).resolve().parents[1] / "instructions.md").read_text(),
            "max_iterations": 10,
        },
    }
    path = tmp_path / "workflow.yaml"
    path.write_text(yaml.safe_dump(config))

    async with load_workflow(path) as session_manager:
        async with session_manager.session() as session:
            async with session.run("Fix the add bug in src/add.js") as runner:
                answer = await runner.result(to_type=str)

    assert answer == "cela gate: COMPLETE"
    log = (buggy_repo / ".cela" / "state.jsonl").read_text().splitlines()
    events = [__import__("json").loads(line) for line in log]
    assert [e["kind"] for e in events] == ["start", "cover", "check", "gate"], "check logs the verdict it returned"
    assert events[-1]["verdict"] == "COMPLETE", events[-1]


def test_example_workflow_is_valid_for_the_toolkit():
    """examples/workflow.yaml must stay loadable: same schema check `nat validate` runs."""
    from nat.runtime.loader import load_config

    example = Path(__file__).resolve().parents[1] / "examples" / "workflow.yaml"
    config = load_config(example)
    assert "cela" in config.function_groups
    assert config.workflow.type == "tool_calling_agent"
    assert "cela" in [str(t) for t in config.workflow.tool_names]
