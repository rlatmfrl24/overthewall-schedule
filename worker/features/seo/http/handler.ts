import {
  buildFeedSiteSeo,
  buildNotFoundSiteSeo,
  buildPlayPrivateSiteSeo,
  type SiteSeoMetadata,
} from "@contracts/site-seo";
import type { Env } from "../../../platform/types";
import type { SiteSeoService } from "../application/site-seo-service";

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=300",
} as const;

const REDIRECT_CACHE = "public, max-age=3600";
const PLAY_INDEX_CACHE = "public, max-age=60, s-maxage=60";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const renderSitemapXml = (urls: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n")}\n</urlset>`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const rewriteHtml = (
  response: Response,
  metadata: SiteSeoMetadata,
  status = 200,
): Response => {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  const source = new Response(response.body, { status, headers });
  let rewriter = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(metadata.title);
      },
    })
    .on('[data-site-seo="description"]', {
      element(element) {
        element.setAttribute("content", metadata.description);
      },
    })
    .on('[data-site-seo="robots"]', {
      element(element) {
        element.setAttribute("content", metadata.robots);
      },
    })
    .on('[data-site-seo="canonical"]', {
      element(element) {
        element.setAttribute("href", metadata.canonical);
      },
    })
    .on('[data-site-seo="og:title"]', {
      element(element) {
        element.setAttribute("content", metadata.title);
      },
    })
    .on('[data-site-seo="og:description"]', {
      element(element) {
        element.setAttribute("content", metadata.description);
      },
    })
    .on('[data-site-seo="og:url"]', {
      element(element) {
        element.setAttribute("content", metadata.canonical);
      },
    })
    .on('[data-site-seo="og:type"]', {
      element(element) {
        element.setAttribute("content", metadata.ogType);
      },
    });
  if (metadata.image) {
    rewriter = rewriter.on("head", {
      element(element) {
        const image = escapeHtml(metadata.image ?? "");
        element.append(
          `<meta data-site-seo="og:image" property="og:image" content="${image}"><meta data-site-seo="twitter:image" name="twitter:image" content="${image}">`,
          { html: true },
        );
      },
    });
  }
  return rewriter.transform(source);
};

const assetRequest = (request: Request, pathname: string): Request => {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return new Request(url, { method: "GET", headers: request.headers });
};

const toHeadResponse = (request: Request, response: Response): Response =>
  request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;

const methodNotAllowed = () =>
  new Response(null, {
    status: 405,
    headers: {
      Allow: "GET, HEAD",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex,nofollow",
    },
  });

const unavailable = (request: Request) =>
  toHeadResponse(
    request,
    new Response("일시적으로 페이지를 불러올 수 없습니다.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "300",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex,nofollow",
      },
    }),
  );

type PlayRoute =
  | { kind: "home"; canonicalPath: "/play"; trailing: boolean }
  | { kind: "songs"; canonicalPath: "/play/songs"; trailing: boolean }
  | { kind: "song"; canonicalPath: string; trailing: boolean; rawSlug: string }
  | {
      kind: "private";
      canonicalPath: "/play/submit" | "/play/submissions";
      trailing: boolean;
    }
  | { kind: "discover"; canonicalPath: "/play"; trailing: boolean }
  | { kind: "not-found"; canonicalPath: string; trailing: boolean };

const classifyPlayRoute = (pathname: string): PlayRoute | null => {
  if (pathname !== "/play" && !pathname.startsWith("/play/")) return null;
  const canonicalPath = pathname.replace(/\/+$/, "") || "/";
  const trailing = canonicalPath !== pathname;
  if (canonicalPath === "/play") {
    return { kind: "home", canonicalPath: "/play", trailing };
  }
  if (canonicalPath === "/play/songs") {
    return { kind: "songs", canonicalPath: "/play/songs", trailing };
  }
  if (canonicalPath === "/play/submit" || canonicalPath === "/play/submissions") {
    return { kind: "private", canonicalPath, trailing };
  }
  if (canonicalPath === "/play/discover") {
    return { kind: "discover", canonicalPath: "/play", trailing };
  }
  const songMatch = canonicalPath.match(/^\/play\/songs\/([^/]+)$/);
  if (songMatch) {
    return {
      kind: "song",
      canonicalPath,
      trailing,
      rawSlug: songMatch[1] ?? "",
    };
  }
  return { kind: "not-found", canonicalPath, trailing };
};

