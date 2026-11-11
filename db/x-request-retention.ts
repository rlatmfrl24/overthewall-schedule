// Quote receipts outlive their 30-day local recovery records, including partial UTC days.
export const xRequestExpiryDaySql = "julianday(day) + CASE WHEN id GLOB 'otw:quote:*' OR id GLOB 'luvdia:quote:*' THEN 31 ELSE 2 END";
