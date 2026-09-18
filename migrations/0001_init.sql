-- Shared course layouts. Anyone can read; edits are last-write-wins per hole with history kept.
CREATE TABLE IF NOT EXISTS courses (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  hole_count INTEGER NOT NULL,
  par INTEGER,
  city TEXT,
  region TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS courses_lat_lon ON courses (lat, lon);

CREATE TABLE IF NOT EXISTS holes (
  course_key TEXT NOT NULL,
  number INTEGER NOT NULL,
  par INTEGER NOT NULL,
  distance_m INTEGER,
  tee_lat REAL,
  tee_lon REAL,
  basket_lat REAL,
  basket_lon REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (course_key, number)
);

CREATE TABLE IF NOT EXISTS hole_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_key TEXT NOT NULL,
  number INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hole_history_course ON hole_history (course_key, updated_at);