const isValidPlaySongSlug = (slug: string): boolean => {
  const length = Array.from(slug).length;
  return (
    length > 0 &&
    length <= 128 &&
    slug === slug.trim() &&
    slug !== "." &&
    slug !== ".." &&
    !/[\p{Cc}\p{Cs}\\/?#%]/u.test(slug)
  );
};

const redirect = (url: URL, pathname: string, preserveSearch: boolean) => {
  const location = new URL(url);
  location.pathname = pathname;
  if (!preserveSearch) location.search = "";
  location.hash = "";
  return new Response(null, {
    status: 301,
    headers: { Location: location.toString(), "Cache-Control": REDIRECT_CACHE },
  });
};

const rewritePlayHtml = (
  asset: Response,
  metadata: SiteSeoMetadata,
  status = 200,
): Response => {
  const response = rewriteHtml(asset, metadata, status);
  if (status === 200 && metadata.robots === "index,follow") {
    response.headers.set("Cache-Control", PLAY_INDEX_CACHE);
  } else {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", metadata.robots);
  }
  return response;
};

export const createSiteSeoHandler = (
  getService: (env: Env) => SiteSeoService,
) => async (request: Request, env: Env): Promise<Response | null> => {
  const url = new URL(request.url);
  const profileMatch = url.pathname.match(/^\/profile\/([^/]+)\/?$/);
  const playRoute = classifyPlayRoute(url.pathname);
  const recognized =
    url.pathname === "/feed" ||
    url.pathname === "/feed/" ||
    url.pathname === "/sitemap.xml" ||
    playRoute !== null ||
    profileMatch !== null;
  if (!recognized) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed();
  }

  if (playRoute?.kind === "discover") {
    return redirect(url, "/play", true);
  }
  if (playRoute?.trailing && playRoute.kind !== "not-found") {
    return redirect(url, playRoute.canonicalPath, true);
  }
  if (url.pathname === "/feed/" || (profileMatch && url.pathname.endsWith("/"))) {
    return redirect(url, url.pathname.replace(/\/+$/, ""), false);
  }

  const service = getService(env);
  if (!env.ASSETS && url.pathname !== "/sitemap.xml") {
    console.error("[seo] ASSETS binding is unavailable");
    return unavailable(request);
  }
  if (url.pathname === "/sitemap.xml") {
    try {
      const body = renderSitemapXml(await service.buildSitemapUrls());
      return toHeadResponse(request, new Response(body, { headers: XML_HEADERS }));
    } catch (error) {
      console.error("[seo] failed to build sitemap", error);
      return unavailable(request);
    }
  }

  if (url.pathname === "/feed") {
    let metadata = buildFeedSiteSeo(false);
    try {
      metadata = (await service.readFeed()).metadata;
    } catch (error) {
      console.error("[seo] failed to read feed visibility", error);
    }
    const asset = await env.ASSETS!.fetch(assetRequest(request, "/"));
    const response = rewriteHtml(asset, metadata);
    response.headers.set("Cache-Control", "no-store");
    if (metadata.robots !== "index,follow") {
      response.headers.set("X-Robots-Tag", metadata.robots);
    }
    return toHeadResponse(request, response);
  }

  if (playRoute) {
    try {
      if (playRoute.kind === "not-found") {
        const asset = await env.ASSETS!.fetch(assetRequest(request, "/404.html"));
        return toHeadResponse(
          request,
          rewritePlayHtml(asset, buildNotFoundSiteSeo(url.pathname), 404),
        );
      }
      if (playRoute.kind === "private") {
        const asset = await env.ASSETS!.fetch(assetRequest(request, "/"));
        return toHeadResponse(
          request,
          rewritePlayHtml(asset, buildPlayPrivateSiteSeo(playRoute.canonicalPath)),
        );
      }

      let metadata: SiteSeoMetadata | null;
      if (playRoute.kind === "home") {
        metadata = await service.readPlayHome();
      } else if (playRoute.kind === "songs") {
        metadata = await service.readPlaySongs();
      } else {
        let slug = "";
        try {
          slug = decodeURIComponent(playRoute.rawSlug);
        } catch {
          // Malformed percent encoding is a route-level 404.
        }
        if (!isValidPlaySongSlug(slug)) {
          const asset = await env.ASSETS!.fetch(assetRequest(request, "/404.html"));
          return toHeadResponse(
            request,
            rewritePlayHtml(asset, buildNotFoundSiteSeo(url.pathname), 404),
          );
        }
        metadata = await service.findPlaySong(slug);
      }

      if (!metadata) {
        const asset = await env.ASSETS!.fetch(assetRequest(request, "/404.html"));
        return toHeadResponse(
          request,
          rewritePlayHtml(asset, buildNotFoundSiteSeo(url.pathname), 404),
        );
      }
      const asset = await env.ASSETS!.fetch(assetRequest(request, "/"));
      return toHeadResponse(request, rewritePlayHtml(asset, metadata));
    } catch (error) {
      console.error("[seo] failed to render OTW Play", {
        path: url.pathname,
        error,
      });
      return unavailable(request);
    }
  }

  let code: string;
  try {
    code = decodeURIComponent(profileMatch?.[1] ?? "");
  } catch {
    code = "";
  }
  try {
    const member = code ? await service.findProfile(code) : null;
    if (!member) {
      const asset = await env.ASSETS!.fetch(assetRequest(request, "/404.html"));
      const response = rewriteHtml(asset, buildNotFoundSiteSeo(url.pathname), 404);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Robots-Tag", "noindex,nofollow");
      return toHeadResponse(request, response);
    }
    const metadata = service.buildProfileMetadata(member);
    if (member.code !== code) {
      return new Response(null, {
        status: 301,
        headers: { Location: metadata.canonical, "Cache-Control": REDIRECT_CACHE },
      });
    }
    const asset = await env.ASSETS!.fetch(assetRequest(request, "/"));
    const response = rewriteHtml(asset, metadata);
    response.headers.set("Cache-Control", "public, max-age=60, s-maxage=300");
    return toHeadResponse(request, response);
  } catch (error) {
    console.error("[seo] failed to render profile", { code, error });
    return unavailable(request);
  }
};
