"""pytest 会话级 fixture — 自动启动服务，实现零手动干预的测试运行。

通过 pytest_configure 钩子，在测试模块导入前设置环境变量并启动服务进程，
确保 test_integration.py 等模块级常量能正确读取 TEST_BASE_URL。
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent
PORT = 8910
BASE_URL = f"http://127.0.0.1:{PORT}"

_proc = None
_temp_dir = None


def _wait_for_server(timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/", timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Server did not start within {timeout}s at {BASE_URL}")


def pytest_configure(config):
    global _proc, _temp_dir

    if os.getenv("TEST_BASE_URL"):
        return

    _temp_dir = tempfile.mkdtemp(prefix="aeslan-pytest-")
    db_path = str(Path(_temp_dir) / "test.db")

    env = os.environ.copy()
    env.setdefault("SERVICE_JWT_SECRET", "pytest-test-secret")
    env.setdefault("SERVICE_RATE_LIMIT", "9999")  # v0.5.10: 防止新加 test 触发 60/60s 限流
    env["SERVICE_PORT"] = str(PORT)
    env["SERVICE_DB_PATH"] = db_path
    env["SERVICE_DATA_DIR"] = str(SERVICE_DIR / "data")
    env["STORYBOOK_PATH"] = str(SERVICE_DIR / "data" / "storybook.json")

    _proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=str(SERVICE_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        _wait_for_server()
    except RuntimeError:
        _proc.terminate()
        _proc.wait()
        raise

    os.environ["TEST_BASE_URL"] = BASE_URL
    os.environ["SERVICE_JWT_SECRET"] = env["SERVICE_JWT_SECRET"]


def pytest_unconfigure(config):
    global _proc, _temp_dir

    if os.getenv("TEST_BASE_URL") != BASE_URL:
        return

    if _proc:
        _proc.terminate()
        try:
            _proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _proc.kill()
        _proc = None

    if _temp_dir:
        shutil.rmtree(_temp_dir, ignore_errors=True)
        _temp_dir = None
