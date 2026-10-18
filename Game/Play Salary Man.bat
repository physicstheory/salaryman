@echo off
title Salary Man
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

if not exist node_modules\obj2gltf (
  echo First run: downloading what the game needs. This takes a few minutes.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo npm install failed. Copy the red text above and send it over.
    pause
    exit /b 1
  )
)

echo Starting Salary Man...
call npm start
if errorlevel 1 (
  echo.
  echo The game stopped with an error. Copy the text above and send it over.
  pause
)
