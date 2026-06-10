const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/notifications
router.get('/', (req, res) => {
  const db = getDb();
  const { is_read, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [req.user.id];
  if (is_read !== undefined) { sql += ' AND is_read = ?'; params.push(is_read === 'true' ? 1 : 0); }
  const total = db.prepare(`SELECT COUNT(*) as count FROM (${sql})`).get(...params).count;
  const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).count;
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const notifications = db.prepare(sql).all(...params);
  res.json({ success: true, data: notifications, total, unread });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ success: true, message: '全部已读' });
});

module.exports = router;
