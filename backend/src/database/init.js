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
    defect_type TEXT NOT NULL CHECK(defect_type IN ('logic','environment','business_req','legacy')),
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
    created_by INTEGER,
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

  // 保险产品
  const productsData = [
    { name: '平安车险 2024',      type: '车险',   description: '新一代智能车险产品，支持UBI定价' },
    { name: '健康保障险 Pro',     type: '健康险', description: '涵盖重疾、医疗、意外的综合健康险' },
    { name: '终身寿险 · 传承版',  type: '寿险',   description: '高净值客户专属终身寿险产品' },
  ]
  const insertProduct = db.prepare(
    `INSERT INTO products (uuid,name,type,description,created_by) VALUES (@uuid,@name,@type,@description,@created_by)`
  )
  const productIds = []
  for (const p of productsData) {
    const r = insertProduct.run({ uuid: uuidv4(), ...p, created_by: userIds[0] })
    productIds.push(r.lastInsertRowid)
  }

  // 测试版本
  const versionsData = [
    { product_id: productIds[0], version: 'v2.1.0-UAT', description: '车险2.1版本UAT', status: 'testing',   start_date: '2024-01-15', end_date: null,         manager_id: userIds[1] },
    { product_id: productIds[0], version: 'v2.0.5-UAT', description: '车险2.0修复版',  status: 'completed', start_date: '2024-01-01', end_date: '2024-01-14', manager_id: userIds[1] },
    { product_id: productIds[1], version: 'v1.3.0-UAT', description: '健康险1.3 UAT',  status: 'testing',   start_date: '2024-01-10', end_date: null,         manager_id: userIds[1] },
    { product_id: productIds[2], version: 'v1.0.0-UAT', description: '寿险首个UAT',    status: 'planning',  start_date: '2024-02-01', end_date: null,         manager_id: userIds[1] },
  ]
  const insertVersion = db.prepare(
    `INSERT INTO test_versions (uuid,product_id,version,description,status,start_date,end_date,manager_id)
     VALUES (@uuid,@product_id,@version,@description,@status,@start_date,@end_date,@manager_id)`
  )
  const versionIds = []
  for (const v of versionsData) {
    const r = insertVersion.run({ uuid: uuidv4(), ...v })
    versionIds.push(r.lastInsertRowid)
  }

  // 缺陷（原有功能演示数据）
  const defectsData = [
    { severity: 'fatal',    status: 'in_progress',   title: '保单生成失败：核保接口超时',          module: '核保模块', assignee_id: userIds[2], root_cause_category: '接口问题',   vid: versionIds[0] },
    { severity: 'fatal',    status: 'assigned',       title: '理赔金额计算错误（差额超20%）',        module: '理赔模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   vid: versionIds[0] },
    { severity: 'critical', status: 'fixed',          title: '用户登录后会话异常失效',               module: '认证模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   vid: versionIds[0] },
    { severity: 'critical', status: 'pending_verify', title: '车辆信息校验规则不生效',               module: '核保模块', assignee_id: userIds[4], root_cause_category: '需求不清晰', vid: versionIds[0] },
    { severity: 'critical', status: 'new',            title: '投保人信息保存后数据丢失',             module: '投保模块', assignee_id: null,        root_cause_category: '数据库',    vid: versionIds[0] },
    { severity: 'major',    status: 'in_progress',    title: '保费计算页面加载超过10秒',             module: '保费计算', assignee_id: userIds[2], root_cause_category: '性能问题',   vid: versionIds[0] },
    { severity: 'major',    status: 'closed',         title: '批量导入投保数据时部分记录丢失',       module: '数据导入', assignee_id: userIds[2], root_cause_category: '代码逻辑',   vid: versionIds[0] },
    { severity: 'fatal',    status: 'assigned',       title: '在线支付跳转后无法返回系统',           module: '支付模块', assignee_id: userIds[2], root_cause_category: '接口问题',   vid: versionIds[0] },
    { severity: 'major',    status: 'in_progress',    title: '多次提交投保单未做幂等处理',           module: '投保模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   vid: versionIds[0] },
    { severity: 'critical', status: 'in_progress',    title: '健康告知问卷答案无法保存',             module: '核保模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   vid: versionIds[2] },
    { severity: 'critical', status: 'new',            title: '续保提醒通知发送失败',                 module: '通知模块', assignee_id: null,        root_cause_category: '接口问题',   vid: versionIds[0] },
    { severity: 'major',    status: 'assigned',       title: '导出保单PDF格式错乱',                  module: '报表模块', assignee_id: userIds[2], root_cause_category: '代码逻辑',   vid: versionIds[0] },
    { severity: 'minor',    status: 'new',            title: '日期选择器在Safari浏览器显示异常',     module: 'UI/前端',  assignee_id: null,        root_cause_category: '兼容性',    vid: versionIds[0] },
    { severity: 'minor',    status: 'closed',         title: '保险条款页面无法上下滚动',             module: 'UI/前端',  assignee_id: userIds[4], root_cause_category: '兼容性',    vid: versionIds[2] },
    { severity: 'minor',    status: 'new',            title: '错误提示文案不符合业务术语规范',       module: 'UI/前端',  assignee_id: null,        root_cause_category: '需求不清晰', vid: versionIds[0] },
  ]
  const insertDefect = db.prepare(
    `INSERT INTO defects (uuid,version_id,title,severity,status,module,assignee_id,reporter_id,root_cause_category,description,steps_to_reproduce)
     VALUES (@uuid,@version_id,@title,@severity,@status,@module,@assignee_id,@reporter_id,@root_cause_category,@description,@steps_to_reproduce)`
  )
  for (const d of defectsData) {
    insertDefect.run({
      uuid: uuidv4(), version_id: d.vid, title: d.title, severity: d.severity,
      status: d.status, module: d.module, assignee_id: d.assignee_id || null,
      reporter_id: userIds[3], root_cause_category: d.root_cause_category,
      description: `缺陷详情：${d.title}`,
      steps_to_reproduce: '1. 打开系统\n2. 执行相关操作\n3. 观察到问题现象'
    })
  }

  // 预警规则
  const rulesData = [
    { version_id: versionIds[0], name: '致命缺陷数量预警',  rule_type: 'fatal_count',    threshold: 3,  severity_filter: 'fatal',   alert_level: 'critical' },
    { version_id: versionIds[0], name: '严重缺陷占比预警',  rule_type: 'critical_ratio', threshold: 30, severity_filter: 'critical', alert_level: 'warning'  },
    { version_id: versionIds[0], name: '超时未处理预警',    rule_type: 'unhandled_days', threshold: 3,  severity_filter: 'all',      alert_level: 'warning'  },
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

  const defects = generateDefectDB()
  const insert = db.prepare(
    `INSERT INTO defect_db (defect_id,title,severity,biz_type,defect_type,description,biz_tags,fix_summary,responsible_system,status,created_month)
     VALUES (@defect_id,@title,@severity,@biz_type,@defect_type,@description,@biz_tags,@fix_summary,@responsible_system,@status,@created_month)`
  )
  for (const d of defects) {
    insert.run(d)
  }
  console.log(`✅ 历史缺陷知识库：${defects.length} 条`)
}

module.exports = { initDatabase, getDb }
