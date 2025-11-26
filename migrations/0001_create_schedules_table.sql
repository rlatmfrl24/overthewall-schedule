-- Create schedules table
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_uid INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    start_time TEXT, -- HH:mm, nullable
    title TEXT,
    status TEXT NOT NULL CHECK (status IN ('방송', '휴방', '게릴라')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index for date queries
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
