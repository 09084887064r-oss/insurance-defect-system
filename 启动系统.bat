@echo off
title 保险产品用户测试缺陷预警系统 - 一键启动器
color 0b

echo ===================================================
echo   📊 保险产品用户测试缺陷预警系统 (UAT Defect Warning)
echo ===================================================
echo.
echo [1/2] 正在准备启动本地测试环境...
echo [2/2] 正在启动后端引擎并托管前端资源...
echo.

:: 在后台延迟 3 秒自动打开浏览器，防止服务尚未就绪
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3001"

:: 进入 backend 目录并运行 Node 服务
cd backend
node src/app.js

pause
