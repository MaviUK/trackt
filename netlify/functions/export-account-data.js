const PAGE_SIZE = 1000;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function isMissingRelationError(data) {
  const code = String(data?.code || "").toUpperCase();
  const message = String(data?.message || "").toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

async function getAuthenticatedUser({ supabaseUrl, anonKey, accessToken }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await readJson(response);
  if (!response.ok || !data?.id) {
    throw new Error("Your session could not be verified. Please log in again.");
  }

  return data;
}

async function fetchAllRows({
  supabaseUrl,
  serviceRoleKey,
  table,
  filters = {},
  select = "*",
}) {
  const rows = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({ select });
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });

    const response = await fetch(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?${params.toString()}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
          "Range-Unit": "items",
        },
      }
    );

    const data = await readJson(response);
    if (!response.ok) {
      return {
        rows: [],
        unavailable: true,
        error: isMissingRelationError(data)
          ? "This section is not used by the current database."
          : data?.message || `Could not export ${table}.`,
      };
    }

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { rows, unavailable: false, error: null };
}

function dedupeRows(rows, keyFields = ["id"]) {
  const seen = new Set();

  return (rows || []).filter((row) => {
    const key = keyFields.map((field) => String(row?.[field] ?? "")).join(":");
    const fallback = JSON.stringify(row);
    const resolvedKey = keyFields.some((field) => row?.[field] !== undefined)
      ? key
      : fallback;

    if (seen.has(resolvedKey)) return false;
    seen.add(resolvedKey);
    return true;
  });
}

async function fetchByIds({
  supabaseUrl,
  serviceRoleKey,
  table,
  ids,
  idColumn = "id",
}) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean).map(String)));
  if (!uniqueIds.length) return { rows: [], unavailable: false, error: null };

  const allRows = [];
  let unavailable = false;
  let error = null;

  for (let index = 0; index < uniqueIds.length; index += 100) {
    const batch = uniqueIds.slice(index, index + 100);
    const result = await fetchAllRows({
      supabaseUrl,
      serviceRoleKey,
      table,
      filters: {
        [idColumn]: `in.(${batch.join(",")})`,
      },
    });

    if (result.unavailable) {
      unavailable = true;
      error = result.error;
      break;
    }

    allRows.push(...result.rows);
  }

  return { rows: dedupeRows(allRows), unavailable, error };
}

function safeAuthUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    phone: user.phone || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    confirmed_at: user.confirmed_at || null,
    email_confirmed_at: user.email_confirmed_at || null,
    phone_confirmed_at: user.phone_confirmed_at || null,
    user_metadata: user.user_metadata || {},
    providers: Array.isArray(user.identities)
      ? user.identities.map((identity) => identity?.provider).filter(Boolean)
      : [],
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Account export environment variables are incomplete.");
    return jsonResponse(500, {
      error: "Data export is not configured yet.",
    });
  }

  const authorization = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return jsonResponse(401, { error: "You must be logged in." });

  try {
    const user = await getAuthenticatedUser({
      supabaseUrl,
      anonKey,
      accessToken,
    });
    const userId = user.id;

    const specs = [
      ["profile", "profiles", { id: `eq.${userId}` }],
      ["user_shows_new", "user_shows_new", { user_id: `eq.${userId}` }],
      ["user_shows", "user_shows", { user_id: `eq.${userId}` }],
      ["watched_episodes", "watched_episodes", { user_id: `eq.${userId}` }],
      ["show_ratings", "burgr_ratings", { user_id: `eq.${userId}` }],
      ["episode_ratings", "episode_ratings", { user_id: `eq.${userId}` }],
      ["show_rankings", "user_show_rankings", { user_id: `eq.${userId}` }],
      ["show_reviews", "show_reviews", { user_id: `eq.${userId}` }],
      ["show_review_votes", "show_review_votes", { user_id: `eq.${userId}` }],
      ["episode_reviews", "episode_reviews", { user_id: `eq.${userId}` }],
      ["episode_review_votes", "episode_review_votes", { user_id: `eq.${userId}` }],
      ["chat_messages", "show_chat_messages", { user_id: `eq.${userId}` }],
      ["chat_votes", "show_chat_message_votes", { user_id: `eq.${userId}` }],
      ["creator_posts", "creator_posts", { user_id: `eq.${userId}` }],
      ["creator_post_comments", "creator_post_comments", { user_id: `eq.${userId}` }],
      ["creator_lists", "creator_lists", { user_id: `eq.${userId}` }],
      ["creator_list_comments", "creator_list_comments", { user_id: `eq.${userId}` }],
      ["issue_reports", "issue_reports", { user_id: `eq.${userId}` }],
      ["creator_monetization", "creator_monetization", { user_id: `eq.${userId}` }],
      ["rankd_matchup_votes", "rankd_matchup_votes", { user_id: `eq.${userId}` }],
      ["rankd_votes", "rankd_votes", { user_id: `eq.${userId}` }],
    ];

    const results = await Promise.all(
      specs.map(async ([key, table, filters]) => {
        const result = await fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table,
          filters,
        });
        return { key, table, ...result };
      })
    );

    const sections = {};
    const unavailableSections = [];

    results.forEach((result) => {
      sections[result.key] = result.rows;
      if (result.unavailable) {
        unavailableSections.push({
          section: result.key,
          table: result.table,
          reason: result.error,
        });
      }
    });

    const [followsAsFollower, followsAsFollowing, notificationsReceived, notificationsActed, subscriptionsAsSubscriber, subscriptionsAsCreator] =
      await Promise.all([
        fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table: "user_follows",
          filters: { follower_id: `eq.${userId}` },
        }),
        fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table: "user_follows",
          filters: { following_id: `eq.${userId}` },
        }),
        fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table: "notifications",
          filters: { recipient_user_id: `eq.${userId}` },
        }),
        fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table: "notifications",
          filters: { actor_user_id: `eq.${userId}` },
        }),
        fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table: "creator_subscriptions",
          filters: { subscriber_id: `eq.${userId}` },
        }),
        fetchAllRows({
          supabaseUrl,
          serviceRoleKey,
          table: "creator_subscriptions",
          filters: { creator_id: `eq.${userId}` },
        }),
      ]);

    sections.follows = dedupeRows([
      ...followsAsFollower.rows,
      ...followsAsFollowing.rows,
    ], ["follower_id", "following_id"]);
    sections.notifications = dedupeRows([
      ...notificationsReceived.rows,
      ...notificationsActed.rows,
    ]);
    sections.creator_subscriptions = dedupeRows([
      ...subscriptionsAsSubscriber.rows,
      ...subscriptionsAsCreator.rows,
    ]);

    [
      ["follows", followsAsFollower, "user_follows"],
      ["follows", followsAsFollowing, "user_follows"],
      ["notifications", notificationsReceived, "notifications"],
      ["notifications", notificationsActed, "notifications"],
      ["creator_subscriptions", subscriptionsAsSubscriber, "creator_subscriptions"],
      ["creator_subscriptions", subscriptionsAsCreator, "creator_subscriptions"],
    ].forEach(([section, result, table]) => {
      if (result.unavailable && !unavailableSections.some((item) => item.section === section)) {
        unavailableSections.push({ section, table, reason: result.error });
      }
    });

    const creatorListIds = (sections.creator_lists || []).map((row) => row.id);
    const creatorListItems = await fetchByIds({
      supabaseUrl,
      serviceRoleKey,
      table: "creator_list_items",
      ids: creatorListIds,
      idColumn: "list_id",
    });
    sections.creator_list_items = creatorListItems.rows;
    if (creatorListItems.unavailable) {
      unavailableSections.push({
        section: "creator_list_items",
        table: "creator_list_items",
        reason: creatorListItems.error,
      });
    }

    const showIds = Array.from(
      new Set(
        [
          ...(sections.user_shows_new || []).map((row) => row.show_id),
          ...(sections.user_shows || []).map((row) => row.show_id),
          ...(sections.show_ratings || []).map((row) => row.show_id),
          ...(sections.show_rankings || []).map((row) => row.show_id),
          ...(sections.show_reviews || []).map((row) => row.show_id),
          ...(sections.chat_messages || []).map((row) => row.show_id),
        ].filter(Boolean)
      )
    );

    const episodeIds = Array.from(
      new Set(
        [
          ...(sections.watched_episodes || []).map((row) => row.episode_id),
          ...(sections.episode_ratings || []).map((row) => row.episode_id),
          ...(sections.episode_reviews || []).map((row) => row.episode_id),
        ].filter(Boolean)
      )
    );

    const [showDetails, episodeDetails] = await Promise.all([
      fetchByIds({
        supabaseUrl,
        serviceRoleKey,
        table: "shows",
        ids: showIds,
      }),
      fetchByIds({
        supabaseUrl,
        serviceRoleKey,
        table: "episodes",
        ids: episodeIds,
      }),
    ]);

    sections.referenced_shows = showDetails.rows;
    sections.referenced_episodes = episodeDetails.rows;

    if (showDetails.unavailable) {
      unavailableSections.push({
        section: "referenced_shows",
        table: "shows",
        reason: showDetails.error,
      });
    }
    if (episodeDetails.unavailable) {
      unavailableSections.push({
        section: "referenced_episodes",
        table: "episodes",
        reason: episodeDetails.error,
      });
    }

    const exportedAt = new Date();
    const datePart = exportedAt.toISOString().slice(0, 10);
    const exportDocument = {
      export_information: {
        service: "BURGRS",
        exported_at: exportedAt.toISOString(),
        format: "JSON",
        description:
          "A copy of personal and account-associated data held by BURGRS at the time of export.",
      },
      account: safeAuthUser(user),
      data: sections,
      unavailable_sections: unavailableSections,
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="burgrs-data-export-${datePart}.json"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
      body: JSON.stringify(exportDocument, null, 2),
    };
  } catch (error) {
    console.error("Failed exporting BURGRS account data:", error);
    return jsonResponse(500, {
      error: error?.message || "Your data export could not be created.",
    });
  }
};
