# NeMo Agent Toolkit notes for cela-nat

What this package relies on in NeMo Agent Toolkit, and where each fact comes from. Verified on 2026-10-13 against `nvidia-nat-core`, `nvidia-nat-langchain` and `nvidia-nat-test` **1.9.0** (PyPI; git tag `v1.9.0`), CPython 3.12, Linux. "Verified" means the code was run against those packages; the rest is read from the docs or source linked below.

`docs.nvidia.com/nemo/agent-toolkit/latest/` still serves the **1.8** docs (page titles say 1.8, and [`versions1.json`][versions-latest] marks 1.8 preferred). The pages linked below have the same text at the `v1.8.0` and `v1.9.0` tags, except `plugin-api.md` and the LLM index.

## Authoring API

- Import from **`nat.plugin_api`**, the stable facade for plugin authors. The [plugin API docs][plugin-api] say `nat.cli.register_workflow` and `nat.builder.*` are implementation modules. `nat.plugin_api` first shipped in `nvidia-nat-core` 1.8 (the 1.7.0 wheel has no `nat/plugin_api/`), hence `nvidia-nat-core>=1.8,<2`.
- **One function group, seven tools.** `@register_function_group(config_type=CelaConfig)` with `CelaConfig(FunctionGroupBaseConfig, name="cela")`. The builder is an async generator that yields a `FunctionGroup`; code before `yield` runs when the workflow is built ([custom function groups][groups-custom-doc]). The 1.9 docs call groups "the preferred pattern when one external service exposes multiple related tools" ([plugin API][plugin-api]).
  - `name="cela"` becomes the YAML `_type`.
  - `FunctionGroupBaseConfig` already defines `include`, `exclude` and `middleware`, and every config has `type`/`_type` and `name`; config fields must not reuse those names ([`data_models/function.py`][dm-function]).
- **Tool names are `<YAML key>__<function>`**, for example `cela__gate` when the group key is `cela` ([`function.py`][function.py], `SEPARATOR = "__"` since 1.4.0). The `name:` field does not change it. Only functions listed in `include:` can be referenced one by one (`tool_names: [cela__gate]`); `tool_names: [cela]` gives the whole group ([function groups][groups-doc]). *Verified.*
- **Always pass `description=`.** The [functions docs][functions-doc] say a bare callable's docstring becomes the description. In 1.9 it does not: the description is `None` and the LangChain wrapper falls back to the tool name. *Verified.*

## Input schemas (what the model sees)

Rules from `FunctionDescriptor` / `FunctionInfo.create` in [`function_info.py`][function_info], *verified* with `convert_to_openai_tool` on the LangChain tools:

