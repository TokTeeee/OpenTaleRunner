import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


SERVICE_DIR = Path(__file__).resolve().parent


def ensure_runtime_dependencies() -> None:
    required_modules = ["fastapi", "uvicorn", "httpx", "aiosqlite", "jwt", "pytest", "pytest_asyncio"]
    missing = []
    for module_name in required_modules:
        try:
            __import__(module_name)
        except ModuleNotFoundError:
            missing.append(module_name)

    if not missing:
        return

    print(f"[acceptance] installing missing packages for current interpreter: {', '.join(missing)}")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", str(SERVICE_DIR / "requirements.txt")],
        cwd=SERVICE_DIR,
    )


def wait_for_server(base_url: str, timeout_seconds: float = 30.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Server did not become ready within {timeout_seconds:.0f}s: {base_url}")


def main() -> int:
    port = int(os.getenv("ACCEPTANCE_PORT", "8010"))
    base_url = os.getenv("TEST_BASE_URL", f"http://127.0.0.1:{port}")
    temp_dir = tempfile.mkdtemp(prefix="aeslan-acceptance-")
    db_path = str(Path(temp_dir) / "acceptance.db")

    ensure_runtime_dependencies()

    env = os.environ.copy()
    env.setdefault("SERVICE_JWT_SECRET", "acceptance-secret-32chars-abcdef123456")
    env["SERVICE_PORT"] = str(port)
    env["SERVICE_DB_PATH"] = db_path
    env["TEST_BASE_URL"] = base_url
    env["PYTHONUNBUFFERED"] = "1"

    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=SERVICE_DIR,
        env=env,
    )

    try:
        print(f"[acceptance] starting server on {base_url}")
        print(f"[acceptance] temp db: {db_path}")
        wait_for_server(base_url)

        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "tests/test_integration.py", "tests/test_multiplayer.py"],
            cwd=SERVICE_DIR,
            env=env,
        )
        return result.returncode
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())