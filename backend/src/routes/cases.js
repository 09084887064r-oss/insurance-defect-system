/**
 * POST /api/v1/cases/parse   — 批量解析测试案例，输出风险评分
 * GET  /api/v1/cases          — 查询历史分析记录
 * GET  /api/v1/cases/:id      — 获取单条案例详情
 * GET  /api/v1/biz-templates  — 获取业务类型模板列表
 */
const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const { authMiddleware } = require('../middleware/auth')
const { getDb } = require('../database/init')
const { batchScoreCases, detectBizTypes, BIZ_TEMPLATES } = require('../services/riskEngine')

// 所有路由需要登录
router.use(authMiddleware)

/**
 * GET /api/v1/biz-templates
 * 返回8类业务类型模板（用于前端卡片展示）
 */
router.get('/biz-templates', (req, res) => {
  const db = getDb()
  const templates = db.prepare('SELECT * FROM biz_templates ORDER BY id').all()
  res.json({ code: 200, data: templates.map(t => ({
    ...t,
    keywords: JSON.parse(t.keywords || '[]'),
    risk_words: JSON.parse(t.risk_words || '[]')
  }))})
})

/**
 * POST /api/v1/cases/parse
 * Body: { cases: [{id?, text}], filename?, session_id? }
 * 批量评分，返回排序后的结果
 */
router.post('/parse', async (req, res) => {
  try {
    const { cases, filename, session_id } = req.body

    if (!cases || !Array.isArray(cases) || cases.length === 0) {
      return res.status(400).json({ code: 400, message: '案例列表不能为空' })
    }

    if (cases.length > 500) {
      return res.status(400).json({ code: 400, message: '单次最多支持500条案例' })
    }

    // 执行批量评分
    const scored = await batchScoreCases(cases.map((c, i) => ({
      id: c.id || `case_${i + 1}`,
      text: c.text || c.content || ''
    })))

    // 持久化到数据库
    const db = getDb()
    const sid = session_id || uuidv4()
    const insertCase = db.prepare(
      `INSERT INTO test_cases
        (uuid, session_id, case_index, case_text, biz_types, risk_score, risk_level, risk_label,
         similar_defects, reason, check_points, upload_filename, status, created_by)
       VALUES
        (@uuid, @session_id, @case_index, @case_text, @biz_types, @risk_score, @risk_level, @risk_label,
         @similar_defects, @reason, @check_points, @upload_filename, @status, @created_by)`
    )

    const savedCases = scored.map((result, idx) => {
      const statusVal = result.riskScore >= 8.0 ? 'pending_audit' : 'completed'
      const r = insertCase.run({
        uuid: uuidv4(),
        session_id: sid,
        case_index: idx,
        case_text: result.caseText,
        biz_types: JSON.stringify(result.bizTypes),
        risk_score: result.riskScore,
        risk_level: result.riskLevel,
        risk_label: result.riskLabel,
        similar_defects: JSON.stringify(result.similarDefects),
        reason: result.reason,
        check_points: JSON.stringify(result.checkPoints),
        upload_filename: filename || null,
        status: statusVal,
        created_by: req.user.id
      })
      return { ...result, id: r.lastInsertRowid, status: statusVal }
    })

    const stats = {
      total: savedCases.length,
      high: savedCases.filter(c => c.riskLevel === 'high').length,
      mid: savedCases.filter(c => c.riskLevel === 'mid').length,
      low: savedCases.filter(c => c.riskLevel === 'low').length,
      avgScore: (savedCases.reduce((s, c) => s + c.riskScore, 0) / savedCases.length).toFixed(1),
      session_id: sid
    }

    res.json({ code: 200, data: savedCases, stats })
  } catch (err) {
    console.error('[Cases] 解析失败:', err)
    res.status(500).json({ code: 500, message: '案例解析失败', error: err.message })
  }
})

/**
 * GET /api/v1/cases
 * 查询分析记录（按session分组）
 */
router.get('/', (req, res) => {
  const db = getDb()
  const { session_id, limit = 100 } = req.query

  let cases
  if (session_id) {
    cases = db.prepare(`
      SELECT tc.*, u.name as creator_name
      FROM test_cases tc
      LEFT JOIN users u ON u.id = tc.created_by
      WHERE tc.session_id = ?
      ORDER BY tc.risk_score DESC
    `).all(session_id)
  } else {
    // 返回最近的sessions
    cases = db.prepare(`
      SELECT tc.*, u.name as creator_name
      FROM test_cases tc
      LEFT JOIN users u ON u.id = tc.created_by
      ORDER BY tc.created_at DESC
      LIMIT ?
    `).all(Number(limit))
  }

  res.json({ code: 200, data: cases.map(c => ({
    ...c,
    biz_types: JSON.parse(c.biz_types || '[]'),
    similar_defects: JSON.parse(c.similar_defects || '[]'),
    check_points: JSON.parse(c.check_points || '[]')
  }))})
})

/**
 * GET /api/v1/cases/sessions
 * 返回历史分析会话列表
 */
