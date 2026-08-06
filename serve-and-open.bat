@echo off
setlocal
set PORT=8765
set WORKDIR=C:\Users\%USERNAME%\WorkBuddy\2026-07-02-14-32-03

if not exist "%WORKDIR%\index.html" (
    msg * "晨报文件不存在，请检查生成任务是否正常运行。"
    exit /b 1
)

cd /d "%WORKDIR%"
start "" /min python -m http.server %PORT%
timeout /t 2 /nobreak >nul
start msedge "http://localhost:%PORT%/"
endlocal
