export async function handler(event) {
  try {
    const tvdbId = event.queryStringParameters?.tvdb_id;

    if (!tvdbId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing tvdb_id",
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

    const allEpisodes = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const episodesRes = await fetch(
        `https://api4.thetvdb.com/v4/series/${tvdbId}/episodes/default?page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const episodesData = await episodesRes.json();

      if (!episodesRes.ok) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: "TVDB episodes failed",
            details: episodesData,
          }),
        };
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

      const next = episodesData?.links?.next;

      if (next === null || next === undefined) {
        hasMore = false;
      } else {
        page = next;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(allEpisodes),
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
