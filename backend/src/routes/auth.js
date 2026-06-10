const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: '邮箱和密码不能为空' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, message: '邮箱或密码错误' });
  }

  const token = generateToken(user);
  const { password_hash, ...userInfo } = user;

  res.json({
    success: true,
    message: '登录成功',
    data: { token, user: userInfo }
  });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, role = 'tester', department } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: '姓名、邮箱和密码不能为空' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ success: false, message: '该邮箱已被注册' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (uuid, name, email, password_hash, role, department)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), name, email, passwordHash, role, department || '');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const { password_hash, ...userInfo } = user;
  const token = generateToken(user);

  res.status(201).json({
    success: true,
    message: '注册成功',
    data: { token, user: userInfo }
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  const { password_hash, ...userInfo } = user;
  res.json({ success: true, data: userInfo });
});

module.exports = router;
