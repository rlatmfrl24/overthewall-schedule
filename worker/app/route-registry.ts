import type { Env } from "../platform/types";

export type WorkerHttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE";

export type WorkerRouteAuth =
  | "public"
  | "public-write"
  | "optional"
  | "member-policy"
  | "admin";

export interface WorkerRouteMethodContract {
  method: WorkerHttpMethod;
  auth: WorkerRouteAuth;
  cache: string;
  successStatus: number;
}

export type WorkerRouteHandler = (
  request: Request,
  env: Env,
) => Response | Promise<Response>;

export interface WorkerRouteDefinition {
  id: string;
  owner: string;
  path: string;
  methods: readonly WorkerRouteMethodContract[];
  handler: WorkerRouteHandler;
  numericParams?: readonly string[];
}

export type WorkerRouteManifestEntry = Omit<
  WorkerRouteDefinition,
  "handler"
>;

interface CompiledRoute {
  definition: WorkerRouteDefinition;
  matcher: RegExp;
  paramNames: string[];
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compilePath = (path: string) => {
  const paramNames: string[] = [];
  const segments = path.split("/").map((segment, index) => {
    if (!segment || index === 0) return "";
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));
      return "([^/]+)";
    }
    if (segment.startsWith("*")) {
      paramNames.push(segment.slice(1));
      return "(.*)";
    }
    return escapeRegExp(segment);
  });
  return {
    matcher: new RegExp(`^${segments.join("/")}$`),
    paramNames,
  };
};

const isPositiveSafeInteger = (value: string) => {
  if (!/^[1-9]\d*$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
};

const methodNotAllowed = (methods: readonly WorkerRouteMethodContract[]) =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: methods.map(({ method }) => method).join(", "),
    },
  });

const invalidNumericParam = (name: string) =>
  new Response(`Invalid ${name}`, { status: 400 });

export const createRouteRegistry = (
  definitions: readonly WorkerRouteDefinition[],
) => {
  const ids = new Set<string>();
  const signatureSet = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate route id: ${definition.id}`);
    }
    ids.add(definition.id);
    for (const { method } of definition.methods) {
      const signature = `${method} ${definition.path}`;
      if (signatureSet.has(signature)) {
        throw new Error(`Duplicate route contract: ${signature}`);
      }
      signatureSet.add(signature);
    }
  }

  const compiled: CompiledRoute[] = definitions.map((definition) => ({
    definition,
    ...compilePath(definition.path),
  }));

  const manifest: readonly WorkerRouteManifestEntry[] = definitions.map(
    (definition) => ({
      id: definition.id,
      owner: definition.owner,
      path: definition.path,
      methods: definition.methods,
      ...(definition.numericParams
        ? { numericParams: definition.numericParams }
        : {}),
    }),
  );

  return {
    manifest,
    async dispatch(request: Request, env: Env): Promise<Response | null> {
      const { pathname } = new URL(request.url);
      const pathMatches = compiled.flatMap((route) => {
        const match = pathname.match(route.matcher);
        return match ? [{ route, match }] : [];
      });

      if (pathMatches.length === 0) {
        return pathname === "/api" || pathname.startsWith("/api/")
          ? new Response("Not Found", { status: 404 })
          : null;
      }

      const methodMatch = pathMatches.find(({ route }) =>
        route.definition.methods.some(
          ({ method }) => method === request.method,
        ),
      );
      if (!methodMatch) {
        const allowed = Array.from(
          new Map(
            pathMatches
              .flatMap(({ route }) => route.definition.methods)
              .map((contract) => [contract.method, contract]),
          ).values(),
        );
        return methodNotAllowed(allowed);
      }

      const methodContract = methodMatch.route.definition.methods.find(
        ({ method }) => method === request.method,
      )!;
      const numericParams = new Set(
        methodMatch.route.definition.numericParams ?? [],
      );
      for (let index = 0; index < methodMatch.route.paramNames.length; index++) {
        const paramName = methodMatch.route.paramNames[index]!;
        if (!numericParams.has(paramName)) continue;
        const value = methodMatch.match[index + 1] ?? "";
        if (!isPositiveSafeInteger(value)) {
          return invalidNumericParam(paramName);
        }
      }

      const response = await methodMatch.route.definition.handler(request, env);
      if (
        methodContract.cache === "no-store" &&
        !response.headers.has("Cache-Control")
      ) {
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    },
  };
};
