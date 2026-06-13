@echo off
chcp 65001 > nul
title 缺陷预警系统一键启动工具

:: 尝试定位 node.exe 绝对路径，避免 PATH 环境变量丢失问题
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
echo   🚀 正在启动 缺陷预警系统 (Node.js 启动管理器)...
echo   👉 检测到的 Node 路径: %NODE_PATH%
echo ===================================================
echo.

"%NODE_PATH%" "%~dp0start.js"

if %errorlevel% neq 0 (
    echo.
    echo ❌ 系统异常关闭或启动失败！
    echo ---------------------------------------------------
    echo 💡 诊断建议：
    echo 1. 请检查上方命令行窗口中是否有具体的错误信息。
    echo 2. 检查后台是否已有其他端口冲突（可以尝试双击本脚本重新清理端口）。
    echo 3. 检查后端 `backend` 和前端 `frontend` 目录下的 node_modules 是否完整。
    echo ---------------------------------------------------
    pause
)



