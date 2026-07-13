import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./AccountDeletionSection.css";

function clearLocalAccountData() {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // The account has already been deleted; storage cleanup is best effort.
  }
}

export default function AccountDeletionSection() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const canDelete =
    confirmation.trim().toUpperCase() === "DELETE" && understood && !deleting;

  function closeDialog() {
    if (deleting) return;
    setOpen(false);
    setConfirmation("");
    setUnderstood(false);
    setError("");
  }

  async function deleteAccount(event) {
    event.preventDefault();
    if (!canDelete) return;

    setDeleting(true);
    setError("");

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = data?.session?.access_token || "";
      if (!accessToken) {
        throw new Error("Your session expired. Please log in again.");
      }

      const response = await fetch("/.netlify/functions/delete-account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Your account could not be deleted.");
      }

      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      clearLocalAccountData();
      window.location.replace("/login?accountDeleted=1");
    } catch (err) {
      console.error("Failed deleting account:", err);
      setError(err.message || "Your account could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <section className="account-deletion-section" aria-labelledby="delete-account-title">
      <div>
        <h2 id="delete-account-title">Delete account</h2>
        <p>
          Permanently remove your BURGRS account, profile, watch history,
          ratings, posts, comments and uploaded files.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          className="account-delete-open"
          onClick={() => setOpen(true)}
        >
          Delete account
        </button>
      ) : (
        <form className="account-delete-panel" onSubmit={deleteAccount}>
          <div className="account-delete-warning">
            <strong>This cannot be undone.</strong>
            <span>
              Your login and associated BURGRS data will be permanently deleted.
            </span>
          </div>

          <label className="account-delete-checkbox">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              disabled={deleting}
            />
            <span>I understand that this action is permanent.</span>
          </label>

          <label className="account-delete-confirmation">
            <span>Type DELETE to confirm</span>
            <input
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
              disabled={deleting}
            />
          </label>

          {error ? <div className="account-delete-error">{error}</div> : null}

          <div className="account-delete-actions">
            <button
              type="button"
              className="account-delete-cancel"
              onClick={closeDialog}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="account-delete-confirm"
              disabled={!canDelete}
            >
              {deleting ? "Deleting account..." : "Permanently delete account"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
