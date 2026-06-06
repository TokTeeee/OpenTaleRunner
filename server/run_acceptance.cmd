@echo off
setlocal
where python >nul 2>nul
if %errorlevel%==0 (
  python "%~dp0run_acceptance.py" %*
) else (
  py -3 "%~dp0run_acceptance.py" %*
)