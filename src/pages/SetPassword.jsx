import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BurgrsBanner from "../components/BurgrsBanner";
import { supabase } from "../lib/supabase";
import "./SetPassword.css";

function hasPasswordEnabled(user) {
  return Boolean(user?.user_metadata?.password_login_enabled);
}

export default function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = useMemo(() => searchParams.get("redirect") || "/", [searchParams]);

  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkPasswordStatus() {
      const { data, error: userError } = await supabase.auth.getUser();
      const user = data?.user || null;

      if (!active) return;

      if (userError || !user) {
        setChecking(false);
        return;
      }

      if (hasPasswordEnabled(user)) {
        navigate(redirectTo, { replace: true });
        return;
      }

      setChecking(false);
    }

    checkPasswordStatus();

    return () => {
      active = false;
    };
  }, [navigate, redirectTo]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (trimmedPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user || null;

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again before setting your password.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedPassword,
        data: {
          ...(user.user_metadata || {}),
          password_login_enabled: true,
          password_set_at: new Date().toISOString(),
        },
      });

      if (updateError) throw updateError;

      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error("Failed setting password:", err);
      setError(err.message || "Could not set password.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="set-password-page">
        <p className="set-password-loading">Checking account...</p>
      </main>
    );
  }

  return (
    <main className="set-password-page">
      <header className="set-password-header">
        <BurgrsBanner />
      </header>

      <section className="set-password-card">
        <p className="set-password-kicker">One-time setup</p>
        <h1>Set a password</h1>
        <p>
          Your email link has signed you in. Set a password now, then you can log in
          with either your password or an email link from now on.
        </p>

        <form onSubmit={handleSubmit} className="set-password-form">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />

          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="Type it again"
          />

          {error ? <div className="set-password-error">{error}</div> : null}

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Set password and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
