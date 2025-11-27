-- Migration to update schedules table constraint to include '미정'

-- 1. Create new table with updated constraint
CREATE TABLE new_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_uid INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    start_time TEXT, -- HH:mm, nullable
    title TEXT,
    status TEXT NOT NULL CHECK (status IN ('방송', '휴방', '게릴라', '미정')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Copy data from old table to new table
INSERT INTO new_schedules (id, member_uid, date, start_time, title, status, created_at)
SELECT id, member_uid, date, start_time, title, status, created_at FROM schedules;

-- 3. Drop old table
DROP TABLE schedules;

-- 4. Rename new table to schedules
ALTER TABLE new_schedules RENAME TO schedules;

-- 5. Recreate index
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
