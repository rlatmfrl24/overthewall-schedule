import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const projectRoot = process.cwd();
const snapshotDate = "2026-05-29";
const evidenceDir = path.resolve(
  projectRoot,
  ".superloopy/evidence/frontend/20260630-154900-snapshot-header-live-removal",
);

function member(uid, code, name, mainColor, subColor, unitName) {
  return {
    uid,
    code,
    name,
    main_color: mainColor,
    sub_color: subColor,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: `channel-${uid}`,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: unitName,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  };
}

function schedule(id, memberUid, startTime, status, title) {
  return {
    id,
    member_uid: memberUid,
    date: snapshotDate,
    start_time: startTime,
    status,
    title,
    created_at: "2026-05-29T00:00:00.000Z",
  };
}

const scheduleBoardResponse = {
  startDate: snapshotDate,
  endDate: snapshotDate,
  updatedAt: "2026-05-29T12:00:00.000Z",
  members: [
    member(1, "hane", "하네", "#14b8a6", "#ccfbf1", "오버더월"),
    member(2, "u_lili", "유리리", "#f43f5e", "#ffe4e6", "리브다이아"),
    member(3, "bing_hayu", "빙하유", "#60a5fa", "#dbeafe", "리브다이아"),
    member(4, "on_haru", "온하루", "#f59e0b", "#fef3c7", null),
    member(5, "yang_mei", "양메이", "#a855f7", "#f3e8ff", null),
    member(6, "kurenai_natsuki", "쿠레나이 나츠키", "#ef4444", "#fee2e2", null),
  ],
  ddays: [],
  notices: [],
  schedules: [
    schedule(101, 1, "20:00", "방송", "정규 컨텐츠"),
    schedule(102, 2, "21:30", "방송", "노래 연습실"),
    schedule(103, 3, null, "휴방", "휴방"),
    schedule(104, 4, null, "게릴라", "게릴라 예정"),
    schedule(105, 5, null, "미정", "시간 미정"),
  ],
};

function visualApiFixturePlugin() {
  return {
    name: "otw-snapshot-visual-api-fixture",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");

        if (req.url.startsWith("/api/schedule-board")) {
          res.end(JSON.stringify(scheduleBoardResponse));
          return;
        }

        if (req.url.startsWith("/api/live-status")) {
          import("node:fs").then(({ appendFileSync }) => {
            appendFileSync(
              path.join(evidenceDir, "live-status-requests.log"),
              `${req.url}\n`,
            );
          });
          res.end("{}");
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: projectRoot,
  plugins: [visualApiFixturePlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
    },
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
});
