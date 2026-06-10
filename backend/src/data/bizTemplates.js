/**
 * 8类保险业务类型模板
 * 包含：关键词词典、默认风险权重、风险词汇
 */
const BIZ_TEMPLATES = [
  {
    bizType: 'claim_reduction',
    label: '减保',
    icon: '📉',
    color: '#f59e0b',
    defaultRiskWeight: 0.85,
    keywords: ['减保', '减额', '减少保额', '保额减少', '减少保险金额', '部分退保', '保险金额调整', '减保申请', '减额缴清'],
    riskWords: ['超限', '金额错误', '未校验', '允许通过', '系统放行', '核心系统', '数据库'],
    description: '涉及保险金额减少、部分退保等操作'
  },
  {
    bizType: 'claims',
    label: '理赔',
    icon: '💰',
    color: '#ef4444',
    defaultRiskWeight: 0.92,
    keywords: ['理赔', '赔付', '赔款', '理赔申请', '赔偿', '给付', '保险金申请', '赔偿金', '身故赔付'],
    riskWords: ['金额错误', '超赔', '重复赔付', '核赔失败', '赔付比例', '误判', '自动通过'],
    description: '涉及保险赔付、理赔申请处理'
  },
  {
    bizType: 'underwriting',
    label: '核保',
    icon: '🔍',
    color: '#8b5cf6',
    defaultRiskWeight: 0.88,
    keywords: ['核保', '承保', '核保流程', '投保审核', '健康告知', '风险评估', '核保规则', '拒保', '加费', '标体'],
    riskWords: ['规则不生效', '绕过', '未拦截', '漏审', '系统放行', '核保失败', '异常通过'],
    description: '涉及投保资质审核、风险评估'
  },
  {
    bizType: 'renewal',
    label: '续保',
    icon: '🔄',
    color: '#06b6d4',
    defaultRiskWeight: 0.75,
    keywords: ['续保', '续期', '续期缴费', '自动续保', '续保提醒', '期满续保', '续保申请', '保单续期'],
    riskWords: ['续保失败', '重复续保', '未通知', '扣费异常', '续保规则', '数据丢失'],
    description: '涉及保单续期、续期缴费'
  },
  {
    bizType: 'policy_loan',
    label: '保单贷款',
    icon: '🏦',
    color: '#10b981',
    defaultRiskWeight: 0.80,
    keywords: ['保单贷款', '保单质押', '现金价值', '贷款申请', '贷款金额', '质押贷款', '保单借款'],
    riskWords: ['超限', '超过现金价值', '比例错误', '未校验', '系统允许', '贷款超额'],
    description: '涉及保单质押贷款操作'
  },
  {
    bizType: 'death_claim',
    label: '身故理赔',
    icon: '📋',
    color: '#64748b',
    defaultRiskWeight: 0.95,
    keywords: ['身故', '身故理赔', '死亡给付', '身故保险金', '死亡赔偿', '受益人', '身故申请'],
    riskWords: ['受益人错误', '赔付失败', '核实失败', '流程中断', '数据异常', '金额错误'],
    description: '涉及被保险人身故后的理赔处理'
  },
  {
    bizType: 'health_insurance',
    label: '医疗险',
    icon: '🏥',
    color: '#22c55e',
    defaultRiskWeight: 0.82,
    keywords: ['医疗险', '医疗理赔', '住院', '门诊', '医疗费用', '报销', '医疗报销', '住院费用', '手术费用'],
    riskWords: ['报销失败', '金额超限', '免赔额错误', '重复报销', '数据丢失', '接口超时'],
    description: '涉及医疗费用报销、住院理赔'
  },
  {
    bizType: 'policy_service',
    label: '保全',
    icon: '🛡️',
    color: '#f97316',
    defaultRiskWeight: 0.78,
    keywords: ['保全', '保单变更', '地址变更', '受益人变更', '联系方式变更', '变更申请', '保全服务', '信息变更'],
    riskWords: ['变更失败', '未同步', '数据不一致', '未生效', '审批失败', '权限错误'],
    description: '涉及保单信息变更、服务变更'
  }
]

