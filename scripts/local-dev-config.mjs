export const LOCAL_DEV_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_DEV_PORT = 5173;

const SPA_DEV_ROUTE =
  /^\/(?:weekly|notice|vods(?:\/.*)?|play(?:\/.*)?|multiview|feed|snapshot|cafe|profile\/[^/]+|admin(?:\/.*)?)\/?$/;

const MIN_LOCAL_DEV_PORT = 1024;
const MAX_LOCAL_DEV_PORT = 65535;

export const parseLocalDevPort = (value, source = "port") => {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `Invalid ${source} "${normalized}": expected an integer between ${MIN_LOCAL_DEV_PORT} and ${MAX_LOCAL_DEV_PORT}.`,
    );
  }

  const port = Number(normalized);
  if (port < MIN_LOCAL_DEV_PORT || port > MAX_LOCAL_DEV_PORT) {
    throw new Error(
      `Invalid ${source} "${normalized}": expected an integer between ${MIN_LOCAL_DEV_PORT} and ${MAX_LOCAL_DEV_PORT}.`,
    );
  }
  return port;
};

export const resolveLocalDevPort = (environment = process.env) => {
  const configuredPort = environment.OTW_DEV_PORT?.trim();
  return configuredPort
    ? parseLocalDevPort(configuredPort, "OTW_DEV_PORT")
    : DEFAULT_LOCAL_DEV_PORT;
};

export const getLocalDevServerConfig = (environment = process.env) => ({
  host: LOCAL_DEV_HOST,
  port: resolveLocalDevPort(environment),
  strictPort: true,
});

export const getLocalDevOrigin = (environment = process.env) =>
  `http://${LOCAL_DEV_HOST}:${resolveLocalDevPort(environment)}`;

export const resolveLocalD1PersistState = (environment = process.env) => {
  const configuredPath = environment.OTW_D1_PERSIST_TO?.trim();
  return configuredPath ? { path: configuredPath } : true;
};

export const rewriteLocalSpaRequest = (request) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (
    request.method !== "GET" ||
    !request.headers.accept?.includes("text/html") ||
    !SPA_DEV_ROUTE.test(url.pathname)
  ) {
    return false;
  }

  const rewrittenUrl = `/${url.search}`;
  request.url = rewrittenUrl;
  request.originalUrl = rewrittenUrl;
  return true;
};
