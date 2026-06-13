const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('===================================================');
console.log('   🚀 缺陷预警系统 - Node 联合启动管理器');
console.log('===================================================');

// 辅助函数：检测端口占用并尝试关闭或报错
function checkPort(port) {
  return new Promise((resolve) => {
    // Windows 平台下查找端口占用
    exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
      if (stdout) {
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) pids.add(pid);
        });
        resolve(Array.from(pids));
      } else {
        resolve([]);
      }
    });
  });
}

async function killProcess(pid) {
  return new Promise((resolve) => {
    exec(`taskkill /F /PID ${pid}`, (err, stdout) => {
      resolve();
    });
  });
}

async function init() {
  const args = process.argv.slice(2);
  if (args.includes('--kill')) {
    console.log('🛑 正在检测并关闭正在运行的系统服务...');
    const ports = [3001, 5173];
    for (const port of ports) {
      const pids = await checkPort(port);
      if (pids.length > 0) {
        console.log(`⚠️ 检测到端口 ${port} 被进程 [${pids.join(', ')}] 占用，正在释放...`);
        for (const pid of pids) {
          await killProcess(pid);
        }
        console.log(`✅ 端口 ${port} 服务已停止`);
      } else {
        console.log(`ℹ️ 端口 ${port} 没有正在运行的服务`);
      }
    }
    console.log('✅ 所有相关端口已清理完毕！');
    process.exit(0);
  }

  // 1. 检查并清理端口占用 (防止上次未正常关闭)
  console.log('🔍 正在检测端口占用情况...');
  const ports = [3001, 5173];
  for (const port of ports) {
    const pids = await checkPort(port);
    if (pids.length > 0) {
      console.log(`⚠️ 检测到端口 ${port} 被进程 [${pids.join(', ')}] 占用，正在尝试强制释放...`);
      for (const pid of pids) {
        await killProcess(pid);
      }
      console.log(`✅ 端口 ${port} 释放成功`);
    }
  }

  // 2. 启动后端
  console.log('⚙️ 正在启动后端服务 (3001)...');
  const backendDir = path.join(__dirname, 'backend');
  
  // 使用 node 直接运行以提高稳定性，避免 nodemon 全局依赖问题
  const backendProcess = spawn('node', ['src/app.js'], {
    cwd: backendDir,
    shell: true
  });

  backendProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.log(`[后端] ${text}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[后端错误] ${data.toString().trim()}`);
  });

  // 3. 启动前端
  console.log('⚙️ 正在启动前端 Vite 开发服务器 (5173)...');
  const frontendDir = path.join(__dirname, 'frontend');
  
  // 使用 npm run dev 启动开发服务器，读取 vite.config.js
  const frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: frontendDir,
    shell: true
  });

  let openedBrowser = false;
  frontendProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.log(`[前端] ${text}`);
    
    // 当检测到 Vite 启动成功后，自动打开浏览器
    if (text.includes('Local:') || text.includes('ready in') || text.includes('5173')) {
      if (!openedBrowser) {
        openedBrowser = true;
        console.log('🌐 正在为您在浏览器中打开系统主页...');
        // Windows 系统下打开浏览器
        exec('start http://127.0.0.1:5173');
      }
    }
  });

  frontendProcess.stderr.on('data', (data) => {
    console.error(`[前端错误] ${data.toString().trim()}`);
  });

  // 监听进程退出与错误
  backendProcess.on('error', (err) => {
    console.error('❌ 无法启动后端进程 (请检查 Node.js 环境变量或权限):', err);
  });

  backendProcess.on('close', (code) => {
    console.log(`❌ 后端服务已退出，退出码: ${code}`);
    process.exit(code || 1);
  });

  frontendProcess.on('error', (err) => {
    console.error('❌ 无法启动前端进程 (请检查 npm 环境变量或权限):', err);
  });

  frontendProcess.on('close', (code) => {
    console.log(`❌ 前端服务已退出，退出码: ${code}`);
    process.exit(code || 1);
  });
}

init().catch(err => {
  console.error('❌ 启动管理器运行错误:', err);
});
