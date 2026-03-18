@echo off
REM Create .venv, install deps, run find-fire script for GEE.
REM Requires: Python 3 on PATH (install from https://www.python.org/downloads/)
cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel% neq 0 (
  where py >nul 2>&1
  if %errorlevel% neq 0 (
    echo Python not found. Install from https://www.python.org/downloads/ and add to PATH.
    exit /b 1
  )
  set PY=py
) else (
  set PY=python
)

if not exist ".venv" (
  echo Creating .venv...
  %PY% -m venv .venv
  if errorlevel 1 exit /b 1
)
call .venv\Scripts\activate.bat
echo Installing pystac-client geopandas requests...
pip install -q pystac-client geopandas requests
if errorlevel 1 exit /b 1
echo Running run_find_fire_for_gee.py...
python scripts\run_find_fire_for_gee.py
exit /b %errorlevel%
