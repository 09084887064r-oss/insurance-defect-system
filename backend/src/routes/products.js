const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/products
router.get('/', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = `
    SELECT p.*, u.name as creator_name,
      (SELECT COUNT(*) FROM test_versions WHERE product_id = p.id) as version_count,
      (SELECT COUNT(*) FROM defects d 
       JOIN test_versions tv ON d.version_id = tv.id 
       WHERE tv.product_id = p.id AND d.status NOT IN ('closed','rejected')) as open_defect_count
    FROM products p
    LEFT JOIN users u ON p.created_by = u.id
  `;
  const params = [];
  if (status) { sql += ' WHERE p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.created_at DESC';
  const products = db.prepare(sql).all(...params);
  res.json({ success: true, data: products });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare(`
    SELECT p.*, u.name as creator_name FROM products p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ? OR p.uuid = ?
  `).get(req.params.id, req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  res.json({ success: true, data: product });
});

// POST /api/products
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const { name, type, description } = req.body;
  if (!name || !type) return res.status(400).json({ success: false, message: '产品名称和类型不能为空' });
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO products (uuid, name, type, description, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), name, type, description || '', req.user.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, message: '产品创建成功', data: product });
});

// PUT /api/products/:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  const { name, type, description, status } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE products SET name=?, type=?, description=?, status=?, updated_at=datetime('now','localtime')
    WHERE id=? OR uuid=?
  `).run(name, type, description, status, req.params.id, req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  res.json({ success: true, message: '产品更新成功', data: product });
});

// DELETE /api/products/:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE products SET status=? WHERE id=? OR uuid=?').run('archived', req.params.id, req.params.id);
  res.json({ success: true, message: '产品已归档' });
});

module.exports = router;
