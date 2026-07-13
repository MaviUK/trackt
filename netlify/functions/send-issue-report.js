const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_TO_EMAIL = "info@burgrs.co.uk";
const DEFAULT_FROM_EMAIL = "BURGRS Reports <info@burgrs.co.uk>";
const SCREENSHOT_LINK_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function categoryLabel(category) {
  const labels = {
    bug: "Something is not working",
    content: "Incorrect show or episode information",
    account: "Account or login problem",
    suggestion: "Feature suggestion",
    other: "Other",
  };

  return labels[category] || "Other";
}

function encodeStoragePath(path) {
  return String(path || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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

async function getAuthenticatedUser({ supabaseUrl, supabaseAnonKey, accessToken }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await readJson(response);
  if (!response.ok || !data?.id) {
    throw new Error("Your session could not be verified. Please log in again.");
  }

  return data;
}

async function getIssueReport({
  supabaseUrl,
  serviceRoleKey,
  reportId,
  userId,
}) {
  const params = new URLSearchParams({
    id: `eq.${reportId}`,
    user_id: `eq.${userId}`,
    select:
      "id,user_id,email,category,subject,description,steps_to_reproduce,screenshot_paths,page_url,user_agent,viewport,status,created_at",
  });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/issue_reports?${params.toString()}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    }
  );

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || "The saved report could not be loaded.");
  }

  const report = Array.isArray(data) ? data[0] : null;
  if (!report) throw new Error("The saved report could not be found.");

  return report;
}

async function createScreenshotLink({ supabaseUrl, serviceRoleKey, path }) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/issue-screenshots/${encodeStoragePath(
      path
    )}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: SCREENSHOT_LINK_LIFETIME_SECONDS }),
    }
  );

  const data = await readJson(response);
  if (!response.ok || !data?.signedURL) return null;

  if (/^https?:\/\//i.test(data.signedURL)) return data.signedURL;
  return `${supabaseUrl}/storage/v1${data.signedURL}`;
}

async function updateEmailStatus({
  supabaseUrl,
  serviceRoleKey,
  reportId,
  sentAt = null,
  errorMessage = null,
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/issue_reports?id=eq.${encodeURIComponent(reportId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        email_sent_at: sentAt,
        email_delivery_error: errorMessage,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    console.warn("Failed updating issue report email status", await readJson(response));
  }
}

function buildEmail(report, screenshotLinks) {
  const typeLabel = categoryLabel(report.category);
  const submittedAt = report.created_at
    ? new Date(report.created_at).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      })
    : "Unknown";

  const screenshotHtml = screenshotLinks.length
    ? `<h3 style="margin:24px 0 10px">Screenshots</h3><ul>${screenshotLinks
        .map(
          (item, index) =>
            `<li style="margin:8px 0"><a href="${escapeHtml(
              item.url
            )}">Open screenshot ${index + 1}</a> <span style="color:#64748b">(link expires in 7 days)</span></li>`
        )
        .join("")}</ul>`
    : `<p><strong>Screenshots:</strong> None attached</p>`;

  const textScreenshots = screenshotLinks.length
    ? screenshotLinks
        .map((item, index) => `Screenshot ${index + 1}: ${item.url}`)
        .join("\n")
    : "Screenshots: None attached";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#0f172a">
      <h1 style="margin-bottom:6px">New BURGRS issue report</h1>
      <p style="margin-top:0;color:#64748b">Report ID: ${escapeHtml(report.id)}</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold">Issue type</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(
          typeLabel
        )}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold">Subject</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(
          report.subject
        )}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold">User email</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(
          report.email || "Not provided"
        )}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold">User ID</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(
          report.user_id
        )}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold">Submitted</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(
          submittedAt
        )}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px">What happened?</h3>
      <div style="white-space:pre-wrap;padding:14px;border-radius:10px;background:#f1f5f9">${escapeHtml(
        report.description
      )}</div>

      <h3 style="margin:24px 0 8px">Steps to reproduce</h3>
      <div style="white-space:pre-wrap;padding:14px;border-radius:10px;background:#f1f5f9">${escapeHtml(
        report.steps_to_reproduce || "Not provided"
      )}</div>

      ${screenshotHtml}

      <h3 style="margin:24px 0 8px">Technical details</h3>
      <p><strong>Page:</strong> ${escapeHtml(report.page_url || "Unknown")}</p>
      <p><strong>Viewport:</strong> ${escapeHtml(report.viewport || "Unknown")}</p>
      <p style="word-break:break-word"><strong>User agent:</strong> ${escapeHtml(
        report.user_agent || "Unknown"
      )}</p>
    </div>
  `;

  const text = `New BURGRS issue report

Report ID: ${report.id}
Issue type: ${typeLabel}
Subject: ${report.subject}
User email: ${report.email || "Not provided"}
User ID: ${report.user_id}
Submitted: ${submittedAt}

What happened?
${report.description}

Steps to reproduce
${report.steps_to_reproduce || "Not provided"}

${textScreenshots}

Technical details
Page: ${report.page_url || "Unknown"}
Viewport: ${report.viewport || "Unknown"}
User agent: ${report.user_agent || "Unknown"}`;

  return { html, text, typeLabel };
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

  const resendApiKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!resendApiKey || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Issue report email environment variables are incomplete.");
    return jsonResponse(500, {
      error: "Issue report email is not configured yet.",
    });
  }

  const authorization = event.headers.authorization || event.headers.Authorization || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return jsonResponse(401, { error: "You must be logged in." });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid request body." });
  }

  const reportId = String(payload?.reportId || "").trim();
  if (!reportId) return jsonResponse(400, { error: "A report ID is required." });

  try {
    const user = await getAuthenticatedUser({
      supabaseUrl,
      supabaseAnonKey,
      accessToken,
    });

    const report = await getIssueReport({
      supabaseUrl,
      serviceRoleKey,
      reportId,
      userId: user.id,
    });

    const screenshotPaths = Array.isArray(report.screenshot_paths)
      ? report.screenshot_paths.slice(0, 3)
      : [];

    const screenshotLinks = (
      await Promise.all(
        screenshotPaths.map(async (path) => {
          const url = await createScreenshotLink({
            supabaseUrl,
            serviceRoleKey,
            path,
          });
          return url ? { path, url } : null;
        })
      )
    ).filter(Boolean);

    const { html, text, typeLabel } = buildEmail(report, screenshotLinks);
    const toEmail = process.env.REPORTS_TO_EMAIL || DEFAULT_TO_EMAIL;
    const fromEmail = process.env.REPORTS_FROM_EMAIL || DEFAULT_FROM_EMAIL;

    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: report.email || undefined,
        subject: `[BURGRS ${typeLabel}] ${report.subject}`,
        html,
        text,
      }),
    });

    const resendData = await readJson(resendResponse);
    if (!resendResponse.ok) {
      const message =
        resendData?.message || resendData?.error || "Resend rejected the email.";

      await updateEmailStatus({
        supabaseUrl,
        serviceRoleKey,
        reportId,
        errorMessage: String(message).slice(0, 1000),
      });

      throw new Error(message);
    }

    await updateEmailStatus({
      supabaseUrl,
      serviceRoleKey,
      reportId,
      sentAt: new Date().toISOString(),
      errorMessage: null,
    });

    return jsonResponse(200, { ok: true, emailId: resendData?.id || null });
  } catch (error) {
    console.error("Failed emailing issue report:", error);
    return jsonResponse(500, {
      error: error?.message || "The report email could not be sent.",
    });
  }
};
