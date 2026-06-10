const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { runAlertCheck } = require('../services/alertEngine');

const router = express.Router();
router.use(authMiddleware);

// GET /api/alerts - Get triggered alerts
router.get('/', (req, res) => {
  const db = getDb();
  const { version_id, level, resolved, page = 1, limit = 20 } = req.query;

  let sql = `
    SELECT a.*, ar.name as rule_name, ar.rule_type, tv.version as version_name, p.name as product_name
    FROM alerts a
    JOIN alert_rules ar ON a.rule_id = ar.id
    LEFT JOIN test_versions tv ON a.version_id = tv.id
    LEFT JOIN products p ON tv.product_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (version_id) { sql += ' AND a.version_id = ?'; params.push(version_id); }
  if (level) { sql += ' AND a.alert_level = ?'; params.push(level); }
  if (resolved !== undefined) { sql += ' AND a.is_resolved = ?'; params.push(resolved === 'true' ? 1 : 0); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM (${sql})`).get(...params).count;
  sql += ' ORDER BY a.triggered_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const alerts = db.prepare(sql).all(...params);
  res.json({ success: true, data: alerts, total });
});

// GET /api/alerts/rules - Get alert rules
router.get('/rules', (req, res) => {
  const db = getDb();
  const rules = db.prepare(`
    SELECT ar.*, tv.version as version_name, p.name as product_name, u.name as creator_name
    FROM alert_rules ar
    LEFT JOIN test_versions tv ON ar.version_id = tv.id
    LEFT JOIN products p ON tv.product_id = p.id
    LEFT JOIN users u ON ar.created_by = u.id
    ORDER BY ar.created_at DESC
  `).all();
  res.json({ success: true, data: rules });
});

// POST /api/alerts/rules
router.post('/rules', requireRole('admin', 'manager'), (req, res) => {
  const { version_id, name, rule_type, threshold, severity_filter, alert_level, notify_email, notify_in_app } = req.body;
  if (!name || !rule_type || threshold === undefined || !alert_level) {
    return res.status(400).json({ success: false, message: '规则名称、类型、阈值和预警级别不能为空' });
  }
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO alert_rules (uuid, version_id, name, rule_type, threshold, severity_filter, alert_level, notify_email, notify_in_app, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), version_id || null, name, rule_type, threshold, severity_filter || 'all', alert_level, notify_email ? 1 : 0, notify_in_app ? 1 : 0, req.user.id);

  const rule = db.prepare('SELECT * FROM alert_rules WHERE id=?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, message: '预警规则创建成功', data: rule });
});

// PUT /api/alerts/rules/:id
router.put('/rules/:id', requireRole('admin', 'manager'), (req, res) => {
  const { name, threshold, is_active, notify_email, notify_in_app } = req.body;
  const db = getDb();
  db.prepare(`UPDATE alert_rules SET name=?, threshold=?, is_active=?, notify_email=?, notify_in_app=? WHERE id=?`)
    .run(name, threshold, is_active ? 1 : 0, notify_email ? 1 : 0, notify_in_app ? 1 : 0, req.params.id);
  res.json({ success: true, message: '规则更新成功' });
});

// DELETE /api/alerts/rules/:id
router.delete('/rules/:id', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM alert_rules WHERE id=?').run(req.params.id);
  res.json({ success: true, message: '规则已删除' });
});

// POST /api/alerts/:id/resolve
router.post('/:id/resolve', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE alerts SET is_resolved=1, resolved_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  res.json({ success: true, message: '预警已标记为已处理' });
});

// POST /api/alerts/trigger-check (manual trigger)
router.post('/trigger-check', requireRole('admin', 'manager'), (req, res) => {
  runAlertCheck();
  res.json({ success: true, message: '预警检查已触发' });
});

module.exports = router;
