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
    return