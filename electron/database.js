const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_DIR = path.join(os.homedir(), '.smartloop');
const DB_PATH = path.join(DB_DIR, 'studio.db');

let db = null;

/**
 * Open (or create) the SQLite database and run migrations.
 */
function openDatabase() {
  if (db) return db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      temperature REAL DEFAULT 0.3,
      system INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  `);

  console.log('[DB] Database opened at', DB_PATH);
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

// --- Projects ---

function upsertProject({ id, name, color, temperature, system }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO projects (id, name, color, temperature, system, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = COALESCE(excluded.color, projects.color),
      temperature = COALESCE(excluded.temperature, projects.temperature),
      system = COALESCE(excluded.system, projects.system),
      updated_at = excluded.updated_at
  `).run(id, name, color || null, temperature ?? 0.3, system ? 1 : 0, now, now);
  return getProject(id);
}

function getProject(id) {
  const d = openDatabase();
  const row = d.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return row ? formatProject(row) : null;
}

function getAllProjects() {
  const d = openDatabase();
  return d.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().map(formatProject);
}

function updateProject(id, updates) {
  const d = openDatabase();
  const fields = [];
  const values = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.temperature !== undefined) { fields.push('temperature = ?'); values.push(updates.temperature); }

  if (fields.length === 0) return getProject(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  d.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProject(id);
}

function deleteProject(id) {
  const d = openDatabase();
  d.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

function formatProject(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    temperature: row.temperature,
    system: !!row.system,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Conversations ---

function createConversation({ id, title, project_id }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO conversations (id, title, project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title, project_id || null, now, now);
  return getConversation(id);
}

function getConversation(id) {
  const d = openDatabase();
  const row = d.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  return row ? formatConversation(row) : null;
}

function getConversations(projectId, order = 'asc') {
  const d = openDatabase();
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  if (projectId) {
    return d.prepare(`SELECT * FROM conversations WHERE project_id = ? ORDER BY created_at ${dir}`)
      .all(projectId).map(formatConversation);
  }
  return d.prepare(`SELECT * FROM conversations ORDER BY created_at ${dir}`)
    .all().map(formatConversation);
}

function updateConversation(id, updates) {
  const d = openDatabase();
  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.project_id !== undefined) { fields.push('project_id = ?'); values.push(updates.project_id); }

  if (fields.length === 0) return getConversation(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  d.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getConversation(id);
}

function deleteConversation(id) {
  const d = openDatabase();
  // Messages cascade-deleted via FK
  d.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

function formatConversation(row) {
  return {
    id: row.id,
    title: row.title,
    project_id: row.project_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Messages ---

function addMessage({ id, conversation_id, role, content }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, conversation_id, role, content, now);

  // Touch conversation updated_at
  d.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversation_id);
}

function addMessages(conversation_id, messages) {
  const d = openDatabase();
  const now = new Date().toISOString();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = d.transaction((msgs) => {
    for (const msg of msgs) {
      insert.run(msg.id, conversation_id, msg.role, msg.content, msg.created_at || now);
    }
    d.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversation_id);
  });

  tx(messages);
}

function getMessages(conversation_id) {
  const d = openDatabase();
  return d.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversation_id).map(formatMessage);
}

function deleteMessages(conversation_id) {
  const d = openDatabase();
  d.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversation_id);
}

function formatMessage(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
  };
}

module.exports = {
  openDatabase,
  closeDatabase,
  // Projects
  upsertProject,
  getProject,
  getAllProjects,
  updateProject,
  deleteProject,
  // Conversations
  createConversation,
  getConversation,
  getConversations,
  updateConversation,
  deleteConversation,
  // Messages
  addMessage,
  addMessages,
  getMessages,
  deleteMessages,
};
