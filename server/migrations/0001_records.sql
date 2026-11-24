-- 기록 원본. 삭제는 행을 지우지 않고 deleted_at을 채운다.
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  seq INTEGER NOT NULL
);

CREATE INDEX records_seq ON records (seq);

CREATE TABLE record_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  replaced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX record_history_lookup ON record_history (id, replaced_at);

CREATE TRIGGER records_keep_history BEFORE UPDATE ON records
BEGIN
  INSERT INTO record_history (id, data, updated_at, deleted_at)
  VALUES (old.id, old.data, old.updated_at, old.deleted_at);
END;

-- 기기가 다른 DB에 잘못 붙었는지 알아보는 값.
CREATE TABLE server_info (id TEXT NOT NULL);
INSERT INTO server_info (id) VALUES (lower(hex(randomblob(16))));
