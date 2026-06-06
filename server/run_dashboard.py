"""看板启动脚本 — 端口 8081"""
import os, sys, socket

os.environ["NO_COLOR"] = "1"


def kill_port(port: int) -> None:
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
                        print(f"[dashboard] Killed PID {pid} on port {port}")
            else:
                subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True)
                print(f"[dashboard] Killed process on port {port}")
    except Exception:
        pass


import uvicorn

if __name__ == "__main__":
    kill_port(8081)
    print("[dashboard] Starting on port 8081...")
    uvicorn.run("dashboard.main:app", host="0.0.0.0", port=8081, reload=True)
