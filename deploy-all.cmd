@echo off
rem Double-click to update EVERY minyan in minyanim.json and the template (runs deploy-all.ps1).
rem The output is also saved to deploy-all-last.log (git-ignored). The window closes by itself after 120 seconds.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { .\deploy-all.ps1 'deployed with deploy-all.cmd' *>&1 | Tee-Object -FilePath deploy-all-last.log; exit $LASTEXITCODE }"
echo.
if errorlevel 1 (echo *** SOME UPDATES FAILED - see deploy-all-last.log ***) else (echo *** ALL UPDATED ***)
timeout /t 120
