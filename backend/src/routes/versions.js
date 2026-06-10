const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/versions?product_id=
router.get('/', (req, res) => {
  const db = getDb();
  const { product_id } = req.query;
  let sql = `
    SELECT tv.*, p.name as product_name, p.type as product_type, u.name as manager_name,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id) as total_defects,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id AND severity='fatal') as fatal_count,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id AND severity='critical') as critical_count,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id AND status IN ('closed','rejected')) as closed_count
    FROM test_versions tv
    JOIN products p ON tv.product_id = p.id
    LEFT JOIN users u ON tv.manager_id = u.id
  `;
  const params = [];
  if (product_id) { sql += ' WHERE tv.product_id = ?'; params.push(product_id); }
  sql += ' ORDER BY tv.created_at DESC';
  const versions = db.prepare(sql).all(...params);
  res.json({ success: true, data: versions });
});

// GET /api/versions/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const version = db.prepare(`
    SELECT tv.*, p.name as product_name, p.type as product_type, u.name as manager_name,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id) as total_defects,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id AND severity='fatal') as fatal_count,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id AND severity='critical') as critical_count,
      (SELECT COUNT(*) FROM defects WHERE version_id = tv.id AND status='closed') as closed_count
    FROM test_versions tv
    JOIN products p ON tv.product_id = p.id
    LEFT JOIN users u ON tv.manager_id = u.id
    WHERE tv.id = ? OR tv.uuid = ?
  `).get(req.params.id, req.params.id);
  if (!version) return res.status(404).json({ success: false, message: '版本不存在' });
  res.json({ success: true, data: version });
});

// POST /api/versions
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const { product_id, version, description, start_date, end_date, manager_id } = req.body;
  if (!product_id || !version) return res.status(400).json({ success: false, message: '产品ID和版本号不能为空' });
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO test_versions (uuid, product_id, version, description, start_date, end_date, manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), product_id, version, description || '', start_date || null, end_date || null, manager_id || req.user.id);
  const ver = db.prepare('SELECT * FROM test_versions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, message: '版本创建成功', data: ver });
});

// PUT /api/versions/:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  const { version, description, status, start_date, end_date, manager_id } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE test_versions SET version=?, description=?, status=?, start_date=?, end_date=?, manager_id=?, updated_at=datetime('now','localtime')
    WHERE id=? OR uuid=?
  `).run(version, description, status, start_date, end_date, manager_id, req.params.id, req.params.id);
  const ver = db.prepare('SELECT * FROM test_versions WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  res.json({ success: true, message: '版本更新成功', data: ver });
});

module.exports = router;