router.get('/sessions', (req, res) => {
  const db = getDb()
  const sessions = db.prepare(`
    SELECT session_id, upload_filename,
           COUNT(*) as total_cases,
           SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) as high_count,
           MAX(risk_score) as max_score,
           AVG(risk_score) as avg_score,
           MAX(created_at) as created_at,
           MIN(created_by) as created_by
    FROM test_cases
    GROUP BY session_id
    ORDER BY created_at DESC
    LIMIT 20
  `).all()
  res.json({ code: 200, data: sessions })
})

/**
 * GET /api/v1/cases/feedback/stats
 * 汇总反馈率和大模型各项评测指标大盘
 */
router.get('/feedback/stats', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT feedback, COUNT(*) as count 
      FROM test_cases 
      WHERE feedback != 'none' 
      GROUP BY feedback
    `).all()

    const stats = { hit: 0, false_alarm: 0, missed: 0, total: 0 }
    for (const r of rows) {
      stats[r.feedback] = r.count
      stats.total += r.count
    }

    // 默认空指标兜底
    let precision = 0
    let recall = 0
    let f1 = 0
    let accuracy = 0

    if (stats.total > 0) {
      precision = (stats.hit + stats.false_alarm) > 0 ? (stats.hit / (stats.hit + stats.false_alarm)) : 0
      recall = (stats.hit + stats.missed) > 0 ? (stats.hit / (stats.hit + stats.missed)) : 0
      f1 = (precision + recall) > 0 ? (2 * precision * recall / (precision + recall)) : 0
      accuracy = stats.hit / stats.total
    }

    res.json({
      code: 200,
      data: {
        counts: stats,
        metrics: {
          precision: parseFloat((precision * 100).toFixed(1)),
          recall: parseFloat((recall * 100).toFixed(1)),
          f1Score: parseFloat((f1 * 100).toFixed(1)),
          accuracy: parseFloat((accuracy * 100).toFixed(1))
        }
      }
    })
  } catch (err) {
    console.error('[Feedback Stats] 统计获取失败:', err)
    res.status(500).json({ code: 500, message: '指标统计失败', error: err.message })
  }
})

/**
 * GET /api/v1/cases/:id
 */
router.get('/:id', (req, res) => {
  const db = getDb()
  const c = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.id)
  if (!c) return res.status(404).json({ code: 404, message: '未找到' })
  res.json({ code: 200, data: {
    ...c,
    biz_types: JSON.parse(c.biz_types || '[]'),
    similar_defects: JSON.parse(c.similar_defects || '[]'),
    check_points: JSON.parse(c.check_points || '[]')
  }})
})

/**
 * GET /api/v1/defects (历史缺陷查询)
 * Query: bizType, severity, keyword, limit
 */
router.get('/defect-db/list', (req, res) => {
  const db = getDb()
  const { bizType, severity, keyword, limit = 50 } = req.query

  let sql = 'SELECT * FROM defect_db WHERE 1=1'
  const params = []

  if (bizType) { sql += ' AND biz_type = ?'; params.push(bizType) }
  if (severity) { sql += ' AND severity = ?'; params.push(severity) }
  if (keyword)  { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`) }

  sql += ' ORDER BY CASE severity WHEN "high" THEN 1 WHEN "medium" THEN 2 ELSE 3 END LIMIT ?'
  params.push(Number(limit))

  const defects = db.prepare(sql).all(...params)
  res.json({ code: 200, data: defects, total: defects.length })
})

/**
 * POST /api/v1/cases/:id/feedback
 * 提交案例反馈（命中/误报/漏报）
 */
router.post('/:id/feedback', (req, res) => {
  try {
    const { feedback } = req.body
    if (!['hit', 'false_alarm', 'missed', 'none'].includes(feedback)) {
      return res.status(400).json({ code: 400, message: '反馈类型无效' })
    }
    const db = getDb()
    const result = db.prepare('UPDATE test_cases SET feedback = ? WHERE id = ?').run(feedback, req.params.id)
    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '未找到对应案例' })
    }
    db._flush()
    res.json({ code: 200, message: '反馈提交成功' })
  } catch (err) {
    console.error('[Cases] 反馈提交失败:', err)
    res.status(500).json({ code: 500, message: '反馈提交失败', error: err.message })
  }
})

/**
 * POST /api/v1/cases/:id/audit
 * 经理核准双签确认
 */
router.post('/:id/audit', (req, res) => {
  try {
    const { role } = req.user
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ code: 403, message: '权限不足，仅允许项目经理及管理员进行双签核签' })
    }

    const db = getDb()
    const result = db.prepare("UPDATE test_cases SET status = 'audited' WHERE id = ?").run(req.params.id)
    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '未找到对应案例记录' })
    }
    db._flush()
    res.json({ code: 200, message: '该高危测试用例已顺利通过双签核签！' })
  } catch (err) {
    console.error('[Cases Audit] 核签错误:', err)
    res.status(500).json({ code: 500, message: '双签核签操作失败', error: err.message })
  }
})

module.exports = router
