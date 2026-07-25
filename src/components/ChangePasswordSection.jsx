import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./ChangePasswordSection.css";

export default function ChangePasswordSection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    setError("");
    setMessage("");

    const password = newPassword.trim();
    const confirmation = confirmPassword.trim();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user || null;

      if (userError) throw userError;
      if (!user) throw new Error("Your session expired. Please log in again.");

      const changedAt = new Date().toISOString();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          ...(user.user_metadata || {}),
          password_login_enabled: true,
          password_set_at: changedAt,
        },
      });

      if (updateError) throw updateError;

      setNewPassword("");
      setConfirmPassword("");
      setMessage("Your password has been changed.");
    } catch (err) {
      console.error("Failed changing password:", err);
      setError(err.message || "Your password could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="change-password-section" aria-labelledby="change-password-title">
      <div className="change-password-copy">
        <h2 id="change-password-title">Account &amp; Security</h2>
        <p>Choose a new password for signing in to your BURGRS account.</p>
      </div>

      <form className="change-password-form" onSubmit={handleSubmit}>
        <label htmlFor="profile-new-password">New password</label>
        <input
          id="profile-new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          disabled={saving}
        />

        <label htmlFor="profile-confirm-password">Confirm new password</label>
        <input
          id="profile-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="Type it again"
          disabled={saving}
        />

        {error ? <div className="change-password-alert is-error">{error}</div> : null}
        {message ? <div className="change-password-alert is-success">{message}</div> : null}

        <button type="submit" disabled={saving || !newPassword || !confirmPassword}>
          {saving ? "Changing password..." : "Change password"}
        </button>
      </form>
    </section>
  );
}
