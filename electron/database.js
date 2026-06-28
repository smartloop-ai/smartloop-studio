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
      citations TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_percent REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tps_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tokens_per_second INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS install_status (
      step INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_usage_created ON memory_usage(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tps_history_created ON tps_history(created_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      server_type TEXT NOT NULL DEFAULT 'local',
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_servers_project ON mcp_servers(project_id);

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);

    CREATE TABLE IF NOT EXISTS document_folders (
      document_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_folders_project ON document_folders(project_id);
    CREATE INDEX IF NOT EXISTS idx_document_folders_folder ON document_folders(folder_id);

    CREATE TABLE IF NOT EXISTS document_status (
      document_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_document_status_project ON document_status(project_id);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
  `);

  // Seed install_status rows (4 steps) if not present
  const seedStep = db.prepare('INSERT OR IGNORE INTO install_status (step, name, completed) VALUES (?, ?, 0)');
  seedStep.run(0, 'download_extract');
  seedStep.run(1, 'service_install');
  seedStep.run(2, 'symlink_created');
  seedStep.run(3, 'path_configured');

  // Migration: add is_selected column
  const cols = db.prepare("PRAGMA table_info(conversations)").all();
  if (!cols.find(c => c.name === 'is_selected')) {
    db.exec("ALTER TABLE conversations ADD COLUMN is_selected INTEGER DEFAULT 0");
    console.log('[DB] Added is_selected column to conversations');
  }

  // Migration: add citations column to messages
  const msgCols = db.prepare("PRAGMA table_info(messages)").all();
  if (!msgCols.find(c => c.name === 'citations')) {
    db.exec("ALTER TABLE messages ADD COLUMN citations TEXT");
    console.log('[DB] Added citations column to messages');
  }

  // Migration: add message_id column to messages (backend-assigned msg-* ID)
  if (!msgCols.find(c => c.name === 'message_id')) {
    db.exec("ALTER TABLE messages ADD COLUMN message_id TEXT");
    console.log('[DB] Added message_id column to messages');
  }

  // Migration: add folder_path column to projects
  const projectCols = db.prepare("PRAGMA table_info(projects)").all();
  if (!projectCols.find(c => c.name === 'folder_path')) {
    db.exec("ALTER TABLE projects ADD COLUMN folder_path TEXT");
    console.log('[DB] Added folder_path column to projects');
  }

  // Migration: seed default local MCP server for existing projects that don't have one
  const existingProjects = db.prepare('SELECT id, name FROM projects').all();
  const insertMcp = db.prepare(`
    INSERT OR IGNORE INTO mcp_servers (id, project_id, name, server_type, config, created_at, updated_at)
    VALUES (?, ?, ?, 'local', ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const proj of existingProjects) {
    const existing = db.prepare('SELECT id FROM mcp_servers WHERE project_id = ?').get(proj.id);
    if (!existing) {
      const mcpId = `mcp_local_${proj.id}`;
      const config = JSON.stringify({ name: proj.name });
      insertMcp.run(mcpId, proj.id, proj.name, config, now, now);
      console.log(`[DB] Seeded default local MCP server for project: ${proj.name}`);
    }
  }

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

/**
 * Expand ~ to home directory.
 * Returns the resolved absolute path, or the original value on error.
 */
function ensureFolderPath(folderPath) {
  if (!folderPath) return folderPath;
  try {
    return folderPath.startsWith('~')
      ? path.join(os.homedir(), folderPath.replace(/^~[/\\]?/, ''))
      : folderPath;
  } catch (err) {
    return folderPath;
  }
}

function upsertProject({ id, name, color, temperature, system, folder_path }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  const resolvedPath = ensureFolderPath(folder_path);
  d.prepare(`
    INSERT INTO projects (id, name, color, temperature, system, folder_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = COALESCE(excluded.color, projects.color),
      temperature = COALESCE(excluded.temperature, projects.temperature),
      system = COALESCE(excluded.system, projects.system),
      folder_path = COALESCE(excluded.folder_path, projects.folder_path),
      updated_at = excluded.updated_at
  `).run(id, name, color || null, temperature ?? 0.3, system ? 1 : 0, resolvedPath || null, now, now);
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
  if (updates.folder_path !== undefined) { fields.push('folder_path = ?'); values.push(ensureFolderPath(updates.folder_path)); }

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
    folder_path: row.folder_path || null,
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

function deleteConversationsByProject(projectId) {
  const d = openDatabase();
  // Messages cascade-deleted via FK on each conversation
  d.prepare('DELETE FROM conversations WHERE project_id = ?').run(projectId);
}


function selectConversation(id) {
  const d = openDatabase();
  d.prepare('UPDATE conversations SET is_selected = 0 WHERE is_selected = 1').run();
  if (id) {
    d.prepare('UPDATE conversations SET is_selected = 1 WHERE id = ?').run(id);
  }
}

function clearSelectedConversation() {
  const d = openDatabase();
  d.prepare('UPDATE conversations SET is_selected = 0 WHERE is_selected = 1').run();
}

function getSelectedConversation() {
  const d = openDatabase();
  const row = d.prepare('SELECT * FROM conversations WHERE is_selected = 1 LIMIT 1').get();
  return row ? formatConversation(row) : null;
}

function formatConversation(row) {
  return {
    id: row.id,
    title: row.title,
    project_id: row.project_id,
    is_selected: !!row.is_selected,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Messages ---

function addMessage({ id, conversation_id, role, content }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, conversation_id, role, content, now);

  // Touch conversation updated_at
  d.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversation_id);
}

function addMessages(conversation_id, messages) {
  const d = openDatabase();
  const now = new Date().toISOString();
  const insert = d.prepare(`
    INSERT OR REPLACE INTO messages (id, conversation_id, role, content, citations, message_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = d.transaction((msgs) => {
    for (const msg of msgs) {
      const citations = msg.citations ? JSON.stringify(msg.citations) : null;
      insert.run(msg.id, conversation_id, msg.role, msg.content, citations, msg.message_id || null, msg.created_at || now);
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
  const msg = {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
  };
  if (row.message_id) {
    msg.message_id = row.message_id;
  }
  if (row.citations) {
    try { msg.citations = JSON.parse(row.citations); } catch {}
  }
  return msg;
}

// --- Memory Usage ---

function addMemoryUsage(memoryPercent) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare('INSERT INTO memory_usage (memory_percent, created_at) VALUES (?, ?)').run(memoryPercent, now);

  // Keep only last 1000 entries to avoid unbounded growth
  d.prepare(`
    DELETE FROM memory_usage WHERE id NOT IN (
      SELECT id FROM memory_usage ORDER BY created_at DESC LIMIT 1000
    )
  `).run();
}

function getMemoryUsage(limit = 60) {
  const d = openDatabase();
  return d.prepare('SELECT memory_percent, created_at FROM memory_usage ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .reverse(); // Return in chronological order
}

// --- TPS History ---

function addTpsEntry(tokensPerSecond) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare('INSERT INTO tps_history (tokens_per_second, created_at) VALUES (?, ?)').run(tokensPerSecond, now);

  // Keep only last 1000 entries
  d.prepare(`
    DELETE FROM tps_history WHERE id NOT IN (
      SELECT id FROM tps_history ORDER BY created_at DESC LIMIT 1000
    )
  `).run();
}

function getTpsHistory(limit = 60) {
  const d = openDatabase();
  return d.prepare('SELECT tokens_per_second, created_at FROM tps_history ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .reverse();
}

// --- Install Status ---

function setInstallStepComplete(step) {
  const d = openDatabase();
  d.prepare('UPDATE install_status SET completed = 1, completed_at = ? WHERE step = ?')
    .run(new Date().toISOString(), step);
}

function getInstallStatus() {
  const d = openDatabase();
  return d.prepare('SELECT step, name, completed, completed_at FROM install_status ORDER BY step ASC').all();
}

function isFullyInstalled() {
  const d = openDatabase();
  const row = d.prepare('SELECT COUNT(*) as cnt FROM install_status WHERE completed = 0').get();
  return row.cnt === 0;
}

function resetInstallStatus() {
  const d = openDatabase();
  d.prepare('UPDATE install_status SET completed = 0, completed_at = NULL').run();
}

// --- Settings (key-value) ---

function getSetting(key) {
  const d = openDatabase();
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);
}

function getAllSettings() {
  const d = openDatabase();
  const rows = d.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

// --- MCP Servers ---

function addMcpServer({ id, project_id, name, server_type, config }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT OR REPLACE INTO mcp_servers (id, project_id, name, server_type, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, name, server_type || 'local', config ? JSON.stringify(config) : null, now, now);
  return getMcpServer(id);
}

function getMcpServer(id) {
  const d = openDatabase();
  const row = d.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
  return row ? formatMcpServer(row) : null;
}

function getMcpServersByProject(projectId) {
  const d = openDatabase();
  return d.prepare('SELECT * FROM mcp_servers WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId).map(formatMcpServer);
}

function deleteMcpServer(id) {
  const d = openDatabase();
  d.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

function deleteMcpServersByProject(projectId) {
  const d = openDatabase();
  d.prepare('DELETE FROM mcp_servers WHERE project_id = ?').run(projectId);
}

function formatMcpServer(row) {
  let config = null;
  try {
    config = row.config ? JSON.parse(row.config) : null;
  } catch {
    config = row.config;
  }
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    server_type: row.server_type,
    config,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Folders (UI-only grouping for documents) ---

function createFolder({ id, project_id, name }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  const folderId = id || `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  d.prepare(`
    INSERT INTO folders (id, project_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(folderId, project_id, name, now, now);
  return getFolder(folderId);
}

function getFolder(id) {
  const d = openDatabase();
  const row = d.prepare('SELECT * FROM folders WHERE id = ?').get(id);
  return row ? formatFolder(row) : null;
}

function listFoldersByProject(projectId) {
  const d = openDatabase();
  const rows = d.prepare(`
    SELECT f.*, (
      SELECT COUNT(*) FROM document_folders df WHERE df.folder_id = f.id
    ) AS document_count
    FROM folders f
    WHERE f.project_id = ?
    ORDER BY f.created_at ASC
  `).all(projectId);
  return rows.map(formatFolder);
}

function renameFolder(id, name) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
  return getFolder(id);
}

function deleteFolder(id) {
  const d = openDatabase();
  // document_folders rows cascade-deleted via FK
  d.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

function setDocumentFolder({ document_id, project_id, folder_id }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT INTO document_folders (document_id, project_id, folder_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      folder_id = excluded.folder_id,
      project_id = excluded.project_id
  `).run(document_id, project_id, folder_id, now);
}

function clearDocumentFolder(document_id) {
  const d = openDatabase();
  d.prepare('DELETE FROM document_folders WHERE document_id = ?').run(document_id);
}

function getDocumentFoldersByProject(projectId) {
  const d = openDatabase();
  const rows = d.prepare('SELECT document_id, folder_id FROM document_folders WHERE project_id = ?').all(projectId);
  const map = {};
  for (const row of rows) {
    map[row.document_id] = row.folder_id;
  }
  return map;
}

// --- Document Status ---

function setDocumentProcessed(documentId, projectId) {
  const d = openDatabase();
  const now = new Date().toISOString();
  // First-time-only: preserve the original processed_at across repeated calls
  // (the /health poll re-emits 'indexed' docs every tick). Callers that need
  // to record a re-indexing should deleteDocumentStatus first.
  d.prepare(`
    INSERT INTO document_status (document_id, project_id, processed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(document_id) DO NOTHING
  `).run(documentId, projectId, now);
  // Read back the stored value so callers can use it (preserved original on
  // conflict, freshly inserted `now` otherwise). Prevents in-memory state
  // from drifting to `now` when DB still holds the original timestamp.
  const row = d.prepare('SELECT processed_at FROM document_status WHERE document_id = ?').get(documentId);
  return row?.processed_at ?? now;
}

function getDocumentStatusByProject(projectId) {
  const d = openDatabase();
  const rows = d.prepare('SELECT document_id, processed_at FROM document_status WHERE project_id = ?').all(projectId);
  const map = {};
  for (const row of rows) {
    map[row.document_id] = row.processed_at;
  }
  return map;
}

function deleteDocumentStatus(documentId) {
  const d = openDatabase();
  d.prepare('DELETE FROM document_status WHERE document_id = ?').run(documentId);
}

function deleteDocumentStatusByProject(projectId) {
  const d = openDatabase();
  d.prepare('DELETE FROM document_status WHERE project_id = ?').run(projectId);
}

// --- Documents (local SQLite source of truth) ---

function addDocument({ id, project_id, filename, status = 'pending' }) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare(`
    INSERT OR REPLACE INTO documents (id, project_id, filename, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, project_id, filename, status, now, now);
}

function getDocumentsByProject(projectId) {
  const d = openDatabase();
  return d.prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
}

function updateDocumentStatus(id, status) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
}

function updateDocumentId(oldId, newId, status) {
  const d = openDatabase();
  const now = new Date().toISOString();
  d.prepare('UPDATE documents SET id = ?, status = ?, updated_at = ? WHERE id = ?').run(newId, status, now, oldId);
}

function deleteDocument(id) {
  const d = openDatabase();
  d.prepare('DELETE FROM documents WHERE id = ?').run(id);
}

function deleteDocumentsByProject(projectId) {
  const d = openDatabase();
  d.prepare('DELETE FROM documents WHERE project_id = ?').run(projectId);
}

function deleteFoldersByProject(projectId) {
  const d = openDatabase();
  d.prepare('DELETE FROM folders WHERE project_id = ?').run(projectId);
}

function formatFolder(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    document_count: row.document_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
  deleteConversationsByProject,
  selectConversation,
  clearSelectedConversation,
  getSelectedConversation,
  // Messages
  addMessage,
  addMessages,
  getMessages,
  deleteMessages,
  // Memory usage
  addMemoryUsage,
  getMemoryUsage,
  // TPS history
  addTpsEntry,
  getTpsHistory,
  // Install status
  setInstallStepComplete,
  getInstallStatus,
  isFullyInstalled,
  resetInstallStatus,
  // Settings
  getSetting,
  setSetting,
  getAllSettings,
  // MCP Servers
  addMcpServer,
  getMcpServer,
  getMcpServersByProject,
  deleteMcpServer,
  deleteMcpServersByProject,
  // Folders
  createFolder,
  getFolder,
  listFoldersByProject,
  renameFolder,
  deleteFolder,
  setDocumentFolder,
  clearDocumentFolder,
  getDocumentFoldersByProject,
  // Document Status
  setDocumentProcessed,
  getDocumentStatusByProject,
  deleteDocumentStatus,
  deleteDocumentStatusByProject,
  deleteFoldersByProject,
  // Documents (local source of truth)
  addDocument,
  getDocumentsByProject,
  updateDocumentStatus,
  updateDocumentId,
  deleteDocument,
  deleteDocumentsByProject,
};