- Each parameter becomes a field of a generated Pydantic model; parameters with defaults are optional.
- Use `Annotated[T, Field(description=...)]` for per-argument descriptions. Plain parameters reach the model without one. `Literal[...]` becomes a JSON `enum`.
- **A tool function must take exactly one parameter or more.** A zero-argument function fails with `ValueError: single_fn must have exactly one parameter`, and a parameter named `_` fails because Pydantic rejects leading underscores. `gate` and `state` therefore take one field-less model (`NoInput`), which the model sees as `{"properties": {}}`. *Verified.*
- Inner functions must be `async def` (a plain `def` raises `Invalid workflow function`).
- 1.9 evaluates string annotations (`eval_str=True`, CHANGELOG #2115); 1.8 does not. `register.py` therefore does not use `from __future__ import annotations`.

## Discovery

- Entry-point group **`nat.plugins`** ([plugins][plugins], [third-party plugins][third-party]). `nat.components` still loads and is what NVIDIA's own 1.9 wheels use; the docs call it compatibility-only. `discover_entrypoints` scans both ([`runtime/loader.py`][loader]). *Verified:* `nat info components -t function_group -q cela` lists the group after `pip install`.
- **A plugin that fails to import is only logged** (`Failed to import plugin ...`) and skipped; `nat` keeps running without it ([`loader.py`][loader]). `tests/test_plugin.py` therefore checks discovery and registration explicitly.
- The loader warns about slow plugin imports, so `register.py` imports only Pydantic, `nat.plugin_api`, and `cela_nat.engine` (stdlib only).

## Agents and workflow YAML

From [`react_agent/register.py`][react-register], [`tool_calling_agent/register.py`][tc-register] and the agent docs ([ReAct][react-doc], [tool calling][tc-doc]). Both agents live in `nvidia-nat-langchain`, hence the `[agents]` extra.

- Both accept `llm_name`, `tool_names`, `system_prompt`, `additional_instructions`, `verbose`, `max_history`.
- **`tool_calling_agent`** joins `system_prompt` and `additional_instructions`; `max_iterations` defaults to 15, `handle_tool_errors` to true. A tool's `dict` result reaches the model as JSON. This is what `examples/workflow.yaml` uses.
- **`react_agent`**'s `system_prompt` replaces the ReAct template and must contain `{tools}` and `{tool_names}`, or the build fails with `Invalid system_prompt`. Use `additional_instructions` for the cela text instead. A `dict` result reaches the model as a Python repr.
- **`tool_calling_agent` runs one turn's tool calls concurrently**: it uses LangGraph's `ToolNode` ([`tool_calling_agent/agent.py`][tc-agent]), which awaits them with `asyncio.gather`. `cela_nat.engine.Engine` serializes its calls so a `gate` issued beside `check` reads that check's round. *Verified* by `tests/test_engine.py::test_concurrent_calls_run_one_at_a_time`, which fails without the lock.
- LLM providers ([LLMs][llms-doc]): `_type: openai` (`model_name`, `base_url`, `api_key`, `temperature`; falls back to `$OPENAI_API_KEY`/`$OPENAI_BASE_URL`, and the build fails with no key even for servers that ignore keys). `_type: nim` (`model_name`, `api_key` or `$NVIDIA_API_KEY`, `base_url`); its `max_tokens` defaults to **300**, too short for tool calls.
- `${VAR}` and `${VAR:-default}` are expanded in the YAML ([`yaml_tools.py`][yaml_tools]); an unset variable without a default becomes an empty string.
- `nat validate` checks the schema only (it does not build components, so an unknown `tool_names` entry passes); `nat run` builds every component before the first model call, so a missing engine fails there. *Verified.*

## Testing without a model

- `WorkflowBuilder().add_function_group(...)` then `get_function("cela__gate").ainvoke({...})` calls tools directly. The plugin API docs call `WorkflowBuilder` a runtime detail, but the toolkit's own docs test with it ([functions][functions-doc], [testing][tests-doc]).
- `get_tools(..., wrapper_type=LANGCHAIN)` needs `discover_and_register_plugins(PluginTypes.COMPONENT)` first, or it raises `Could not find a registered tool wrapper`.
- `nat_test_llm` from `nvidia-nat-test` is documented for `chat_completion` only ([test LLM][test-llm-doc]); with `react_agent` it fails at build (`Expected a Runnable`). `tests/test_agent.py` instead registers a test-only LLM whose LangChain client is `langchain_core`'s `FakeMessagesListChatModel`, and drives a real `tool_calling_agent` through start, check and gate. *Verified.*

## Not verified

- On NeMo Agent Toolkit 1.8.0 only the test suite was run (20 passed; CI keeps a 1.8 leg). The 1.8 notes above still come from the docs, the source diff between the `v1.8.0` and `v1.9.0` tags, and the CHANGELOG.
- Only Linux and Python 3.12 were run. On Windows a timeout stops `node` but not the commands `check` started (POSIX uses a process group).

<!-- links: all returned HTTP 200 on 2026-10-13 -->
[versions-latest]: https://docs.nvidia.com/nemo/agent-toolkit/latest/versions1.json
[plugins]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/plugins.html
[plugin-api]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/plugin-api.html
[third-party]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/third-party-plugins.html
[functions-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/custom-components/custom-functions/functions.html
[groups-custom-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/custom-components/custom-functions/function-groups.html
[groups-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/build-workflows/functions-and-function-groups/function-groups.html
[react-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/components/agents/react-agent/react-agent.html
[tc-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/components/agents/tool-calling-agent/tool-calling-agent.html
[llms-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/build-workflows/llms/index.html
[tests-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/testing/add-unit-tests-for-tools.html
[test-llm-doc]: https://docs.nvidia.com/nemo/agent-toolkit/latest/extend/testing/test-with-nat-test-llm.html
[loader]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_core/src/nat/runtime/loader.py
[function_info]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_core/src/nat/builder/function_info.py
[function.py]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_core/src/nat/builder/function.py
[dm-function]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_core/src/nat/data_models/function.py
[yaml_tools]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_core/src/nat/utils/io/yaml_tools.py
[react-register]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_langchain/src/nat/plugins/langchain/agent/react_agent/register.py
[tc-register]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_langchain/src/nat/plugins/langchain/agent/tool_calling_agent/register.py
[tc-agent]: https://github.com/NVIDIA/NeMo-Agent-Toolkit/blob/v1.9.0/packages/nvidia_nat_langchain/src/nat/plugins/langchain/agent/tool_calling_agent/agent.py
