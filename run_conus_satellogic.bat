@echo off
REM Run CONUS + Satellogic pipeline (find fires that intersect Satellogic).
REM Uses .venv if present, else Anaconda. Double-click or: run_conus_satellogic.bat
cd /d "%~dp0"

set PY=
if exist ".venv\Scripts\python.exe" (
  set PY=.venv\Scripts\python.exe
) else if exist "C:\Users\aeaturu\anaconda3\python.exe" (
  set PY=C:\Users\aeaturu\anaconda3\python.exe
) else if exist "C:\Users\aeaturu\Anaconda3\python.exe" (
  set PY=C:\Users\aeaturu\Anaconda3\python.exe
)

if not defined PY (
  echo No Python found. Create .venv or set PY to your Anaconda python.exe
  pause
  exit /b 1
)

echo Using: %PY%
echo Ensuring pystac-client, geopandas, requests...
"%PY%" -m pip install -q pystac-client geopandas requests
echo Running CONUS find-fires (Satellogic)...
"%PY%" scripts\run_find_fire_for_gee.py
echo.
pause
