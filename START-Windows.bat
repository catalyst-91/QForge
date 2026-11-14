@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Installing QForge dependencies... & call npm install)
call npm start
