const path = require('path')
const bcrypt = require('bcryptjs')
const { createDatabase } = require('./db-wrapper')
const { BIZ_TEMPLATES, generateDefectDB } = require('../data/bizTemplates')

const DB_PATH = path.join(__dirname, '../../data/insurance_defects.db')
let _db = null

function getDb() {
  if (!_db) throw new Error('数据库未初始化，请先调用 initDatabase()')
  return _db
}

async function initDatabase() {
  console.log('📦 初始化数据库...')
  _db = await createDatabase(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  // ── 原有表 ─────────────────────────────────────────────
  _db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','manager','developer','tester')),
    avatar TEXT, department TEXT, phone TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, type TEXT NOT NULL, description TEXT,
    status TEXT DEFAULT 'active', created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS test_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL,
    product_id INTEGER NOT NULL, version TEXT NOT NULL, description TEXT,
    status TEXT DEFAULT 'testing', start_date TEXT, end_date TEXT,
    manager_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS defects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL,
    version_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    severity TEXT NOT NULL CHECK(severity IN ('fatal','critical','major','minor')),
    priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'new',
    module TEXT, environment TEXT, steps_to_reproduce TEXT,
    expected_result TEXT, actual_result TEXT,
    root_cause TEXT, root_cause_category TEXT, risk_level TEXT,
    reporter_id INTEGER, assignee_id INTEGER, closed_at TEXT,
    attachments TEXT DEFAULT '[]', tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS defect_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, defect_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL, content TEXT NOT NULL,
    type TEXT DEFAULT 'comment', created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL,
    version_id INTEGER, name TEXT NOT NULL, rule_type TEXT NOT NULL,
    threshold REAL NOT NULL, severity_filter TEXT DEFAULT 'all',
    alert_level TEXT NOT NULL, is_active INTEGER DEFAULT 1,
    notify_email INTEGER DEFAULT 1, notify_in_app INTEGER DEFAULT 1,
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE NOT NULL,
    rule_id INTEGER NOT NULL, version_id INTEGER, message TEXT NOT NULL,
    details TEXT DEFAULT '{}', alert_level TEXT NOT NULL,
    is_resolved INTEGER DEFAULT 0, resolved_at TEXT,
    triggered_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  _db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
    link TEXT, is_read INTEGER DEFAULT 0, alert_level TEXT DEFAULT 'info',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // ── 新增：历史缺陷知识库 ──────────────────────────────
  _db.exec(`CREATE TABLE IF NOT EXISTS defect_db (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    defect_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('high','medium','low')),
    biz_type TEXT NOT NULL,
    defect_type TEXT NOT NULL CHECK(defect_type IN ('system','environment','legacy','requirement','case')),
    defect_level TEXT,
    biz_domain TEXT,
    root_cause TEXT,
    func_module TEXT,
    insurance_product TEXT,
    product_type TEXT,
    test_system TEXT,
    scenario TEXT,
    tester TEXT,
    description TEXT,
    biz_tags TEXT DEFAULT '[]',
    fix_summary TEXT,
    responsible_system TEXT,
    status TEXT DEFAULT 'closed',
    created_month TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // ── 新增：业务类型模板表 ──────────────────────────────
  _db.exec(`CREATE TABLE IF NOT EXISTS biz_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    biz_type TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    default_risk_weight REAL DEFAULT 0.8,
    keywords TEXT DEFAULT '[]',
    risk_words TEXT DEFAULT '[]',
    description TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // ── 新增：测试案例分析记录表 ──────────────────────────
  _db.exec(`CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    case_index INTEGER DEFAULT 0,
    case_text TEXT NOT NULL,
    biz_types TEXT DEFAULT '[]',
    risk_score REAL DEFAULT 0,
    risk_level TEXT DEFAULT 'low',
    risk_label TEXT DEFAULT '低危',
    similar_defects TEXT DEFAULT '[]',
    reason TEXT,
    check_points TEXT DEFAULT '[]',
    status TEXT DEFAULT 'pending',
    upload_filename TEXT,
    feedback TEXT CHECK(feedback IN ('hit','false_alarm','missed','none')) DEFAULT 'none',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // ── 新增：大模型缓存表 ────────────────────────────────
  _db.exec(`CREATE TABLE IF NOT EXISTS llm_cache (
    case_hash TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // ── 新增：缺陷嵌入向量表 ──────────────────────────────
  _db.exec(`CREATE TABLE IF NOT EXISTS defect_embeddings (
    defect_id TEXT PRIMARY KEY,
    vector_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // 插入演示数据
  await seedDatabase(_db)
  _db._flush()
  console.log('✅ 数据库初始化完成')
}

async function seedDatabase(db) {
  const { v4: uuidv4 } = require('uuid')

  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get()
  if (existingUsers && existingUsers.count > 0) {
    // 仅补充新表数据
    const existingDefectDB = db.prepare('SELECT COUNT(*) as count FROM defect_db').get()
    if (!existingDefectDB || existingDefectDB.count === 0) {
      seedDefectDB(db)
      seedBizTemplates(db)
    }
    return
  }

  console.log('🌱 插入演示数据...')

  // 用户
  const usersData = [
    { name: '张伟',   email: 'admin@insure-test.com',   password: 'admin123',   role: 'admin',     department: '测试中心' },
    { name: '李晓明', email: 'manager@insure-test.com', password: 'manager123', role: 'manager',   department: '质量保障部' },
    { name: '王芳',   email: 'dev@insure-test.com',     password: 'dev123',     role: 'developer', department: '研发一部' },
    { name: '陈志远', email: 'tester@insure-test.com',  password: 'tester123',  role: 'tester',    department: '测试中心' },
    { name: '赵丽娜', email: 'tester2@insure-test.com', password: 'tester123',  role: 'tester',    department: '测试中心' },
  ]
  const insertUser = db.prepare(
    `INSERT INTO users (uuid,name,email,password_hash,role,department)
     VALUES (@uuid,@name,@email,@password_hash,@role,@department)`
  )
  const userIds = []
  for (const u of usersData) {
    const r = insertUser.run({ uuid: uuidv4(), name: u.name, email: u.email, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, department: u.department })
    userIds.push(r.lastInsertRowid)
  }

  // 读取 Excel 并动态提取保险产品
  let excelRows = []
  let hasExcel = false
  try {
    const XLSX = require('xlsx')
    const excelPath = 'D:/缺陷预警系统架构说明/2025年缺陷案例缺陷库基表.xlsx'
    const fs = require('fs')
    if (fs.existsSync(excelPath)) {
      const workbook = XLSX.readFile(excelPath)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      excelRows = rows.slice(2)
      hasExcel = true
      console.log(`📊 [Seeder] 成功从 Excel 解析了 ${excelRows.length} 行数据`)
    }
  } catch (err) {
    console.error('❌ [Seeder] 解析 Excel 失败:', err)
  }

  const productsMap = new Map() // name -> type
  if (hasExcel) {
    for (const row of excelRows) {
      const pName = (row[2] || '').toString().replace(/\n/g, '').trim()
      const pType = (row[5] || '').toString().replace(/\n/g, '').trim().replace(/\s+/g, '')
      if (pName && pType && pName !== 'N/A' && pName !== '未知') {
        productsMap.set(pName, pType)
      }
    }
  } else {
    // 兜底数据 (完全去车险化)
    productsMap.set('《太保全家福赠险》', '赠险')
    productsMap.set('《太保鑫相伴(2025)终身寿险》', '终寿')
    productsMap.set('《太保尊享百万医疗保险》', '健康')
    productsMap.set('《太保蛮好的人生(2025)年金保险》', '年金')
    productsMap.set('《太保神州行3.0两全保险》', '两全')
  }

  // 插入产品
  const insertProduct = db.prepare(
    `INSERT INTO products (uuid,name,type,description,created_by) VALUES (@uuid,@name,@type,@description,@created_by)`
  )
  const productIds = {} // name -> id
  for (const [pName, pType] of productsMap.entries()) {
    const uuid = uuidv4()
    const r = insertProduct.run({
      uuid,
      name: pName,
      type: pType,
      description: `${pName} (${pType}) UAT测试项目`,
      created_by: userIds[0]
    })
    productIds[pName] = r.lastInsertRowid
  }
  console.log(`🌱 动态导入了 ${productsMap.size} 个保险产品（已去除所有车险）`)

  // 插入测试版本
  const insertVersion = db.prepare(
    `INSERT INTO test_versions (uuid,product_id,version,description,status,start_date,end_date,manager_id)
     VALUES (@uuid,@product_id,@version,@description,@status,@start_date,@end_date,@manager_id)`
  )
  const versionIds = {} // productName -> versionRowId
  for (const [pName, pId] of Object.entries(productIds)) {
    const uuid = uuidv4()
    const r = insertVersion.run({
      uuid,
      product_id: pId,
      version: 'v1.0.0-UAT',
      description: `${pName} 首个UAT测试版本`,
      status: 'testing',
      start_date: '2025-01-15',
      end_date: null,
      manager_id: userIds[1] // 李晓明 (Manager)
    })
    versionIds[pName] = r.lastInsertRowid
  }

  // 插入当前追踪缺陷 (defects 表)
  const defectsToSeed = []
  if (hasExcel) {
    const { parseRealDefects } = require('../data/bizTemplates')
    const allRealDefects = parseRealDefects(excelRows)
    
    // 取前 50 条做活跃缺陷导入追踪管理表
    const selectedDefects = allRealDefects.slice(0, 50)
    for (const d of selectedDefects) {
      const pName = d.insurance_product
      const vId = versionIds[pName] || Object.values(versionIds)[0]

      let severity = 'major'
      if (d.severity === 'high') severity = 'critical'
      else if (d.severity === 'medium') severity = 'major'
      else severity = 'minor'

      let status = d.status
      if (status === 'closed') {
        status = 'closed'
      } else {
        const activeStatuses = ['new', 'assigned', 'in_progress', 'pending_verify']
        const randIndex = Math.abs(d.defect_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % activeStatuses.length
        status = activeStatuses[randIndex]
      }

      let category = '代码逻辑'
      if (d.defect_type === 'environment') category = '测试环境'
      else if (d.defect_type === 'legacy') category = '历史遗留'
      else if (d.defect_type === 'requirement') category = '需求不一致'

      defectsToSeed.push({
        uuid: uuidv4(),
        version_id: vId,
        title: d.title,
        description: d.description || `缺陷编号: ${d.defect_id}。发现于真实UAT测试阶段。`,
        severity,
        priority: d.severity === 'high' ? 'high' : 'medium',
        status,
        module: d.func_module || d.biz_domain || '核心模块',
        environment: d.test_system || 'UAT环境',
        steps_to_reproduce: `发现系统: ${d.test_system || '未指定'}\n测试场景: ${d.scenario || '未指定'}\n问题现象:\n${d.description}`,
        expected_result: '功能校验符合保险产品设计与开发规则',
        actual_result: '系统在测试场景中产生异常或阻断问题',
        root_cause: d.root_cause || '待进一步分析修复',
        root_cause_category: category,
        risk_level: d.severity === 'high' ? 'high' : 'medium',
        reporter_id: userIds[3],
        assignee_id: status === 'closed' ? userIds[2] : (status === 'new' ? null : userIds[2]),
        closed_at: status === 'closed' ? "2025-03-15 14:00:00" : null,
        attachments: '[]',
        tags: JSON.stringify([d.biz_domain, d.scenario].filter(Boolean))
      })
    }
  } else {
    // 兜底模拟缺陷数据 (去车险)
    const mockDefects = [
      { severity: 'fatal',    status: 'in_progress',   title: '保单生成失败：核保接口超时',          module: '核保模块', assignee_id: userIds[2], root_cause_category: '接口问题',   pName: '《太保尊享百万医疗保险》' },
      { severity: 'fatal',    status: 'assigned',       title: '理赔金额计算错误（差额超20%）',        module: '理赔模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   pName: '《太保尊享百万医疗保险》' },
      { severity: 'critical', status: 'fixed',          title: '用户登录后会话异常失效',               module: '认证模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   pName: '《太保全家福赠险》' },
      { severity: 'critical', status: 'pending_verify', title: '被保险人豁慢规则不生效',               module: '核保模块', assignee_id: userIds[4], root_cause_category: '需求不清晰', pName: '《太保鑫相伴(2025)终身寿险》' },
      { severity: 'critical', status: 'new',            title: '投保人信息保存后数据丢失',             module: '投保模块', assignee_id: null,        root_cause_category: '数据库',    pName: '《太保全家福赠险》' },
      { severity: 'major',    status: 'in_progress',    title: '保费计算页面加载超过10秒',             module: '保费计算', assignee_id: userIds[2], root_cause_category: '性能问题',   pName: '《太保尊享百万医疗保险》' },
      { severity: 'major',    status: 'closed',         title: '批量导入投保数据时部分记录丢失',       module: '数据导入', assignee_id: userIds[2], root_cause_category: '代码逻辑',   pName: '《太保全家福赠险》' },
      { severity: 'fatal',    status: 'assigned',       title: '在线支付跳转后无法返回系统',           module: '支付模块', assignee_id: userIds[2], root_cause_category: '接口问题',   pName: '《太保蛮好的人生(2025)年金保险》' },
      { severity: 'major',    status: 'in_progress',    title: '多次提交投保单未做幂等处理',           module: '投保模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   pName: '《太保全家福赠险》' },
      { severity: 'critical', status: 'in_progress',    title: '健康告知问卷答案无法保存',             module: '核保模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   pName: '《太保尊享百万医疗保险》' },
      { severity: 'critical', status: 'new',            title: '续保提醒通知发送失败',                 module: '通知模块', assignee_id: null,        root_cause_category: '接口问题',   pName: '《太保尊享百万医疗保险》' },
      { severity: 'major',    status: 'assigned',       title: '导出保单PDF格式错乱',                  module: '报表模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   pName: '《太保全家福赠险》' },
      { severity: 'minor',    status: 'new',            title: '日期选择器在Safari浏览器显示异常',     module: 'UI/前端',  assignee_id: null,        root_cause_category: '兼容性',    pName: '《太保全家福赠险》' },
      { severity: 'minor',    status: 'closed',         title: '保险条款页面无法上下滚动',             module: 'UI/前端',  assignee_id: userIds[4], root_cause_category: '兼容性',    pName: '《太保鑫相伴(2025)终身寿险》' },
      { severity: 'minor',    status: 'new',            title: '错误提示文案不符合业务术语规范',       module: 'UI/前端',  assignee_id: null,        root_cause_category: '需求不清晰', pName: '《太保全家福赠险》' },
    ]

    for (const d of mockDefects) {
      const vId = versionIds[d.pName] || Object.values(versionIds)[0]
      defectsToSeed.push({
        uuid: uuidv4(),
        version_id: vId,
        title: d.title,
        description: `缺陷详情：${d.title}`,
        severity: d.severity,
        priority: d.severity === 'fatal' || d.severity === 'critical' ? 'high' : 'medium',
        status: d.status,
        module: d.module,
        environment: 'UAT环境',
        steps_to_reproduce: '1. 打开系统\n2. 执行相关操作\n3. 观察到问题现象',
        expected_result: '操作正常完成',
        actual_result: '系统抛出异常',
        root_cause: '待分析',
        root_cause_category: d.root_cause_category,
        risk_level: d.severity === 'fatal' || d.severity === 'critical' ? 'high' : 'medium',
        reporter_id: userIds[3],
        assignee_id: d.assignee_id || null,
        closed_at: d.status === 'closed' ? "2025-03-15 14:00:00" : null,
        attachments: '[]',
        tags: '[]'
      })
    }
  }

  const insertDefect = db.prepare(
    `INSERT INTO defects (
      uuid, version_id, title, description, severity, priority, status,
      module, environment, steps_to_reproduce, expected_result, actual_result,
      root_cause, root_cause_category, risk_level, reporter_id, assignee_id, closed_at,
      attachments, tags
    ) VALUES (
      @uuid, @version_id, @title, @description, @severity, @priority, @status,
      @module, @environment, @steps_to_reproduce, @expected_result, @actual_result,
      @root_cause, @root_cause_category, @risk_level, @reporter_id, @assignee_id, @closed_at,
      @attachments, @tags
    )`
  )
  for (const d of defectsToSeed) {
    insertDefect.run(d)
  }
  console.log(`🌱 成功导入了 ${defectsToSeed.length} 条当前缺陷数据至 defects 追踪表`)

  // 预警规则
  const firstVersionId = Object.values(versionIds)[0]
  const rulesData = [
    { version_id: firstVersionId, name: '致命缺陷数量预警',  rule_type: 'fatal_count',    threshold: 3,  severity_filter: 'fatal',   alert_level: 'critical' },
    { version_id: firstVersionId, name: '严重缺陷占比预警',  rule_type: 'critical_ratio', threshold: 30, severity_filter: 'critical', alert_level: 'warning'  },
    { version_id: firstVersionId, name: '超时未处理预警',    rule_type: 'unhandled_days', threshold: 3,  severity_filter: 'all',      alert_level: 'warning'  },
    { version_id: null,           name: '全局致命缺陷预警', rule_type: 'fatal_count',    threshold: 5,  severity_filter: 'fatal',   alert_level: 'critical' },
  ]
  const insertRule = db.prepare(
    `INSERT INTO alert_rules (uuid,version_id,name,rule_type,threshold,severity_filter,alert_level,created_by)
     VALUES (@uuid,@version_id,@name,@rule_type,@threshold,@severity_filter,@alert_level,@created_by)`
  )
  for (const r of rulesData) {
    insertRule.run({ uuid: uuidv4(), ...r, created_by: userIds[1] })
  }

  // 新表：业务模板 + 历史缺陷库
  seedBizTemplates(db)
  seedDefectDB(db)

  console.log('✅ 演示数据插入完成')
  console.log('   管理员:   admin@insure-test.com   / admin123')
  console.log('   项目经理: manager@insure-test.com / manager123')
  console.log('   开发:     dev@insure-test.com     / dev123')
  console.log('   测试员:   tester@insure-test.com  / tester123')
}

function seedBizTemplates(db) {
  const exist = db.prepare('SELECT COUNT(*) as count FROM biz_templates').get()
  if (exist && exist.count > 0) return

  const insert = db.prepare(
    `INSERT INTO biz_templates (biz_type,label,icon,color,default_risk_weight,keywords,risk_words,description)
     VALUES (@biz_type,@label,@icon,@color,@default_risk_weight,@keywords,@risk_words,@description)`
  )
  for (const t of BIZ_TEMPLATES) {
    insert.run({
      biz_type: t.bizType, label: t.label, icon: t.icon, color: t.color,
      default_risk_weight: t.defaultRiskWeight,
      keywords: JSON.stringify(t.keywords),
      risk_words: JSON.stringify(t.riskWords),
      description: t.description
    })
  }
  console.log(`✅ 业务类型模板：${BIZ_TEMPLATES.length} 条`)
}

function seedDefectDB(db) {
  const exist = db.prepare('SELECT COUNT(*) as count FROM defect_db').get()
  if (exist && exist.count > 0) return

  let defects = []
  try {
    const XLSX = require('xlsx')
    const excelPath = 'D:/缺陷预警系统架构说明/2025年缺陷案例缺陷库基表.xlsx'
    const fs = require('fs')
    if (fs.existsSync(excelPath)) {
      const workbook = XLSX.readFile(excelPath)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      // Skip headers (rows 0 and 1)
      const dataRows = rows.slice(2)
      const { parseRealDefects } = require('../data/bizTemplates')
      defects = parseRealDefects(dataRows)
      console.log(`📊 成功从 Excel 解析了 ${defects.length} 条真实缺陷数据`)
    } else {
      console.warn(`⚠️ 未找到真实缺陷数据 Excel 文件：${excelPath}，使用模拟数据 fallback`)
      defects = generateDefectDB()
    }
  } catch (err) {
    console.error('❌ 解析 Excel 失败，使用模拟数据 fallback:', err)
    defects = generateDefectDB()
  }

  const insert = db.prepare(
    `INSERT INTO defect_db (
      defect_id, title, severity, biz_type, defect_type, 
      defect_level, biz_domain, root_cause, func_module, 
      insurance_product, product_type, test_system, scenario, tester,
      description, biz_tags, fix_summary, responsible_system, status, created_month
    ) VALUES (
      @defect_id, @title, @severity, @biz_type, @defect_type, 
      @defect_level, @biz_domain, @root_cause, @func_module, 
      @insurance_product, @product_type, @test_system, @scenario, @tester,
      @description, @biz_tags, @fix_summary, @responsible_system, @status, @created_month
    )`
  )

  for (const d of defects) {
    insert.run(d)
  }
  console.log(`✅ 历史缺陷知识库：${defects.length} 条`)
}

module.exports = { initDatabase, getDb }
