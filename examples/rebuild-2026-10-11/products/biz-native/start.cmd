@echo off
setlocal
cd /d "%~dp0"
echo Team Leave - Local Demo
echo Open http://127.0.0.1:4173 after the server starts.
echo Press Ctrl+C to stop the server.
node server.cjs
if errorlevel 1 pause
endlocal