/**
 * 4类缺陷大类
 */
const DEFECT_TYPES = [
  { type: 'logic',        label: '逻辑系统缺陷', weight: 0.90 },
  { type: 'environment',  label: '环境阻断缺陷', weight: 0.60 },
  { type: 'business_req', label: '业务需求缺陷', weight: 0.75 },
  { type: 'legacy',       label: '系统遗留缺陷', weight: 0.85 },
]

/**
 * 责任系统列表
 */
const RESPONSIBLE_SYSTEMS = ['核心系统', '前端应用', '支付网关', '通知服务', '文档管理', '数据仓库', '第三方接口', '认证系统']

/**
 * 生成480条历史缺陷数据
 */
function generateDefectDB() {
  const defects = []
  let id = 1

  const defectTemplates = [
    // 减保类
    { bizType: 'claim_reduction', title: '减保金额超过现金价值80%，系统未拦截', severity: 'high', type: 'logic', fixSummary: '在核保接口增加现金价值校验规则，超限时返回错误码ERR_AMOUNT_EXCEED', system: '核心系统' },
    { bizType: 'claim_reduction', title: '减保后保单状态未同步至前端展示', severity: 'medium', type: 'environment', fixSummary: '修复状态同步异步队列，增加重试机制', system: '前端应用' },
    { bizType: 'claim_reduction', title: '减保操作成功但未触发保费重算', severity: 'high', type: 'logic', fixSummary: '修复减保后保费触发器，补充单元测试', system: '核心系统' },
    { bizType: 'claim_reduction', title: '减保申请提交后收不到确认短信', severity: 'low', type: 'environment', fixSummary: '修复通知服务配置，补充邮件通知失败重试逻辑', system: '通知服务' },
    { bizType: 'claim_reduction', title: '批量减保时部分记录处理失败但无报错', severity: 'high', type: 'logic', fixSummary: '批量处理增加事务控制，失败时回滚并记录错误日志', system: '核心系统' },
    { bizType: 'claim_reduction', title: '减保至最低保额后仍允许继续减保', severity: 'high', type: 'logic', fixSummary: '增加最低保额校验逻辑BR-011', system: '核心系统' },
    { bizType: 'claim_reduction', title: '减保历史记录查询接口响应超时', severity: 'medium', type: 'environment', fixSummary: '增加查询缓存，优化SQL索引', system: '数据仓库' },
    { bizType: 'claim_reduction', title: '减保成功后保全记录创建失败', severity: 'medium', type: 'logic', fixSummary: '修复减保与保全记录联动逻辑', system: '核心系统' },

    // 理赔类
    { bizType: 'claims', title: '理赔金额计算错误，差额超过20%', severity: 'high', type: 'logic', fixSummary: '修复理赔金额计算公式，增加精度控制', system: '核心系统' },
    { bizType: 'claims', title: '重复提交理赔申请未做幂等处理', severity: 'high', type: 'logic', fixSummary: '引入申请号唯一性校验，增加幂等控制', system: '核心系统' },
    { bizType: 'claims', title: '理赔审批流程中环节跳转逻辑错误', severity: 'high', type: 'logic', fixSummary: '重构审批流转逻辑，增加状态机约束', system: '核心系统' },
    { bizType: 'claims', title: '理赔材料上传后系统无法识别PDF格式', severity: 'medium', type: 'environment', fixSummary: '升级文件解析库至最新版本', system: '文档管理' },
    { bizType: 'claims', title: '核赔结果推送第三方系统失败无重试', severity: 'high', type: 'environment', fixSummary: '增加消息队列重试机制，MQ消费端增加幂等', system: '第三方接口' },
    { bizType: 'claims', title: '理赔到账后短信通知模板内容错误', severity: 'low', type: 'business_req', fixSummary: '更新通知模板，补充金额格式化', system: '通知服务' },
    { bizType: 'claims', title: '身故理赔受益人优先级规则不符合条款', severity: 'high', type: 'business_req', fixSummary: '按保险条款重新梳理受益人优先级规则', system: '核心系统' },
    { bizType: 'claims', title: '理赔列表分页查询数据重复', severity: 'medium', type: 'logic', fixSummary: '修复分页SQL，增加唯一索引', system: '数据仓库' },

    // 核保类
    { bizType: 'underwriting', title: '健康告知问卷答案未保存即提交通过', severity: 'high', type: 'logic', fixSummary: '增加问卷完整性校验，必填项拦截', system: '核心系统' },
    { bizType: 'underwriting', title: '加费核保规则在特定条件下不生效', severity: 'high', type: 'logic', fixSummary: '修复规则引擎条件判断逻辑，补充边界测试', system: '核心系统' },
    { bizType: 'underwriting', title: '核保决议同步至保单信息延迟超过30分钟', severity: 'medium', type: 'environment', fixSummary: '优化异步同步机制，改用实时推送', system: '核心系统' },
    { bizType: 'underwriting', title: '体况评估算法在高龄投保人场景判断失误', severity: 'high', type: 'logic', fixSummary: '调整高龄风险系数，增加专项规则', system: '核心系统' },
    { bizType: 'underwriting', title: '拒保通知书模板内容缺少保单号', severity: 'low', type: 'business_req', fixSummary: '更新拒保通知书模板字段', system: '文档管理' },
    { bizType: 'underwriting', title: '核保接口超时导致投保流程阻塞', severity: 'high', type: 'environment', fixSummary: '设置合理超时时间，增加熔断降级', system: '第三方接口' },
    { bizType: 'underwriting', title: '职业类别映射表与条款不一致', severity: 'medium', type: 'business_req', fixSummary: '同步更新职业类别映射表', system: '核心系统' },
    { bizType: 'underwriting', title: '特种行业投保时风险提示未显示', severity: 'medium', type: 'logic', fixSummary: '修复特殊职业触发条件', system: '前端应用' },

    // 续保类
    { bizType: 'renewal', title: '自动续保扣款后保单状态未更新', severity: 'high', type: 'logic', fixSummary: '修复扣款回调与保单状态联动', system: '支付网关' },
    { bizType: 'renewal', title: '续保提醒短信在已续保后仍重复发送', severity: 'medium', type: 'logic', fixSummary: '增加续保状态检查，避免重复通知', system: '通知服务' },
    { bizType: 'renewal', title: '批量续保时并发冲突导致数据错误', severity: 'high', type: 'logic', fixSummary: '引入分布式锁，解决并发写入问题', system: '核心系统' },
    { bizType: 'renewal', title: '续保优惠折扣计算逻辑存在漏洞', severity: 'medium', type: 'logic', fixSummary: '重新梳理折扣计算规则，增加测试用例', system: '核心系统' },
    { bizType: 'renewal', title: '续保期间被保险人信息变更未同步', severity: 'medium', type: 'logic', fixSummary: '修复变更事件监听器', system: '核心系统' },

    // 保单贷款类
    { bizType: 'policy_loan', title: '贷款金额超过现金价值80%，系统允许通过', severity: 'high', type: 'logic', fixSummary: '增加贷款金额上限校验规则，80%现金价值为硬上限', system: '核心系统' },
    { bizType: 'policy_loan', title: '保单贷款后现金价值展示未及时更新', severity: 'medium', type: 'environment', fixSummary: '修复现金价值实时计算逻辑', system: '前端应用' },
    { bizType: 'policy_loan', title: '贷款利息计算精度损失导致差额', severity: 'high', type: 'logic', fixSummary: '使用高精度计算库替换浮点运算', system: '核心系统' },
    { bizType: 'policy_loan', title: '还款后贷款记录状态未关闭', severity: 'medium', type: 'logic', fixSummary: '修复还款完成触发器', system: '核心系统' },

    // 身故理赔类
    { bizType: 'death_claim', title: '身故证明文件上传后核验接口超时', severity: 'high', type: 'environment', fixSummary: '优化文件核验接口性能，增加异步处理', system: '第三方接口' },
    { bizType: 'death_claim', title: '受益人顺序判定与条款规则不符', severity: 'high', type: 'business_req', fixSummary: '重新梳理受益人优先级规则，与条款对齐', system: '核心系统' },
    { bizType: 'death_claim', title: '多受益人分配比例合计不为100%时可提交', severity: 'high', type: 'logic', fixSummary: '增加比例合计校验，误差不超过0.01%', system: '核心系统' },
    { bizType: 'death_claim', title: '赔付打款后账务系统未收到回执', severity: 'high', type: 'environment', fixSummary: '修复账务系统回执接口，增加重试', system: '支付网关' },

    // 医疗险类
    { bizType: 'health_insurance', title: '免赔额计算规则未区分门诊住院', severity: 'high', type: 'business_req', fixSummary: '按条款分别配置门诊/住院免赔额', system: '核心系统' },
    { bizType: 'health_insurance', title: '医疗报销材料OCR识别失败率超30%', severity: 'high', type: 'environment', fixSummary: '升级OCR引擎，增加人工审核兜底', system: '第三方接口' },
    { bizType: 'health_insurance', title: '重复报销同一医疗费用未被拦截', severity: 'high', type: 'logic', fixSummary: '增加发票号唯一性校验', system: '核心系统' },
    { bizType: 'health_insurance', title: '报销比例上限计算未考虑年度累计', severity: 'high', type: 'logic', fixSummary: '增加年度累计报销额跟踪', system: '核心系统' },
    { bizType: 'health_insurance', title: '社保先行赔付金额抵扣逻辑错误', severity: 'high', type: 'logic', fixSummary: '修复社保/商保联动计算', system: '核心系统' },

    // 保全类
    { bizType: 'policy_service', title: '受益人变更后旧受益人信息仍显示', severity: 'medium', type: 'logic', fixSummary: '修复变更后缓存刷新机制', system: '前端应用' },
    { bizType: 'policy_service', title: '地址变更未同步至快递寄送系统', severity: 'medium', type: 'environment', fixSummary: '增加变更事件推送至物流系统', system: '第三方接口' },
    { bizType: 'policy_service', title: '保全申请提交后流水号重复', severity: 'high', type: 'logic', fixSummary: '修复流水号生成逻辑，增加唯一性约束', system: '核心系统' },
    { bizType: 'policy_service', title: '银行账号变更时未进行开户验证', severity: 'high', type: 'logic', fixSummary: '集成银行开户验证接口', system: '第三方接口' },
  ]

  // 扩展到480条
  const months = ['2023-06','2023-07','2023-08','2023-09','2023-10','2023-11','2023-12','2024-01','2024-02','2024-03','2024-04','2024-05']
  const statusOptions = ['open','fixed','closed','reopened']

  defectTemplates.forEach((tmpl, idx) => {
    // 每个模板生成约10条变体
    const count = Math.floor(480 / defectTemplates.length) + (idx < 480 % defectTemplates.length ? 1 : 0)
    for (let i = 0; i < count && defects.length < 480; i++) {
      const month = months[Math.floor(Math.random() * months.length)]
      const status = i === 0 ? 'closed' : statusOptions[Math.floor(Math.random() * statusOptions.length)]
      defects.push({
        defect_id: `DEF-${String(id).padStart(4, '0')}`,
        title: i === 0 ? tmpl.title : `${tmpl.title}（变体${i}）`,
        severity: tmpl.severity,
        biz_type: tmpl.bizType,
        defect_type: tmpl.type,
        description: `缺陷描述：${tmpl.title}。发现于${month}版本UAT阶段，影响正常业务流程。`,
        biz_tags: JSON.stringify([tmpl.bizType, tmpl.type]),
        fix_summary: tmpl.fixSummary,
        responsible_system: tmpl.system,
        status,
        created_month: month,
      })
      id++
    }
  })

  return defects.slice(0, 480)
}

module.exports = { BIZ_TEMPLATES, DEFECT_TYPES, RESPONSIBLE_SYSTEMS, generateDefectDB }
