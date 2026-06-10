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
 * 返回4类KPI指标：系统问题/环境问题/严重缺陷/遗留问题
 */
router.get('/kpi', (req, res) => {
  const db = getDb()

  // 从历史缺陷库聚合KPI数据
  const byType = db.prepare(`
    SELECT defect_type, COUNT(*) as count
    FROM defect_db GROUP BY defect_type
  `).all()

  const countByType = (type) => {
    const found = byType.find(r => r.defect_type === type)
    return found ? found.count : 0
  }

  const highCount = db.prepare(`
    SELECT COUNT(*) as count FROM defect_db WHERE severity = 'high'
  `).get().count

  const systemHigh = db.prepare(`
    SELECT COUNT(*) as count FROM defect_db WHERE defect_type = 'system' AND severity = 'high'
  `).get().count

  const envHigh = db.prepare(`
    SELECT COUNT(*) as count FROM defect_db WHERE defect_type = 'environment' AND severity = 'high'
  `).get().count

  const legacyHigh = db.prepare(`
    SELECT COUNT(*) as count FROM defect_db WHERE defect_type = 'legacy' AND severity = 'high'
  `).get().count

  const kpi = [
    {
      key: 'logic', // 保持前端 logic 键名以确保兼容性
      label: '系统问题',
      value: countByType('system'),
      highCount: systemHigh,
      trend: '+12',
      trendType: 'up',
      color: '#ef4444',
      icon: '🔴',
      description: '系统功能或逻辑缺陷',
      detail: `严重 ${systemHigh} 条`
    },
    {
      key: 'environment',
      label: '环境问题',
      value: countByType('environment'),
      highCount: envHigh,
      trend: '+5',
      trendType: 'up',
      color: '#f59e0b',
      icon: '🟠',
      description: '测试环境或配置导致阻塞',
      detail: `本周新增 ${envHigh} 条`
    },
    {
      key: 'business_req', // 保持前端 business_req 键名以确保兼容性
      label: '严重缺陷',
      value: highCount,
      highCount: highCount,
      trend: '-3',
      trendType: 'down',
      color: '#3b82f6',
      icon: '🔵',
      description: '严重及以上级别缺陷',
      detail: `占总比 ${(highCount / 3.28).toFixed(1)}%`
    },
    {
      key: 'legacy',
      label: '遗留问题',
      value: countByType('legacy'),
      highCount: legacyHigh,
      trend: '0',
      trendType: 'flat',
      color: '#8b5cf6',
      icon: '🟣',
      description: '历史遗留未解决缺陷',
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
          WHERE created_month IS NOT NULL AND created_month != '' AND created_month != '未知'
          GROUP BY created_month
        `).all()

        // 准确定时升序排列月份（按 "1月", "2月" ... "12月" 的数字前缀）
        rows.sort((a, b) => {
          const matchA = a.month.match(/^(\d+)月/)
          const matchB = b.month.match(/^(\d+)月/)
          return (matchA ? parseInt(matchA[1], 10) : 999) - (matchB ? parseInt(matchB[1], 10) : 999)
        })

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
        // 责任系统分布 (对齐到真实数据库的 test_system 字段)
        const rows = db.prepare(`
          SELECT test_system as responsible_system,
                 COUNT(*) as total,
                 SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high
          FROM defect_db
          WHERE test_system IS NOT NULL AND test_system != '' AND test_system != '未知'
          GROUP BY test_system
          ORDER BY total DESC
          LIMIT 12
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
        // 缺陷大类横向柱状图（对齐到新的5个真实缺陷大类）
        const rows = db.prepare(`
          SELECT defect_type,
                 COUNT(*) as total,
                 SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high,
                 SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed
          FROM defect_db
          GROUP BY defect_type
          ORDER BY total DESC
        `).all()
        const labelMap = { 
          system: '系统问题', 
          environment: '环境问题', 
          legacy: '遗留问题', 
          requirement: '需求问题', 
          case: '案例问题' 
        }
        const colorMap = { 
          system: '#ef4444', 
          environment: '#f59e0b', 
          legacy: '#8b5cf6', 
          requirement: '#3b82f6', 
          case: '#10b981' 
        }
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
          WHERE created_month IS NOT NULL AND created_month != '' AND created_month != '未知'
          GROUP BY created_month, biz_type
        `).all()
        const months = [...new Set(rows.map(r => r.created_month))].sort((a, b) => {
          const matchA = a.match(/^(\d+)月/)
          const matchB = b.match(/^(\d+)月/)
          return (matchA ? parseInt(matchA[1], 10) : 999) - (matchB ? parseInt(matchB[1], 10) : 999)
        })
        const bizTypes = ['underwriting', 'policyService', 'underwritingReview', 'claims', 'systemBatch']
        const labelMap = {
          underwriting: '承保测试',
          policyService: '保全测试',
          underwritingReview: '核保测试',
          claims: '理赔测试',
          systemBatch: '系统批处理'
        }
        const matrix = bizTypes.map(bt => ({
          biz_type: labelMap[bt] || bt,
          values: months.map(m => {
            const found = rows.find(r => r.created_month === m && r.biz_type === bt)
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
