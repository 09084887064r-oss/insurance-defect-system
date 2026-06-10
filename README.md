# 保险产品用户测试缺陷预警系统 — 安装与启动指南

## 快速开始

### 第一步：安装 Node.js

由于系统未检测到 Node.js，请先安装：

1. 访问 [https://nodejs.org](https://nodejs.org)
2. 下载 **LTS 版本**（推荐 v20.x）
3. 运行安装程序，全部默认即可
4. **重要**：安装完成后，关闭并重新打开终端/命令行

验证安装：
```
node --version
npm --version
```

---

### 第二步：安装后端依赖

```powershell
cd C:\Users\PC\.gemini\antigravity-ide\scratch\insurance-defect-system\backend
npm install
```

### 第三步：安装前端依赖

```powershell
cd C:\Users\PC\.gemini\antigravity-ide\scratch\insurance-defect-system\frontend
npm install
```

### 第四步：启动后端服务

```powershell
cd C:\Users\PC\.gemini\antigravity-ide\scratch\insurance-defect-system\backend
npm run dev
```

后端将在 **http://localhost:3001** 启动，并自动初始化数据库和演示数据。

### 第五步：启动前端（新开一个终端窗口）

```powershell
cd C:\Users\PC\.gemini\antigravity-ide\scratch\insurance-defect-system\frontend
npm run dev
```

前端将在 **http://localhost:5173** 启动。

---

## 演示账号

| 角色 | 邮箱 | 密码 | 权限 |
|------|------|------|------|
| 管理员 | admin@insure-test.com | admin123 | 全部功能 |
| 项目经理 | manager@insure-test.com | manager123 | 管理规则/产品/版本 |
| 开发人员 | dev@insure-test.com | dev123 | 处理缺陷 |
| 测试员 | tester@insure-test.com | tester123 | 提交/查看缺陷 |

---

## 项目结构

```
insurance-defect-system/
├── backend/
│   ├── data/              # SQLite 数据库文件（自动生成）
│   ├── src/
│   │   ├── app.js         # Express 入口
│   │   ├── database/      # 数据库初始化 & 种子数据
│   │   ├── middleware/    # JWT 认证中间件
│   │   ├── routes/        # API 路由（8个模块）
│   │   └── services/      # 预警引擎 & SSE & 通知服务
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/          # 8个页面组件
    │   ├── components/     # 通用组件（Layout, DefectForm）
    │   ├── services/       # API 调用层
    │   ├── store/          # Zustand 状态管理
    │   ├── App.jsx         # 路由 & SSE连接
    │   ├── main.jsx        # React入口 & Ant Design主题
    │   └── index.css       # 全局深色主题样式
    └── package.json
```

---

## 功能说明

| 模块 | 功能 |
|------|------|
| 🏠 仪表盘 | 实时统计卡片、5种ECharts图表、产品健康度评分 |
| 🐛 缺陷管理 | 全生命周期管理、多条件筛选、状态流转 |
| 🔍 缺陷详情 | 评论时间线、指派操作、复现步骤记录 |
| 🚨 预警中心 | 自定义规则、实时触发、SSE推送 |
| 🏢 产品管理 | 保险产品 CRUD、类型分类 |
| 🌿 版本管理 | 测试版本 CRUD、进度条展示 |
| 📄 报告生成 | 一键导出 PDF & Excel |
| 👥 用户管理 | 4种角色、权限控制 |
