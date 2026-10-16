export const matchesSiteViteProcess = (commandLine, root, port) => {
  const normalized = commandLine.replaceAll("\\", "/").toLowerCase();
  const executable = `${root.replaceAll("\\", "/").toLowerCase()}/node_modules/vite/bin/vite.js`;
  return normalized.includes(executable) && new RegExp(`(?:^|\\s)--port(?:=|\\s+)${port}(?:\\s|$)`).test(normalized);
};
