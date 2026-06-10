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

/**
 * 核心评分函数：对单条测试案例进行风险评分
 * @param {string} caseText - 测试案例文本
 * @param {string} [caseId] - 案例ID（可选）
 * @returns {object} 评分结果
 */
function scoreTestCase(caseText, caseId = null) {
  if (!caseText || !caseText.trim()) {
    return {
      caseId, caseText,
      riskScore: 0, riskLevel: 'low', riskLabel: '低危', riskColor: '#10b981',
      bizTypes: [], similarDefects: [],
      reason: '案例内容为空，无法评分',
      checkPoints: []
    }
  }

  // 1. 业务类型识别
  const bizTypes = detectBizTypes(caseText)
  const primaryBizType = bizTypes[0] || null

  // 2. 历史缺陷检索
  const similarDefects = retrieveSimilarDefects(caseText, bizTypes)

  // 3. 各维度评分计算

  // 维度1：历史缺陷匹配度（0-1）
  let matchScore = 0
  if (similarDefects.length > 0) {
    // 基于最相似缺陷的严重程度和数量
    const topDefect = similarDefects[0]
    const baseSeverityScore = (SEVERITY_SCORE[topDefect.severity] || 3) / 10
    const quantityBonus = Math.min(similarDefects.filter(d => d.severity === 'high').length * 0.1, 0.3)
    matchScore = Math.min(baseSeverityScore + quantityBonus, 1.0)
  } else {
    matchScore = 0.1 // 无历史匹配，低基础分
  }

  // 维度2：业务复杂度（0-1，来自bizTemplate.defaultRiskWeight）
  const bizComplexity = primaryBizType ? primaryBizType.defaultRiskWeight : 0.5

  // 维度3：历史最高严重级别（0-1）
  const maxSeverity = similarDefects.length
    ? Math.max(...similarDefects.map(d => SEVERITY_SCORE[d.severity] || 0)) / 10
    : 0.2

  // 维度4：风险词命中率（0-1）
  const riskWordScore = calcRiskWordScore(caseText, bizTypes)

  // 加权求和（满分10分）
  const rawScore = (
    matchScore     * 0.40 +
    bizComplexity  * 0.25 +
    maxSeverity    * 0.20 +
    riskWordScore  * 0.15
  ) * 10

  const riskScore = Math.min(Math.round(rawScore * 10) / 10, 10.0)
  const riskLevel = getRiskLevel(riskScore)

  // 生成评分依据
  const reason = buildReason(riskScore, riskLevel, bizTypes, similarDefects, matchScore, riskWordScore)

  // 生成检查建议
  const checkPoints = buildCheckPoints(bizTypes, similarDefects, riskScore)

  return {
    caseId,
    caseText: caseText.substring(0, 200),
    riskScore,
    riskLevel,
    riskLabel: getRiskLabel(riskLevel),
    riskColor: getRiskColor(riskLevel),
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
    reason,
    checkPoints
  }
}

function buildReason(score, level, bizTypes, defects, matchScore, riskWordScore) {
  const parts = []

  if (bizTypes.length) {
    parts.push(`业务类型识别为【${bizTypes.map(b => b.label).join('、')}】`)
  }

  if (defects.length > 0) {
    const highCount = defects.filter(d => d.severity === 'high').length
    parts.push(`历史缺陷库中找到 ${defects.length} 条相似缺陷（其中高危 ${highCount} 条）`)
  } else {
    parts.push('历史缺陷库中未找到直接相似记录')
  }

  if (riskWordScore > 0.4) {
    parts.push('案例描述中包含多个高风险业务关键词')
  }

  parts.push(`综合评分 ${score} 分，风险等级${level === 'high' ? '⚠️高危' : level === 'mid' ? '⚡中危' : '✅低危'}`)

  return parts.join('；')
}

function buildCheckPoints(bizTypes, defects, score) {
  const points = []

  if (score >= 8) {
    points.push('建议优先安排资深测试工程师执行此案例')
    points.push('执行前请详细阅读关联历史缺陷的修复方案')
  }

  if (bizTypes.some(b => b.bizType === 'claims')) {
    points.push('重点验证理赔金额计算精度与赔付限额')
    points.push('确认受益人信息及理赔资料核验逻辑是否符合条款规定')
  }

  if (bizTypes.some(b => b.bizType === 'underwriting' || b.bizType === 'underwritingReview')) {
    points.push('重点验证投保人资格校验及核保规则拦截逻辑')
    points.push('检查健康告知问卷必填项及误告处理流程')
  }

  if (bizTypes.some(b => b.bizType === 'policyService')) {
    points.push('重点验证减保、退保及保单贷款的额度和现金价值校验')
    points.push('检查保单信息变更及资金流转接口的准确性')
  }

  if (bizTypes.some(b => b.bizType === 'systemBatch')) {
    points.push('重点验证批量作业、定时任务及配置参数正确性')
    points.push('检查跨系统数据同步及接口调用的异常处理与重试机制')
  }

  // 基于历史缺陷生成专项建议
  const highDefects = defects.filter(d => d.severity === 'high')
  if (highDefects.length > 0) {
    points.push(`参考历史高危缺陷《${highDefects[0].title}》的修复方案进行针对性验证`)
  }

  if (points.length === 0) {
    points.push('按标准测试流程执行，重点关注边界值和异常流')
    points.push('验证完成后记录测试结果并更新案例执行状态')
  }

  return points.slice(0, 4)
}

/**
 * 批量评分（用于文件上传解析后）
 * @param {Array<{id, text}>} cases
 * @returns {Array} 评分结果，按风险分降序排列
 */
function batchScoreCases(cases) {
  const results = cases.map(c => scoreTestCase(c.text, c.id))
  return results.sort((a, b) => b.riskScore - a.riskScore)
}

module.exports = { scoreTestCase, batchScoreCases, detectBizTypes, BIZ_TEMPLATES }
