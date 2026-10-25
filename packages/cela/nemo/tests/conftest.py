"""Shared fixtures: a real git repo with a bug, and the real engine from this checkout."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / "skill" / "tool" / "cela.js"
# A glob, not `test/`: Node 22 runs a bare directory argument as one file and fails.
TEST_CMD = "node --test test/*.test.js"


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t.invalid", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture(autouse=True)
def _need_node():
    if not shutil.which("node"):
        pytest.skip("node is not installed")


@pytest.fixture
def engine_path() -> str:
    assert ENGINE.is_file(), ENGINE
    return str(ENGINE)


@pytest.fixture
def buggy_repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """src/add.js subtracts; test/add.test.js expects addition."""
    # Engine memory goes to a scratch home, never the developer's ~/.cela.
    monkeypatch.setenv("CELA_HOME", str(tmp_path / "cela-home"))
    monkeypatch.delenv("NODE_TEST_CONTEXT", raising=False)
    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    (repo / "test").mkdir()
    (repo / "src" / "add.js").write_text("module.exports = (a, b) => a - b;\n")
    (repo / "test" / "add.test.js").write_text(
        "const test = require('node:test');\n"
        "const assert = require('node:assert/strict');\n"
        "const add = require('../src/add');\n"
        "test('adds', () => assert.equal(add(2, 3), 5));\n"
    )
    _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "init")
    return repo


def fix(repo: Path) -> None:
    (repo / "src" / "add.js").write_text("module.exports = (a, b) => a + b;\n")


@pytest.fixture
def scratch_env(tmp_path: Path) -> dict[str, str]:
    env = dict(os.environ)
    env["CELA_HOME"] = str(tmp_path / "cela-home")
    env.pop("NODE_TEST_CONTEXT", None)
    return env
