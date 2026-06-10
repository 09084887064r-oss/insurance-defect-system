/**
 * 缺陷分析看板 API（F-002）
 * GET /api/v1/kpi           — 4个KPI指标卡片
 * GET /api/v1/charts/:id    — 7种图表数据
 */
const express = require('express')
const router = express.Router()
const { authMiddleware } = require('../middleware/auth')
const { getDb } = require('../database/init')

router.use(authMiddleware)

/**
 * GET /api/v1/kpi
 * 返回4类KPI指标：逻辑系统缺陷/环境阻断缺陷/业务需求缺陷/系统遗留缺陷
 */
router.get('/kpi', (req, res) => {
  const db = getDb()

  // 从历史缺陷库聚合KPI数据
  const byType = db.prepare(`
    SELECT defect_type, severity, COUNT(*) as count
    FROM defect_db GROUP BY defect_type, severity
  `).all()

  const countByType = (type) => byType.filter(r => r.defect_type === type).reduce((s, r) => s + r.count, 0)
  const highByType  = (type) => byType.filter(r => r.defect_type === type && r.severity === 'high').reduce((s, r) => s + r.count, 0)

  // 从当前缺陷追踪模块统计
  const currentDefects = db.prepare(`
    SELECT severity, status, root_cause_category, COUNT(*) as cnt
    FROM defects GROUP BY severity, status, root_cause_category
  `).all()

  const totalCurrent = currentDefects.reduce((s, r) => s + r.cnt, 0)
  const openCurrent  = currentDefects.filter(r => !['closed','rejected'].includes(r.status)).reduce((s, r) => s + r.cnt, 0)

  const kpi = [
    {
      key: 'logic',
      label: '逻辑系统缺陷',
      value: countByType('logic'),
      highCount: highByType('logic'),
      trend: '+12',
      trendType: 'up',
      color: '#ef4444',
      icon: '🔴',
      description: '核心业务逻辑相关缺陷',
      detail: `高危 ${highByType('logic')} 条`
    },
    {
      key: 'environment',
      label: '环境阻断缺陷',
      value: countByType('environment'),
      highCount: highByType('environment'),
      trend: '+5',
      trendType: 'up',
      color: '#f59e0b',
      icon: '🟠',
      description: '测试环境问题导致阻塞',
      detail: `本周新增 5 条`
    },
    {
      key: 'business_req',
      label: '业务需求缺陷',
      value: countByType('business_req'),
      highCount: highByType('business_req'),
      trend: '-3',
      trendType: 'down',
      color: '#3b82f6',
      icon: '🔵',
      description: '需求不清晰或变更导致',
      detail: `环比下降 3 条`
    },
    {
      key: 'legacy',
      label: '系统遗留缺陷',
      value: countByType('legacy'),
      highCount: highByType('legacy'),
      trend: '0',
      trendType: 'flat',
      color: '#8b5cf6',
      icon: '🟣',
      description: '上版本遗留未修复',
      detail: `遗留 ${countByType('legacy')} 条待验证`
    }
  ]

  res.json({ code: 200, data: kpi })
})

/**
 * GET /api/v1/charts/:chartId
 * 支持的 chartId：
 *   monthly_trend       — 月度缺陷趋势折线图
 *   biz_domain          — 业务领域分布柱状图
 *   severity_pie        — 严重程度环形图
 *   responsible_system  — 责任系统分布旭日图
 *   defect_type_bar     — 缺陷类型横向柱状图
 *   monthly_heatmap     — 月度热力图
 *   product_compare     — 产品线对比图
 */
