@echo off
rem Double-click to update the TEMPLATE Sheet's code: runs template.ps1 in this folder.
rem The output is also saved to template-last.log (git-ignored). The window closes by itself after 60 seconds.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { .\template.ps1 *>&1 | Tee-Object -FilePath template-last.log; exit $LASTEXITCODE }"
echo.
if errorlevel 1 (echo *** TEMPLATE UPDATE FAILED - see template-last.log ***) else (echo *** TEMPLATE UPDATED ***)
timeout /t 60
