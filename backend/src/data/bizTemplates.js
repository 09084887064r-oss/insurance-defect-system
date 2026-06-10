/**
 * bizTemplates.js  V1.1
 * 基于2025年真实缺陷库基表更新：5大业务域 + 具体场景关键词
 * 业务域来源：承保测试(37) / 保全测试(169) / 核保测试(89) / 理赔测试(21) / P17(12)
 */

const BIZ_TEMPLATES = [
  {
    bizType: 'underwriting',         // 承保测试
    label: '承保测试',
    icon: '📋',
    color: '#6366f1',
    defaultRiskWeight: 0.85,
    description: '保险产品录单、承保规则验证，含被保险人资格校验',
    keywords: ['投保', '录单', '承保', '被保险人', '投保人', '保单', '险种', '份数', '保额', '保费', '生效', '核实', '资格', '年龄', '关系'],
    riskWords: ['未成年', '违规', '不允许', '超过', '错误', '失败', '不一致', '未拦截', '绕过', '异常']
  },
  {
    bizType: 'policyService',        // 保全测试
    label: '保全测试',
    icon: '🔄',
    color: '#0891b2',
    defaultRiskWeight: 0.9,
    description: '退保、减保、贷款、变更等保单保全业务测试',
    keywords: ['退保', '减保', '保全', '变更', '贷款', '复效', '犹豫期', '撤保', '受益人', '投保人变更', '现金价值', '红利', '分红', '生存金', '批单'],
    riskWords: ['金额错误', '计算错误', '不符', '超限', '未解决', '失败', '查询失败', '提示错误', '比例错误', '规则错误']
  },
  {
    bizType: 'underwritingReview',   // 核保测试
    label: '核保测试',
    icon: '🔍',
    color: '#7c3aed',
    defaultRiskWeight: 0.88,
    description: '人工核保、体况告知、性别年龄误告等核保流程测试',
    keywords: ['核保', '复效', '误告', '体况', '健康', '人工核保', '性别', '年龄', '告知', '批准', '拒绝', '条件承保', '标准体', '次标准体', '体检'],
    riskWords: ['误告未处理', '漏查', '核保失败', '规则缺失', '未触发', '绕过', '错误判断']
  },
  {
    bizType: 'claims',               // 理赔测试
    label: '理赔测试',
    icon: '💰',
    color: '#ef4444',
    defaultRiskWeight: 0.95,
    description: '身故理赔、医疗理赔、意外理赔等理赔业务测试',
    keywords: ['理赔', '赔付', '身故', '给付', '理赔申请', '受益人', '医疗', '意外', '住院', '医疗费用', '赔款', '理赔金额', '申请理赔', '核赔', '赔案'],
    riskWords: ['赔付错误', '金额错误', '不符合条款', '拒赔', '漏赔', '超赔', '计算错误', '系统错误']
  },
  {
    bizType: 'systemBatch',          // 系统/批处理
    label: '系统批处理',
    icon: '⚙️',
    color: '#f59e0b',
    defaultRiskWeight: 0.75,
    description: '批处理任务、系统配置、数据同步等后台系统测试（含P17）',
    keywords: ['批处理', '批量', '配置', '系统', '数据同步', '接口', '调用', '任务', '定时', '调度', '参数', '环境', '部署', '服务'],
    riskWords: ['批处理失败', '超时', '数据丢失', '接口错误', '环境异常', '配置错误', '服务不可用']
  }
]

// 缺陷类型映射（对齐真实Excel字段）
const DEFECT_TYPE_MAP = {
  '系统问题': 'system',
  '环境问题': 'environment',
  '遗留问题': 'legacy',
  '需求问题': 'requirement',
  '案例问题': 'case'
}

// 缺陷等级映射
const DEFECT_LEVEL_MAP = {
  '严重缺陷': 'high',
  '一般缺陷': 'medium'
}

// 测试系统列表（来自真实数据Top系统）
const TEST_SYSTEMS = [
  '产品工厂', '保全GPS', '一站式PC端', '新理赔系统', '神太保全',
  '微信保全', '银保通', '寿险APP', 'P17', '一站式PAD', 'E锦囊', '核保系统'
]

/**
 * 从真实Excel数据生成缺陷知识库条目
 * @param {Array} rows - 解析后的Excel行数组
 */
