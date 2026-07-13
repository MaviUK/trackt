import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./AccountDataExportSection.css";

function getDownloadUrl(url, fileName) {
  const downloadUrl = new URL(url, window.location.origin);
  downloadUrl.searchParams.set("download", fileName);
  return downloadUrl.toString();
}

async function downloadFile(url, fileName) {
  const response = await fetch(getDownloadUrl(url, fileName), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("The secure export file could not be downloaded.");
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("The generated data export was empty.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

export default function AccountDataExportSection() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function exportData() {
    if (exporting) return;

    setExporting(true);
    setError("");
    setMessage("");

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = data?.session?.access_token || "";
      if (!accessToken) {
        throw new Error("Your session expired. Please log in again.");
      }

      const response = await fetch("/.netlify/functions/export-account-data", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok || !result?.ok || !result?.downloadUrl) {
        throw new Error(result?.error || "Your data export could not be created.");
      }

      const fileName =
        result.fileName ||
        `burgrs-data-export-${new Date().toISOString().slice(0, 10)}.json`;

      await downloadFile(result.downloadUrl, fileName);
      setMessage(`Your BURGRS data has been downloaded as ${fileName}.`);
    } catch (err) {
      console.error("Failed exporting account data:", err);
      setError(err.message || "Your data export could not be created.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="account-export-section" aria-labelledby="account-export-title">
      <div>
        <h2 id="account-export-title">Export my data</h2>
        <p>
          Download a JSON copy of the personal and account data linked to your
          BURGRS account.
        </p>
      </div>

      {error ? <div className="account-export-alert is-error">{error}</div> : null}
      {message ? (
        <div className="account-export-alert is-success">{message}</div>
      ) : null}

      <button
        type="button"
        className="account-export-button"
        onClick={exportData}
        disabled={exporting}
      >
        {exporting ? "Preparing your data..." : "Download my data"}
      </button>

      <small>
        The file can contain private information. Store it somewhere secure.
      </small>
    </section>
  );
}
