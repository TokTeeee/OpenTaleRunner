import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


SERVICE_DIR = Path(__file__).resolve().parent
REPO_DIR = SERVICE_DIR.parent
CLIENT_DIR = REPO_DIR / "client"

BANNED_SOURCE_TOKENS = {
    CLIENT_DIR / "src" / "App.tsx": ["艾瑟兰", "王都平原", "老巴托克"],
    CLIENT_DIR / "src" / "components" / "modals" / "CharacterCreationWizard.tsx": ["艾瑟兰", "王都平原", "老巴托克"],
    CLIENT_DIR / "src" / "components" / "game" / "InteractionArea.tsx": ["艾瑟兰"],
    CLIENT_DIR / "src" / "stores" / "worldStore.ts": ["艾瑟兰"],
    SERVICE_DIR / "routers" / "storybook_router.py": ["艾瑟兰"],
    SERVICE_DIR / "dashboard" / "stats_api.py": ["艾瑟兰"],
    SERVICE_DIR / "dashboard" / "static" / "index.html": ["艾瑟兰 看板", "艾瑟兰 · 世界看板"],
}


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

    print(f"[storybook-acceptance] installing missing packages for current interpreter: {', '.join(missing)}")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", str(SERVICE_DIR / "requirements.txt")],
        cwd=SERVICE_DIR,
    )


def run_client_build() -> None:
    print("[storybook-acceptance] building client")
    subprocess.check_call(["npm.cmd", "run", "build"], cwd=CLIENT_DIR)


def assert_no_source_hardcodes() -> None:
    print("[storybook-acceptance] checking targeted source files for banned hardcodes")
    for path, tokens in BANNED_SOURCE_TOKENS.items():
        text = path.read_text(encoding="utf-8")
        for token in tokens:
            if token in text:
                raise RuntimeError(f"Unexpected hardcoded token '{token}' found in {path}")


def wait_for_url(url: str, timeout_seconds: float = 30.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Endpoint did not become ready within {timeout_seconds:.0f}s: {url}")


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read().decode("utf-8")


def delete_storybook_data(db_path: str) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM world_meta WHERE key='storybook_data'")
        conn.commit()


def run_storybook_smoke(service_base_url: str, dashboard_base_url: str, db_path: str) -> None:
    print("[storybook-acceptance] running storybook replacement smoke checks")

    storybook = fetch_json(f"{service_base_url}/api/v1/storybook/full")
    assert "regions" in storybook and len(storybook["regions"]) > 0, "storybook/full should expose regions"
    starting_context = storybook.get("starting_context") or storybook.get("startingContext") or {}
    assert starting_context.get("regionId") or starting_context.get("region_id"), "starting_context region is required"

    aliases = fetch_json(f"{service_base_url}/api/v1/world/aliases")
    assert aliases.get("regions", {}).get("royal_plains"), "world aliases should expose region aliases"

    overview = fetch_json(f"{dashboard_base_url}/api/stats/overview")
    assert overview.get("world_name"), "dashboard overview should expose world_name"

    dashboard_html = fetch_text(f"{dashboard_base_url}/")
    assert "艾瑟兰 看板" not in dashboard_html, "dashboard static HTML should not embed a world-specific title"
    assert "艾瑟兰 · 世界看板" not in dashboard_html, "dashboard static HTML title should be neutral"

    delete_storybook_data(db_path)

    neutral_storybook = fetch_json(f"{service_base_url}/api/v1/storybook/full")
    neutral_storybook_name = neutral_storybook.get("worldName") or neutral_storybook.get("world_name")
    assert neutral_storybook_name == "当前世界", "storybook fallback should use a neutral world name"

    neutral_overview = fetch_json(f"{dashboard_base_url}/api/stats/overview")
    assert neutral_overview.get("world_name") == "当前世界", "dashboard fallback should use a neutral world name"


def terminate_process(process: subprocess.Popen[bytes] | subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    service_port = int(os.getenv("STORYBOOK_ACCEPTANCE_SERVICE_PORT", "8012"))
    dashboard_port = int(os.getenv("STORYBOOK_ACCEPTANCE_DASHBOARD_PORT", "8082"))
    service_base_url = f"http://127.0.0.1:{service_port}"
    dashboard_base_url = f"http://127.0.0.1:{dashboard_port}"
    temp_dir = tempfile.mkdtemp(prefix="aeslan-storybook-acceptance-")
    db_path = str(Path(temp_dir) / "storybook_acceptance.db")

    ensure_runtime_dependencies()
    run_client_build()
    assert_no_source_hardcodes()

    env = os.environ.copy()
    env.setdefault("SERVICE_JWT_SECRET", "storybook-acceptance-secret-32chars-abcdef")
    env["SERVICE_PORT"] = str(service_port)
    env["SERVICE_DB_PATH"] = db_path
    env["PYTHONUNBUFFERED"] = "1"

    service_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(service_port)],
        cwd=SERVICE_DIR,
        env=env,
    )
    dashboard_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "dashboard.main:app", "--host", "127.0.0.1", "--port", str(dashboard_port)],
        cwd=SERVICE_DIR,
        env=env,
    )

    try:
        print(f"[storybook-acceptance] service: {service_base_url}")
        print(f"[storybook-acceptance] dashboard: {dashboard_base_url}")
        print(f"[storybook-acceptance] temp db: {db_path}")
        wait_for_url(f"{service_base_url}/")
        wait_for_url(f"{dashboard_base_url}/")
        run_storybook_smoke(service_base_url, dashboard_base_url, db_path)
        print("[storybook-acceptance] OK")
        return 0
    finally:
        terminate_process(service_process)
        terminate_process(dashboard_process)
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())