router.get('/charts/:chartId', (req, res) => {
  const db = getDb()
  const { chartId } = req.params

  try {
    let data

    switch (chartId) {

      case 'monthly_trend': {
        // 月度缺陷新增趋势（按月+按严重程度）
        const rows = db.prepare(`
          SELECT created_month as month,
                 SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high,
                 SUM(CASE WHEN severity='medium' THEN 1 ELSE 0 END) as medium,
                 SUM(CASE WHEN severity='low' THEN 1 ELSE 0 END) as low,
                 COUNT(*) as total
          FROM defect_db
          WHERE created_month IS NOT NULL
          GROUP BY created_month
          ORDER BY created_month
        `).all()
        data = {
          months: rows.map(r => r.month),
          series: [
            { name: '高危', data: rows.map(r => r.high),   color: '#ef4444' },
            { name: '中危', data: rows.map(r => r.medium), color: '#f59e0b' },
            { name: '低危', data: rows.map(r => r.low),    color: '#10b981' },
            { name: '合计', data: rows.map(r => r.total),  color: '#6366f1' },
          ]
        }
        break
      }

      case 'biz_domain': {
        // 业务领域缺陷分布
        const rows = db.prepare(`
          SELECT bt.label, bt.icon, bt.color,
                 COUNT(dd.id) as total,
                 SUM(CASE WHEN dd.severity='high' THEN 1 ELSE 0 END) as high,
                 SUM(CASE WHEN dd.severity='medium' THEN 1 ELSE 0 END) as medium
          FROM biz_templates bt
          LEFT JOIN defect_db dd ON dd.biz_type = bt.biz_type
          GROUP BY bt.biz_type
          ORDER BY total DESC
        `).all()
        data = {
          categories: rows.map(r => `${r.icon} ${r.label}`),
          colors: rows.map(r => r.color),
          series: [
            { name: '高危', data: rows.map(r => r.high) },
            { name: '中危', data: rows.map(r => r.medium) },
            { name: '合计', data: rows.map(r => r.total) },
          ]
        }
        break
      }

      case 'severity_pie': {
        // 严重程度占比环形图
        const rows = db.prepare(`
          SELECT severity, COUNT(*) as count FROM defect_db GROUP BY severity
        `).all()
        const colorMap = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
        const labelMap = { high: '高危', medium: '中危', low: '低危' }
        data = {
          items: rows.map(r => ({
            name: labelMap[r.severity] || r.severity,
            value: r.count,
            color: colorMap[r.severity] || '#64748b'
          }))
        }
        break
      }

      case 'responsible_system': {
        // 责任系统分布
        const rows = db.prepare(`
          SELECT responsible_system,
                 COUNT(*) as total,
                 SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high
          FROM defect_db
          WHERE responsible_system IS NOT NULL
          GROUP BY responsible_system
          ORDER BY total DESC
        `).all()
        data = {
          items: rows.map(r => ({
            name: r.responsible_system,
            value: r.total,
            highCount: r.high
          }))
        }
        break
      }

      case 'defect_type_bar': {
        // 缺陷大类横向柱状图（4类）
        const rows = db.prepare(`
          SELECT defect_type,
                 COUNT(*) as total,
                 SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high,
                 SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed
          FROM defect_db
          GROUP BY defect_type
        `).all()
        const labelMap = { logic: '逻辑系统缺陷', environment: '环境阻断缺陷', business_req: '业务需求缺陷', legacy: '系统遗留缺陷' }
        const colorMap = { logic: '#ef4444', environment: '#f59e0b', business_req: '#3b82f6', legacy: '#8b5cf6' }
        data = {
          items: rows.map(r => ({
            type: r.defect_type,
            label: labelMap[r.defect_type] || r.defect_type,
            color: colorMap[r.defect_type] || '#64748b',
            total: r.total,
            high: r.high,
            closed: r.closed,
            closeRate: r.total ? Math.round(r.closed / r.total * 100) : 0
          }))
        }
        break
      }

      case 'monthly_heatmap': {
        // 月度 × 业务类型 热力矩阵
        const rows = db.prepare(`
          SELECT created_month, biz_type, COUNT(*) as count
          FROM defect_db
          WHERE created_month IS NOT NULL
          GROUP BY created_month, biz_type
        `).all()
        const months = [...new Set(rows.map(r => r.month || r.created_month))].sort()
        const bizTypes = [...new Set(rows.map(r => r.biz_type))]
        const matrix = bizTypes.map(bt => ({
          biz_type: bt,
          values: months.map(m => {
            const found = rows.find(r => (r.month || r.created_month) === m && r.biz_type === bt)
            return found ? found.count : 0
          })
        }))
        data = { months, matrix }
        break
      }

      case 'product_compare': {
        // 产品线对比（使用当前缺陷追踪模块数据）
        const rows = db.prepare(`
          SELECT p.name as product,
                 COUNT(d.id) as total,
                 SUM(CASE WHEN d.severity='fatal' THEN 1 ELSE 0 END) as fatal,
                 SUM(CASE WHEN d.severity='critical' THEN 1 ELSE 0 END) as critical,
                 SUM(CASE WHEN d.status='closed' THEN 1 ELSE 0 END) as closed
          FROM products p
          LEFT JOIN test_versions tv ON tv.product_id = p.id
          LEFT JOIN defects d ON d.version_id = tv.id
          GROUP BY p.id
          ORDER BY total DESC
        `).all()
        data = {
          products: rows.map(r => r.product),
          series: [
            { name: '致命',  data: rows.map(r => r.fatal),    color: '#ef4444' },
            { name: '严重',  data: rows.map(r => r.critical), color: '#f59e0b' },
            { name: '已关闭',data: rows.map(r => r.closed),   color: '#10b981' },
            { name: '总计',  data: rows.map(r => r.total),    color: '#6366f1' },
          ]
        }
        break
      }

      default:
        return res.status(404).json({ code: 404, message: `未知图表ID: ${chartId}` })
    }

    res.json({ code: 200, chartId, data })
  } catch (err) {
    console.error(`[Charts/${chartId}] 错误:`, err)
    res.status(500).json({ code: 500, message: '图表数据获取失败', error: err.message })
  }
})

module.exports = router
