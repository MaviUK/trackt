export async function handler(event) {
  try {
    const query = event.queryStringParameters?.q?.trim() || "";
    const genre = event.queryStringParameters?.genre?.trim() || "";
    const network = event.queryStringParameters?.network?.trim() || "";

    if (!query && !genre && !network) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing search query",
        }),
      };
    }

    const loginRes = await fetch("https://api4.thetvdb.com/v4/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apikey: process.env.TVDB_API_KEY,
        pin: process.env.TVDB_PIN,
      }),
    });

    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB login failed",
          details: loginData,
        }),
      };
    }

    const token = loginData?.data?.token;

    if (!token) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB token missing after login",
        }),
      };
    }

    const searchTerm = query || genre || network;

    const searchRes = await fetch(
      `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(
        searchTerm
      )}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB search failed",
          details: searchData,
        }),
      };
    }

    const allResults = Array.isArray(searchData?.data) ? searchData.data : [];

    let tvShowsOnly = allResults
      .filter((item) => {
        const type = String(item?.type || "").toLowerCase();
        return type === "series";
      })
      .map((item) => {
        const rawGenres = Array.isArray(item?.genres)
          ? item.genres
          : Array.isArray(item?.genre)
          ? item.genre
          : [];

        const normalizedGenres = rawGenres
          .map((g) => {
            if (typeof g === "string") return g;
            if (typeof g === "object" && g !== null) {
              return g.name || g.genre || "";
            }
            return "";
          })
          .filter(Boolean);

        const normalizedNetwork =
          item?.network ||
          item?.originalNetwork ||
          item?.latestNetwork ||
          item?.companies?.studio ||
          null;

        return {
          tvdb_id: Number(item?.tvdb_id || item?.id) || null,
          name: item?.name || item?.seriesName || "Unknown title",
          overview: item?.overview || "",
          status:
            typeof item?.status === "object"
              ? item?.status?.name || null
              : item?.status || null,
          first_aired: item?.first_air_time || item?.firstAired || null,
          first_air_time: item?.first_air_time || item?.firstAired || null,
          image_url: item?.image_url || item?.image || null,
          slug: item?.slug || null,
          network: normalizedNetwork,
          genres: normalizedGenres,
        };
      })
      .filter((item) => item.tvdb_id);

    if (genre) {
      const genreLower = genre.toLowerCase();

      tvShowsOnly = tvShowsOnly.filter((item) =>
        (item.genres || []).some((g) => String(g).toLowerCase() === genreLower)
      );
    }

    if (network) {
      const networkLower = network.toLowerCase();

      tvShowsOnly = tvShowsOnly.filter((item) =>
        String(item.network || "")
          .toLowerCase()
          .includes(networkLower)
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify(tvShowsOnly),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Function crashed",
        details: error.message,
      }),
    };
  }
}
