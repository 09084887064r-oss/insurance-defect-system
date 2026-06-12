/**
 * 规则引擎风险评分模块
 * 基于文档 §2.1.3 案例解析与优先级排序（F-001-03）
 *
 * 评分公式：
 *   riskScore = 历史缺陷匹配度 × 0.40
 *             + 业务复杂度系数 × 0.25
 *             + 历史最高严重级别 × 0.20
 *             + 风险词命中率    × 0.15
 */

const { BIZ_TEMPLATES } = require('../data/bizTemplates')
const { getDb } = require('../database/init')

// 严重级别分数映射
const SEVERITY_SCORE = { high: 10, medium: 6, low: 3 }

// 风险等级划分
function getRiskLevel(score) {
  if (score >= 8.0) return 'high'
  if (score >= 5.0) return 'mid'
  return 'low'
}

function getRiskLabel(level) {
  return { high: '高危', mid: '中危', low: '低危' }[level] || '低危'
}

function getRiskColor(level) {
  return { high: '#ef4444', mid: '#f59e0b', low: '#10b981' }[level] || '#10b981'
}

/**
 * 检测案例所属业务类型（可多类型）
 */
function detectBizTypes(caseText) {
  const text = caseText.toLowerCase()
  const matched = []

  for (const tmpl of BIZ_TEMPLATES) {
    let hitCount = 0
    for (const kw of tmpl.keywords) {
      if (text.includes(kw.toLowerCase())) hitCount++
    }
    if (hitCount > 0) {
      matched.push({ ...tmpl, hitCount, score: hitCount / tmpl.keywords.length })
    }
  }

  return matched.sort((a, b) => b.score - a.score)
}

/**
 * 计算风险词命中率（第4维度）
 */
function calcRiskWordScore(caseText, bizTypes) {
  if (!bizTypes.length) return 0.3

  const text = caseText.toLowerCase()
  let totalRiskWords = 0
  let hitCount = 0

  for (const bt of bizTypes.slice(0, 2)) {
    const tmpl = BIZ_TEMPLATES.find(t => t.bizType === bt.bizType)
    if (!tmpl) continue
    for (const rw of tmpl.riskWords) {
      totalRiskWords++
      if (text.includes(rw.toLowerCase())) hitCount++
    }
  }

  return totalRiskWords ? Math.min(hitCount / totalRiskWords * 2, 1) : 0.3
}

/**
 * 从历史缺陷库中检索相似缺陷（Top-5）
 */
function retrieveSimilarDefects(caseText, bizTypes, limit = 5) {
  const db = getDb()
  const primaryBizType = bizTypes.length ? bizTypes[0].bizType : null

  let defects = []

  if (primaryBizType) {
    // 按业务类型检索
    defects = db.prepare(`
      SELECT * FROM defect_db
      WHERE biz_type = ?
      ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
      LIMIT ?
    `).all(primaryBizType, limit * 2)
  }

  if (defects.length < limit) {
    // 补充：关键词全文匹配
    const words = caseText
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5)

    for (const word of words) {
      if (defects.length >= limit * 2) break
      const extra = db.prepare(`
        SELECT * FROM defect_db
        WHERE (title LIKE ? OR description LIKE ? OR fix_summary LIKE ?)
        AND id NOT IN (${defects.map(() => '?').join(',') || '0'})
        LIMIT 3
      `).all(`%${word}%`, `%${word}%`, `%${word}%`, ...defects.map(d => d.id))
      defects.push(...extra)
    }
  }

  // 关键词相关性二次排序
  const caseWords = new Set(
    caseText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2)
  )

  return defects
    .map(d => {
      const titleWords = d.title.split('')
      const matchCount = [...caseWords].filter(w => d.title.includes(w) || d.description?.includes(w)).length
      return { ...d, _matchScore: matchCount }
    })
    .sort((a, b) => {
      if (b.severity !== a.severity) {
        return (SEVERITY_SCORE[b.severity] || 0) - (SEVERITY_SCORE[a.severity] || 0)
      }
      return b._matchScore - a._matchScore
    })
    .slice(0, limit)
}

const { callLLM, maskSensitiveData } = require('./llmService')

/**
 * 核心评分函数：对单条测试案例进行风险评分
 * @param {string} caseText - 测试案例文本
 * @param {string} [caseId] - 案例ID（可选）
 * @returns {Promise<object>} 评分结果
 */
async function scoreTestCase(caseText, caseId = null) {
  if (!caseText || !caseText.trim()) {
    return {
      caseId, caseText,
      riskScore: 0, riskLevel: 'low', riskLabel: '低危', riskColor: '#10b981',
      bizTypes: [], similarDefects: [],
      reason: '案例内容为空，无法评分',
      checkPoints: []
    }
  }

  // 前置敏感数据脱敏 (PII Masking)
  const maskedText = maskSensitiveData(caseText)

  // 1. 业务类型识别
  const bizTypes = detectBizTypes(maskedText)

  // 2. 历史缺陷检索
  const similarDefects = retrieveSimilarDefects(maskedText, bizTypes)

  // 3. 大模型风险评分与智能排序引擎 (基于Qwen大模型或语义规则引擎)
  const llmResult = await callLLM(maskedText, similarDefects)

  return {
    caseId,
    caseText: maskedText.substring(0, 200),
    riskScore: llmResult.riskScore,
    riskLevel: llmResult.riskLevel,
    riskLabel: getRiskLabel(llmResult.riskLevel),
    riskColor: getRiskColor(llmResult.riskLevel),
    bizTypes: bizTypes.map(b => ({ bizType: b.bizType, label: b.label, icon: b.icon })),
    similarDefects: similarDefects.map(d => ({
      defect_id: d.defect_id,
      title: d.title,
      severity: d.severity,
      biz_type: d.biz_type,
      fix_summary: d.fix_summary,
      created_month: d.created_month,
      responsible_system: d.responsible_system
    })),
    reason: llmResult.reason,
    checkPoints: llmResult.checkPoints
  }
}

/**
 * 批量评分（用于文件上传解析后）
 * @param {Array<{id, text}>} cases
 * @returns {Promise<Array>} 评分结果，按风险分降序排列
 */
async function batchScoreCases(cases) {
  const results = []
  for (const c of cases) {
    const scored = await scoreTestCase(c.text, c.id)
    results.push(scored)
  }
  return results.sort((a, b) => b.riskScore - a.riskScore)
}

module.exports = { scoreTestCase, batchScoreCases, detectBizTypes, BIZ_TEMPLATES }
