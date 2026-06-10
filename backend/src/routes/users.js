const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/users
router.get('/', (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, uuid, name, email, role, department, phone, is_active, created_at FROM users ORDER BY name').all();
  res.json({ success: true, data: users });
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, uuid, name, email, role, department, phone, is_active, created_at FROM users WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  res.json({ success: true, data: user });
});

module.exports = router;
