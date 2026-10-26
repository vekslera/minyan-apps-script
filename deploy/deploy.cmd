@echo off
rem Double-click to deploy: runs deploy.ps1 in this folder (clasp push + new version of the same deployment).
rem The output is also saved to deploy-last.log (git-ignored). The window closes by itself after 60 seconds.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { .\deploy.ps1 'deployed with deploy.cmd' *>&1 | Tee-Object -FilePath deploy-last.log; exit $LASTEXITCODE }"
echo.
if errorlevel 1 (echo *** DEPLOY FAILED - see deploy-last.log ***) else (echo *** DEPLOY OK ***)
timeout /t 60
