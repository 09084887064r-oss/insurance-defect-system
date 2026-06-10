/**
 * sql.js 适配器 —— 模拟 better-sqlite3 的同步 API
 * 
 * better-sqlite3 是同步的原生 SQLite 绑定（需要 C++ 编译）
 * sql.js 是纯 WebAssembly 实现，无需任何编译
 * 
 * 这个文件提供与 better-sqlite3 兼容的 API：
 *   db.prepare(sql).all(...params)
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).run(...params)  → { lastInsertRowid }
 *   db.exec(sql)
 *   db.pragma(str)
 */

const fs = require('fs')
const path = require('path')

/**
 * 将 better-sqlite3 风格的命名参数对象转换为 sql.js 风格
 * better-sqlite3: { name: 'Alice' }  配合 SQL 中的 @name
 * sql.js:         { '@name': 'Alice' }
 */
function convertNamedParams(obj) {
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    // 已经有前缀就不重复加
    if (key.startsWith('@') || key.startsWith(':') || key.startsWith('$')) {
      result[key] = val
    } else {
      result[`@${key}`] = val
    }
  }
  return result
}

/**
 * 判断参数是否为命名参数对象
 */
function isNamedParam(args) {
  return (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  )
}

/**
 * 封装的 PreparedStatement（模拟 better-sqlite3 Statement）
 */
class Statement {
  constructor(sqlDb, wrapper, sql) {
    this._sqlDb = sqlDb     // sql.js Database 实例
    this._wrapper = wrapper // DatabaseWrapper 实例
    this._sql = sql
  }

  /** 返回所有行 */
  all(...args) {
    const bindParams = isNamedParam(args) ? convertNamedParams(args[0]) : args
    const stmt = this._sqlDb.prepare(this._sql)
    const rows = []
    try {
      if (bindParams.length > 0 || typeof bindParams === 'object' && !Array.isArray(bindParams)) {
        stmt.bind(Array.isArray(bindParams) ? bindParams : bindParams)
      }
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
    } finally {
      stmt.free()
    }
    return rows
  }

  /** 返回第一行，没有则返回 undefined */
  get(...args) {
    const bindParams = isNamedParam(args) ? convertNamedParams(args[0]) : args
    const stmt = this._sqlDb.prepare(this._sql)
    let row = undefined
    try {
      if (bindParams.length > 0 || (typeof bindParams === 'object' && !Array.isArray(bindParams) && Object.keys(bindParams).length > 0)) {
        stmt.bind(Array.isArray(bindParams) ? bindParams : bindParams)
      }
      if (stmt.step()) {
        row = stmt.getAsObject()
      }
    } finally {
      stmt.free()
    }
    return row
  }

  /** 执行写操作，返回 { lastInsertRowid } */
  run(...args) {
    const bindParams = isNamedParam(args) ? convertNamedParams(args[0]) : args
    const stmt = this._sqlDb.prepare(this._sql)
    try {
      if (Array.isArray(bindParams) && bindParams.length > 0) {
        stmt.bind(bindParams)
      } else if (!Array.isArray(bindParams) && Object.keys(bindParams).length > 0) {
        stmt.bind(bindParams)
      }
      stmt.step()
    } finally {
      stmt.free()
    }

    // 获取最后插入行的 ID
    let lastInsertRowid = 0
    const result = this._sqlDb.exec('SELECT last_insert_rowid()')
    if (result.length > 0 && result[0].values.length > 0) {
      lastInsertRowid = result[0].values[0][0]
    }

    // 触发延迟保存（防止高频写入时过多 IO）
    this._wrapper._scheduleSave()

    return { lastInsertRowid, changes: this._sqlDb.getRowsModified() }
  }
}

/**
 * 封装的 Database（模拟 better-sqlite3 Database）
 */
class DatabaseWrapper {
  constructor(sqlDb, filePath) {
    this._sqlDb = sqlDb
    this._filePath = filePath
    this._saveTimer = null
    this._dirty = false
  }

  /** 准备语句 */
  prepare(sql) {
    return new Statement(this._sqlDb, this, sql)
  }

  /** 执行 SQL（通常用于 DDL） */
  exec(sql) {
    const result = this._sqlDb.exec(sql)
    return result
  }

  /** PRAGMA 指令 */
  pragma(str) {
    try {
      this._sqlDb.run(`PRAGMA ${str}`)
    } catch (e) {
      // 部分 PRAGMA 在 sql.js 中不支持，忽略即可
    }
    return this
  }

  /** 计划延迟保存（200ms 内多次写入只触发一次 IO） */
  _scheduleSave() {
    this._dirty = true
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => this._flush(), 200)
  }

  /** 立即保存到磁盘 */
  _flush() {
    if (!this._dirty && this._saveTimer === null) return
    this._dirty = false
    this._saveTimer = null
    try {
      const data = this._sqlDb.export()
      const dir = path.dirname(this._filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this._filePath, Buffer.from(data))
    } catch (e) {
      console.error('[DB] 保存失败:', e.message)
    }
  }
}

/**
 * 创建数据库（异步，因为 sql.js 初始化是异步的）
 * @param {string} filePath - SQLite 文件路径
 * @returns {Promise<DatabaseWrapper>}
 */
async function createDatabase(filePath) {
  const initSqlJs = require('sql.js')
  const SqlJs = await initSqlJs()

  let sqlDb
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath)
    sqlDb = new SqlJs.Database(fileBuffer)
    console.log('[DB] 从磁盘加载已有数据库')
  } else {
    sqlDb = new SqlJs.Database()
    console.log('[DB] 创建新数据库')
  }

  const wrapper = new DatabaseWrapper(sqlDb, filePath)

  // 进程退出时确保数据落盘
  process.on('exit', () => wrapper._flush())
  process.on('SIGINT', () => { wrapper._flush(); process.exit(0) })
  process.on('SIGTERM', () => { wrapper._flush(); process.exit(0) })

  return wrapper
}

module.exports = { createDatabase }
