@echo off
chcp 65001 > nul
title 停止缺陷预警系统服务

:: 尝试定位 node.exe 绝对路径
set "NODE_PATH=node"
if exist "D:\nodejs\node.exe" (
    set "NODE_PATH=D:\nodejs\node.exe"
) else if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_PATH=C:\Program Files\nodejs\node.exe"
) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "NODE_PATH=C:\Program Files (x86)\nodejs\node.exe"
)

:: 临时将可能需要的目录加入 PATH
set "PATH=%PATH%;D:\nodejs;C:\Program Files\nodejs;%USERPROFILE%\AppData\Roaming\npm"

echo ===================================================
echo   🛑 正在停止 缺陷预警系统 后台服务...
echo ===================================================
echo.

"%NODE_PATH%" "%~dp0start.js" --kill

echo.
echo ===================================================
echo   ✅ 服务关闭成功！
echo ===================================================
echo.
pause