function parseRealDefects(rows) {
  const results = []

  for (const row of rows) {
    const defectId = (row[0] || '').toString().trim()
    if (!defectId || defectId.length < 3) continue

    // 提取根因分析
    const descRaw = (row[35] || '').toString()
    const rootCauseMatch = descRaw.match(/根因分析[:：]([^\n功能模块]+)/)
    const rootCause = rootCauseMatch ? rootCauseMatch[1].trim() : ''
    const funcModuleMatch = descRaw.match(/功能模块[:：]([^\n问题描述]+)/)
    const funcModule = funcModuleMatch ? funcModuleMatch[1].trim() : ''
    const problemMatch = descRaw.match(/问题描述[:：](.+)$/s)
    const problem = problemMatch ? problemMatch[1].trim().replace(/\n/g, ' ') : descRaw.replace(/\n/g, ' ')

    // 缺陷类型清洗
    const defectTypeRaw = (row[56] || '').toString().replace(/\n/g, '').trim()
    const defectType = defectTypeRaw.includes('遗留') ? '遗留问题'
      : defectTypeRaw.includes('需求') ? '需求问题'
      : defectTypeRaw.includes('案例') ? '案例问题'
      : defectTypeRaw.includes('环境') ? '环境问题'
      : '系统问题'

    // 缺陷等级
    const defectLevelRaw = (row[59] || '').toString().trim()
    const severity = defectLevelRaw.includes('严重') ? 'high' : 'medium'

    // 业务域
    const bizDomain = (row[8] || '').toString().replace(/\n/g, '').trim()

    // 推断bizType
    let bizType = 'systemBatch'
    if (bizDomain.includes('承保')) bizType = 'underwriting'
    else if (bizDomain.includes('保全')) bizType = 'policyService'
    else if (bizDomain.includes('核保')) bizType = 'underwritingReview'
    else if (bizDomain.includes('理赔')) bizType = 'claims'

    // 测试系统清洗
    const testSystem = (row[10] || '').toString().replace(/\n/g, '').trim()
    const scenario = (row[11] || '').toString().replace(/\n/g, '').trim()

    // 上报时间处理（Excel数值→月份）
    let defectMonth = (row[65] || '').toString().trim()
    if (!defectMonth && row[49]) {
      // Excel日期数值转月份
      const dateNum = parseFloat(row[49])
      if (!isNaN(dateNum) && dateNum > 40000) {
        const date = new Date((dateNum - 25569) * 86400 * 1000)
        defectMonth = `${date.getMonth() + 1}月`
      }
    }

    // 解决方案
    const solution = (row[64] || '').toString().trim()

    // 险种信息
    const insuranceProduct = (row[2] || '').toString().replace(/\n/g, '').trim()
    const productType = (row[5] || '').toString().replace(/\n/g, '').trim()

    // 案例名称作为标题
    const caseName = (row[13] || '').toString().replace(/\n/g, ' ').trim()
    const title = caseName.length > 5 ? caseName.substring(0, 100)
      : (problem.length > 5 ? problem.substring(0, 100) : `${bizDomain}缺陷${defectId}`)

    results.push({
      defect_id: defectId,
      title: title.substring(0, 200),
      severity,
      biz_type: bizType,
      biz_domain: bizDomain,
      defect_type: DEFECT_TYPE_MAP[defectType] || 'system',
      defect_level: defectLevelRaw.trim(),
      description: problem.substring(0, 500),
      root_cause: rootCause.substring(0, 200),
      func_module: funcModule.substring(0, 100),
      insurance_product: insuranceProduct.substring(0, 100),
      product_type: productType.substring(0, 50),
      test_system: testSystem.substring(0, 50),
      scenario: scenario.substring(0, 50),
      biz_tags: JSON.stringify([bizDomain, scenario, productType].filter(Boolean)),
      fix_summary: solution.substring(0, 200),
      responsible_system: testSystem.substring(0, 50) || bizDomain,
      status: ((row[62] || '').toString().includes('解决') ? 'closed' : 'open'),
      created_month: defectMonth || '未知',
      tester: (row[69] || '').toString().trim()
    })
  }

  return results
}

/**
 * 生成模拟缺陷数据（fallback，当无真实数据时使用）
 */
function generateDefectDB() {
  const templates = [
    { bizType: 'underwriting', titles: ['录单时投保人关系校验失败', '保额超限未拦截', '被保险人年龄校验错误', '投保单重复提交未校验', '保费计算结果与预期不符'] },
    { bizType: 'policyService', titles: ['减保金额计算错误', '退保现金价值不正确', '贷款额度超出限制未提示', '受益人变更后保单未更新', '犹豫期撤保流程异常'] },
    { bizType: 'underwritingReview', titles: ['性别年龄误告后系统未触发核保', '复效申请核保规则缺失', '人工核保结论未同步保单', '体况告知问题未记录', '核保拒绝后仍可投保'] },
    { bizType: 'claims', titles: ['身故理赔金额计算错误', '理赔申请无法提交', '医疗理赔重复申请未拦截', '赔付记录未生成', '受益人信息不一致'] },
    { bizType: 'systemBatch', titles: ['批处理任务超时失败', '数据同步接口异常', '定时任务未触发', '系统配置参数读取失败', '跨系统接口调用错误'] },
  ]
  const results = []
  let idx = 1
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月']
  for (const t of templates) {
    for (const title of t.titles) {
      results.push({
        defect_id: `MOCK-2025-${String(idx).padStart(3,'0')}`,
        title, severity: idx % 3 === 0 ? 'high' : 'medium',
        biz_type: t.bizType, biz_domain: '',
        defect_type: idx % 4 === 0 ? 'environment' : 'system',
        defect_level: idx % 3 === 0 ? '严重缺陷' : '一般缺陷',
        description: `缺陷详情：${title}`, root_cause: '待分析',
        func_module: '', insurance_product: '', product_type: '',
        test_system: '', scenario: '',
        biz_tags: JSON.stringify([t.bizType]),
        fix_summary: '代码修复', responsible_system: t.bizType,
        status: 'closed', created_month: months[idx % months.length], tester: ''
      })
      idx++
    }
  }
  return results
}

module.exports = { BIZ_TEMPLATES, DEFECT_TYPE_MAP, DEFECT_LEVEL_MAP, TEST_SYSTEMS, parseRealDefects, generateDefectDB }
