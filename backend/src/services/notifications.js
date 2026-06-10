const { sendToUser } = require('./sse');

function createNotification(db, userId, type, title, content, link = null, alertLevel = 'info') {
  const result = db.prepare(`
    INSERT INTO notifications (user_id, type, title, content, link, alert_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type, title, content, link, alertLevel);

  // Push via SSE in real-time
  sendToUser(userId, {
    type: 'notification',
    id: result.lastInsertRowid,
    title,
    content,
    link,
    alertLevel,
    created_at: new Date().toISOString()
  });

  return result.lastInsertRowid;
}

module.exports = { createNotification };
