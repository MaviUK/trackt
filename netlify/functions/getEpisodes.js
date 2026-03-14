export async function handler(event) {
  try {
    const id = event.queryStringParameters?.tvdb_id;

    if (!id) {
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

    let allEpisodes = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const episodesRes = await fetch(
        `https://api4.thetvdb.com/v4/series/${id}/episodes/default?page=${page}`,
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

      const pageEpisodes = episodesData?.data?.episodes || [];
      allEpisodes = allEpisodes.concat(pageEpisodes);

      const links = episodesData?.links || {};
      const next = links.next;

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
