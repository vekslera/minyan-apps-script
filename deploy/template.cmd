@echo off
rem Double-click to update the TEMPLATE Sheet's code only: every entry in minyanim.json without a page (= deploy-all.ps1 -Templates).
rem The output is also saved to template-last.log (git-ignored). The window closes by itself after 60 seconds.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { .\deploy-all.ps1 'template' -Templates *>&1 | Tee-Object -FilePath template-last.log; exit $LASTEXITCODE }"
echo.
if errorlevel 1 (echo *** TEMPLATE UPDATE FAILED - see template-last.log ***) else (echo *** TEMPLATE UPDATED ***)
timeout /t 60
