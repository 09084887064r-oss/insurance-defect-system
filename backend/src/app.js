const express = require('express')
const cors = require('cors')
const path = require('path')
const cron = require('node-cron')

const authRoutes = require('./routes/auth')
const productRoutes = require('./routes/products')
const versionRoutes = require('./routes/versions')
const defectRoutes = require('./routes/defects')
const alertRoutes = require('./routes/alerts')
const notificationRoutes = require('./routes/notifications')
const reportRoutes = require('./routes/reports')
const userRoutes = require('./routes/users')
const dashboardRoutes = require('./routes/dashboard')
const casesRoutes = require('./routes/cases')
const analyticsBoardRoutes = require('./routes/analyticsBoard')
const { initDatabase } = require('./database/init')
const { runAlertCheck } = require('./services/alertEngine')
const { sseMiddleware } = require('./services/sse')

const app = express()
const PORT = process.env.PORT || 3001

// ── 中间件 ────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// ── SSE 实时推送 ──────────────────────────────────────────
app.get('/api/sse', sseMiddleware)

// ── 路由 ──────────────────────────────────────────────────
app.use('/api/auth',          authRoutes)
app.use('/api/users',         userRoutes)
app.use('/api/products',      productRoutes)
app.use('/api/versions',      versionRoutes)
app.use('/api/defects',       defectRoutes)
app.use('/api/alerts',        alertRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/reports',       reportRoutes)
app.use('/api/dashboard',     dashboardRoutes)
// 新模块：案例智能分析 + 缺陷分析看板
app.use('/api/v1/cases',      casesRoutes)
app.use('/api/v1',            analyticsBoardRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── 异步启动（等待 sql.js 初始化完成后再监听端口）────────
async function startServer() {
  try {
    await initDatabase()

    // 每小时执行一次预警检查
    cron.schedule('0 * * * *', () => {
      console.log('[CRON] 运行预警引擎检查...')
      runAlertCheck()
    })

    // 启动 5 秒后执行一次，触发演示预警
    setTimeout(() => runAlertCheck(), 5000)

    app.listen(PORT, () => {
      console.log('')
      console.log(`🚀 后端服务已启动：http://localhost:${PORT}`)
      console.log(`📊 保险缺陷预警系统 — 准备就绪`)
      console.log('')
    })
  } catch (err) {
    console.error('❌ 服务启动失败:', err)
    process.exit(1)
  }
}

startServer()

module.exports = app
