@echo off
title Build Salary Man
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet.
  echo Install the LTS version from https://nodejs.org/en/download
  echo then close this window and double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: downloading what the build needs. This takes a few minutes.
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
)

echo Building the installer. This takes several minutes.
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run dist:win
if errorlevel 1 (
  echo.
  echo The build failed. Copy the text above and send it over.
  pause
  exit /b 1
)

echo.
echo Done. Opening the folder with the installer in it.
start "" "%~dp0dist"
pause
