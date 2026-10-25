"""Run the cela engine (cela.js) and return structured results.

This module has no NeMo Agent Toolkit imports, so it can be tested and used
without the toolkit installed. ``register.py`` adapts it to toolkit tools.

The Node engine stays the single source of truth: every decision (oracles,
rounds, the verdict) is made by ``cela.js``. This module only passes
arguments through and parses the engine's JSON output where it has one.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
from collections.abc import Mapping
from pathlib import Path
from typing import Any

# Exit codes that are answers, not failures. `gate` exits 3 on CONTINUE and 1
# on every other non-COMPLETE verdict; both still print a valid verdict.
GATE_EXIT_CODES = {0, 1, 3}
USAGE_ERROR = 2


class EngineNotFound(RuntimeError):
    """Neither ``node`` nor ``cela.js`` could be located."""


def default_engine_path(env: Mapping[str, str] | None = None) -> Path:
    """Where ``cela install`` puts the engine: $CELA_HOME/skills/cela/tool/cela.js."""
    values: Mapping[str, str] = os.environ if env is None else env
    home = values.get("CELA_HOME") or str(Path(values.get("HOME") or values.get("USERPROFILE") or Path.home()) / ".cela")
    return Path(home) / "skills" / "cela" / "tool" / "cela.js"


def resolve_engine(cela_js_path: str | None, node: str = "node", env: Mapping[str, str] | None = None) -> tuple[str, str]:
    """Return ``(node_executable, engine_path)`` or raise :class:`EngineNotFound` with the fix."""
    node_exe = shutil.which(node) or (node if Path(node).is_file() else None)
    if not node_exe:
        raise EngineNotFound(f"`{node}` was not found on PATH. cela's engine needs Node.js 22 or newer.")
    engine = Path(cela_js_path).expanduser() if cela_js_path else default_engine_path(env)
    if not engine.is_file():
        raise EngineNotFound(
            f"cela engine not found at {engine}. Install it with "
            "`npx --yes github:actviteai/cecicela install --global-only`, or set cela_js_path."
        )
    return node_exe, str(engine)


async def run_engine(
    argv: list[str],
    *,
    repo_dir: str,
    cela_js_path: str | None = None,
    node: str = "node",
    timeout_s: float = 1800.0,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Run ``node cela.js <argv>`` in ``repo_dir``.

    Never raises for engine-side problems; returns a dict the model can read:
    ``{"ok", "exit_code", "stdout", "stderr"}`` plus ``"error"`` when the engine
    could not run or timed out. ``check`` runs the repository's test commands
    (the engine stops each one after 10 minutes), so the default is generous.
    """
    try:
        node_exe, engine = resolve_engine(cela_js_path, node, env)
    except EngineNotFound as err:
        return {"ok": False, "exit_code": None, "error": str(err), "stdout": "", "stderr": ""}
    cwd = Path(repo_dir).expanduser()
    if not cwd.is_dir():
        return {"ok": False, "exit_code": None, "error": f"repo_dir does not exist: {cwd}", "stdout": "", "stderr": ""}
    proc = await asyncio.create_subprocess_exec(
        node_exe,
        engine,
        *argv,
        cwd=str(cwd),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=None if env is None else dict(env),
        # `check` runs the repository's commands through a shell. A new session
        # lets a timeout stop those processes too, not only node.
        start_new_session=os.name == "posix",
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except (asyncio.TimeoutError, TimeoutError):
        _kill(proc)
        await proc.wait()
        return {"ok": False, "exit_code": None, "error": f"cela {argv[0]} timed out after {timeout_s}s", "stdout": "", "stderr": ""}
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout": out.decode("utf-8", errors="replace").strip(),
        "stderr": err.decode("utf-8", errors="replace").strip(),
    }


def _kill(proc: asyncio.subprocess.Process) -> None:
    """Stop the engine and, on POSIX, everything it started (its session)."""
    if os.name == "posix":
        try:
            os.killpg(proc.pid, signal.SIGKILL)
            return
        except (ProcessLookupError, PermissionError):
            pass
    # Windows: this stops node only. Commands it started may keep running.
    try:
        proc.kill()
    except ProcessLookupError:
        pass


def _json(text: str) -> Any:
    try:
        return json.loads(text) if text else None
    except json.JSONDecodeError:
        return None


