"""启动脚本"""
import os, sys, socket

os.environ["NO_COLOR"] = "1"


def kill_port(port: int) -> None:
    """如果端口被占用则强制释放"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        result = s.connect_ex(("127.0.0.1", port))
        s.close()
        if result == 0:
            import subprocess
            if sys.platform == "win32":
                out = subprocess.check_output(f'netstat -ano | findstr ":{port}"', shell=True, text=True)
                for line in out.strip().split("\n"):
                    parts = line.strip().split()
                    if len(parts) >= 5 and parts[1].endswith(f":{port}"):
                        pid = parts[-1]
                        subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
                        print(f"[server] Killed PID {pid} on port {port}")
            else:
                subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True)
                print(f"[server] Killed process on port {port}")
    except Exception:
        pass


import uvicorn
from config import settings

if __name__ == "__main__":
    kill_port(settings.port)
    print(f"[server] Starting on port {settings.port}...")
    print(f"[server] DB: {settings.db_path}")
    print(f"[server] LLM: {settings.llm_model} @ {settings.llm_endpoint}")
    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)
