function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const data = await res.json();
    return { res, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeNextPage(nextValue, fallbackPage) {
  if (nextValue == null) return null;

  if (typeof nextValue === "number" && Number.isFinite(nextValue)) {
    return nextValue;
  }

  if (typeof nextValue === "string") {
    const trimmed = nextValue.trim();

    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }

    try {
      const url = new URL(trimmed);
      const pageParam = url.searchParams.get("page");
      if (pageParam && /^\d+$/.test(pageParam)) {
        return Number(pageParam);
      }
    } catch {
      // ignore non-URL strings
    }
  }

  return fallbackPage + 1;
}

function dedupeEpisodes(episodes) {
  const seen = new Map();

  for (const ep of episodes) {
    const seasonNumber = Number(ep?.seasonNumber ?? -1);
    const episodeNumber = Number(ep?.number ?? -1);
    const id = ep?.id ?? null;

    const key =
      id != null
        ? `id:${id}`
        : `season:${seasonNumber}|episode:${episodeNumber}`;

    if (!seen.has(key)) {
      seen.set(key, ep);
    }
  }

  return [...seen.values()].sort((a, b) => {
    const seasonDiff =
      Number(a?.seasonNumber ?? 0) - Number(b?.seasonNumber ?? 0);
    if (seasonDiff !== 0) return seasonDiff;

    return Number(a?.number ?? 0) - Number(b?.number ?? 0);
  });
}

export async function handler(event) {
  try {
    const tvdbId = event.queryStringParameters?.tvdb_id;

    if (!tvdbId) {
      return jsonResponse(400, {
        message: "Missing tvdb_id",
      });
    }

    if (!process.env.TVDB_API_KEY) {
      return jsonResponse(500, {
        message: "Missing TVDB_API_KEY environment variable",
      });
    }

    const { res: loginRes, data: loginData } = await fetchJsonWithTimeout(
      "https://api4.thetvdb.com/v4/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apikey: process.env.TVDB_API_KEY,
          pin: process.env.TVDB_PIN,
        }),
      },
      12000
    );

    if (!loginRes.ok) {
      return jsonResponse(500, {
        message: "TVDB login failed",
        details: loginData,
      });
    }

    const token = loginData?.data?.token;

    if (!token) {
      return jsonResponse(500, {
        message: "TVDB token missing after login",
      });
    }

    const allEpisodes = [];
    const MAX_PAGES = 100;
    let page = 0;
    let pagesFetched = 0;
    let truncated = false;

    while (page != null && pagesFetched < MAX_PAGES) {
      let episodesRes;
      let episodesData;

      try {
        const result = await fetchJsonWithTimeout(
          `https://api4.thetvdb.com/v4/series/${encodeURIComponent(
            tvdbId
          )}/episodes/default?page=${page}&language=en`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
          12000
        );

        episodesRes = result.res;
        episodesData = result.data;
      } catch (error) {
        if (allEpisodes.length > 0) {
          truncated = true;
          break;
        }

        return jsonResponse(500, {
          message: "TVDB episodes request failed",
          details: error.message,
        });
      }

      if (!episodesRes.ok) {
        if (allEpisodes.length > 0) {
          truncated = true;
          break;
        }

        return jsonResponse(500, {
          message: "TVDB episodes failed",
          details: episodesData,
        });
      }

      const pageEpisodes = Array.isArray(episodesData?.data?.episodes)
        ? episodesData.data.episodes
        : [];

      allEpisodes.push(
        ...pageEpisodes.map((ep) => ({
          id: ep?.id ?? null,
          name: ep?.name ?? null,
          overview: ep?.overview ?? null,
          seasonNumber: ep?.seasonNumber ?? null,
          number: ep?.number ?? null,
          absoluteNumber: ep?.absoluteNumber ?? null,
          aired: ep?.aired ?? null,
          runtime: ep?.runtime ?? null,
          image: ep?.image ?? null,
          isPremiere: ep?.isPremiere ?? false,
          isFinale: ep?.isFinale ?? false,
        }))
      );

      pagesFetched += 1;

      const nextPage = normalizeNextPage(episodesData?.links?.next, page);

      if (nextPage == null || nextPage === page) {
        break;
      }

      page = nextPage;
    }

    if (pagesFetched >= MAX_PAGES) {
      truncated = true;
    }

    const dedupedEpisodes = dedupeEpisodes(allEpisodes);

    return jsonResponse(200, {
      episodes: dedupedEpisodes,
      meta: {
        tvdb_id: Number(tvdbId),
        count: dedupedEpisodes.length,
        pagesFetched,
        truncated,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      message: "Function crashed",
      details: error.message,
    });
  }
}
