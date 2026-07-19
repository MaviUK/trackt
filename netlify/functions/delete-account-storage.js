const { createClient } = require("@supabase/supabase-js");

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

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
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

function isMissingBucketError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("bucket not found") || message.includes("not found");
}

async function listStorageFiles(storageBucket, folder) {
  const filePaths = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await storageBucket.list(folder, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;

    const entries = Array.isArray(data) ? data : [];
    for (const entry of entries) {
      const entryPath = folder ? `${folder}/${entry.name}` : entry.name;

      if (entry.id) {
        filePaths.push(entryPath);
      } else {
        filePaths.push(...(await listStorageFiles(storageBucket, entryPath)));
      }
    }

    if (entries.length < limit) break;
    offset += limit;
  }

  return filePaths;
}

async function deleteStorageFolder(supabaseAdmin, bucketName, userId) {
  const storageBucket = supabaseAdmin.storage.from(bucketName);
  let filePaths;

  try {
    filePaths = await listStorageFiles(storageBucket, userId);
  } catch (error) {
    if (isMissingBucketError(error)) return;
    throw new Error(`Could not inspect ${bucketName} uploads: ${error.message}`);
  }

  for (let index = 0; index < filePaths.length; index += 100) {
    const { error } = await storageBucket.remove(filePaths.slice(index, index + 100));
    if (error) {
      throw new Error(`Could not remove ${bucketName} uploads: ${error.message}`);
    }
  }
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
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Account deletion is not configured yet." });
  }

  const authorization = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return jsonResponse(401, { error: "You must be logged in." });
  }

  try {
    const user = await getAuthenticatedUser({ supabaseUrl, anonKey, accessToken });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await deleteStorageFolder(supabaseAdmin, "creator-posts", user.id);
    await deleteStorageFolder(supabaseAdmin, "issue-screenshots", user.id);

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("Failed deleting BURGRS storage:", error);
    return jsonResponse(500, {
      error: error?.message || "Uploaded files could not be removed.",
    });
  }
};
