const PERSIST_TO_PREFIX = "--persist-to=";
import { getSiteTarget, parseSiteArgument, getSiteLocalEnvironment } from "./site-target.mjs";
import { resolveLocalD1PersistState } from "./local-dev-config.mjs";
import { resolve } from "node:path";

export const resolveLocalD1Options = (args, environment = process.env) => {
  const siteId = parseSiteArgument(args);
  const persistTo = parsePersistToOption(args) ?? resolveLocalD1PersistState(getSiteLocalEnvironment(siteId, environment), siteId).path;
  const otherSite = siteId === "otw" ? "luvdia" : "otw";
  const otherPersistTo = resolveLocalD1PersistState(getSiteLocalEnvironment(otherSite, environment), otherSite).path;
  if (resolve(persistTo) === resolve(otherPersistTo)) throw new Error("Local sites must use different persistence paths.");
  return { ...getSiteTarget(siteId), persistTo };
};

export const parsePersistToOption = (args) => {
  const persistOptions = args.filter(
    (arg) => arg === "--persist-to" || arg.startsWith(PERSIST_TO_PREFIX),
  );

  if (persistOptions.length === 0) return null;
  if (persistOptions.length > 1) {
    throw new Error("--persist-to may only be specified once");
  }

  const [option] = persistOptions;
  if (option === "--persist-to") {
    throw new Error("use --persist-to=<dir>");
  }

  const persistTo = option.slice(PERSIST_TO_PREFIX.length);
  if (persistTo.trim().length === 0) {
    throw new Error("--persist-to requires a non-empty directory");
  }

  return persistTo;
};

export const buildD1LocationArgs = (scope, persistTo = null) => {
  if (scope === "remote") return ["--remote"];
  if (scope !== "local") {
    throw new Error(`Unsupported D1 scope: ${scope}`);
  }

  return persistTo === null
    ? ["--local"]
    : ["--local", "--persist-to", persistTo];
};