def _usage(result: dict[str, Any]) -> dict[str, Any]:
    """Turn a usage error (exit 2) into an explicit error the model can act on."""
    if result.get("exit_code") == USAGE_ERROR:
        result = {**result, "error": result.get("stderr") or result.get("stdout") or "cela usage error"}
    return result


class Engine:
    """One repository's cela engine. Methods mirror the engine commands.

    Calls are serialized. Agents can run several tool calls of one turn
    concurrently (tool_calling_agent does), and a `gate` that runs while
    `check` is still writing would read the previous round.
    """

    def __init__(
        self,
        repo_dir: str = ".",
        cela_js_path: str | None = None,
        node: str = "node",
        timeout_s: float = 1800.0,
        env: dict[str, str] | None = None,
    ) -> None:
        self.repo_dir = repo_dir
        self.cela_js_path = cela_js_path
        self.node = node
        self.timeout_s = timeout_s
        self.env = env
        self._lock = asyncio.Lock()

    async def _run(self, *argv: str) -> dict[str, Any]:
        async with self._lock:
            return await run_engine(
                list(argv),
                repo_dir=self.repo_dir,
                cela_js_path=self.cela_js_path,
                node=self.node,
                timeout_s=self.timeout_s,
                env=self.env,
            )

    async def start(
        self,
        risk: str,
        files: list[str],
        run: list[str],
        repro: str | None = None,
        no_defect: bool = False,
        depth: str | None = None,
        keep: bool = False,
        task: str | None = None,
        reqs: list[str] | None = None,
    ) -> dict[str, Any]:
        argv = ["start", "--risk", risk.upper(), "--files", ",".join(files)]
        for command in run:
            argv += ["--run", command]
        if task:
            argv += ["--task", task]
        for clause in reqs or []:
            argv += ["--req", clause]
        if repro:
            argv += ["--repro", repro]
        if no_defect:
            argv.append("--no-defect")
        if depth:
            argv += ["--depth", depth]
        if keep:
            argv.append("--keep")
        return _usage(await self._run(*argv))

    async def plan(self, why: str, add: list[str] | None = None, drop: list[str] | None = None) -> dict[str, Any]:
        argv = ["plan", "--why", why]
        if add:
            argv += ["--add", ",".join(add)]
        if drop:
            argv += ["--drop", ",".join(drop)]
        return _usage(await self._run(*argv))

    async def req(self, text: str) -> dict[str, Any]:
        return _usage(await self._run("req", text))

    async def cover(self, req: str, file: str, text: str) -> dict[str, Any]:
        return _usage(await self._run("cover", req, file, text))

    async def check(self, before: bool = False) -> dict[str, Any]:
        """The oracle table and, after it, the verdict `check` printed (stdout)."""
        return _usage(await self._run("check", *(["--before"] if before else [])))

    async def gate(self) -> dict[str, Any]:
        """The verdict, verbatim from ``gate --json``: ``{verdict, reasons, round?, Q?}``."""
        result = await self._run("gate", "--json")
        verdict = _json(result.get("stdout", ""))
        if result.get("exit_code") in GATE_EXIT_CODES and isinstance(verdict, dict) and "verdict" in verdict:
            return {**verdict, "ok": True, "exit_code": result["exit_code"]}
        return {**_usage(result), "ok": False, "error": result.get("error") or "gate printed no verdict"}

    async def claim(
        self,
        text: str,
        external: bool = False,
        source: str | None = None,
        verified: bool = False,
        off_path: bool = False,
    ) -> dict[str, Any]:
        argv = ["claim", text]
        if external:
            argv.append("--external")
        if source:
            argv += ["--source", source]
        if verified:
            argv.append("--verified")
        if off_path:
            argv.append("--off-path")
        return _usage(await self._run(*argv))

    async def note(self, type: str, text: str) -> dict[str, Any]:  # noqa: A002 - mirrors the engine's word
        return _usage(await self._run("note", type, text))

    async def state(self) -> dict[str, Any]:
        """The task, verbatim from ``state --json``. Read-only."""
        result = await self._run("state", "--json")
        data = _json(result.get("stdout", ""))
        if result.get("exit_code") == 0 and isinstance(data, dict):
            return {**data, "ok": True}
        return {**_usage(result), "ok": False, "error": result.get("error") or "state printed no JSON"}
