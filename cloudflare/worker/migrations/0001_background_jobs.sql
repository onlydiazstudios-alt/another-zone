CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  source_language TEXT NOT NULL,
  transcription_provider TEXT NOT NULL,
  translation_provider TEXT NOT NULL,
  target_language TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_owner_created ON jobs(owner_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS job_files (
  job_id TEXT NOT NULL,
  file_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  duration REAL NOT NULL,
  chunk_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  output_key TEXT,
  error TEXT,
  PRIMARY KEY(job_id, file_index),
  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS job_chunks (
  job_id TEXT NOT NULL,
  file_index INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 30,
  status TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  PRIMARY KEY(job_id, file_index, chunk_index),
  FOREIGN KEY(job_id, file_index) REFERENCES job_files(job_id, file_index) ON DELETE CASCADE
);
