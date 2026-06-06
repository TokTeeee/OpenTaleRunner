#!/bin/bash
set -e

# 启动 Dashboard (后台)
python run_dashboard.py &
DASHBOARD_PID=$!

# 启动主 API (前台)
python run.py &
API_PID=$!

# 捕获退出信号，清理子进程
cleanup() {
    kill $API_PID 2>/dev/null || true
    kill $DASHBOARD_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

wait
