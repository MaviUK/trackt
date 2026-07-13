import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BurgrsBanner from "../components/BurgrsBanner";
import { supabase } from "../lib/supabase";
import "./SetPassword.css";

const MINIMUM_AGE = 13;

function hasPasswordEnabled(user) {
  return Boolean(user?.user_metadata?.password_login_enabled);
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

export default function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = useMemo(() => searchParams.get("redirect") || "/", [searchParams]);

  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("dob")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.dob) {
        setDateOfBirth(String(profile.dob).slice(0, 10));
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
    const age = calculateAge(dateOfBirth);

    if (trimmedPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (age === null) {
      setError("Enter a valid date of birth.");
      return;
    }

    if (age < MINIMUM_AGE) {
      setError("You must be at least 13 years old to create a BURGRS account.");
      return;
    }

    if (!acceptedLegal) {
      setError("You must accept the Terms of Use, Privacy Policy and Community Guidelines.");
      return;
    }

    setSaving(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user || null;

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again before setting your password.");

      const acceptedAt = new Date().toISOString();

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email || null,
          dob: dateOfBirth,
          updated_at: acceptedAt,
        },
        { onConflict: "id" }
      );

      if (profileError) throw profileError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedPassword,
        data: {
          ...(user.user_metadata || {}),
          password_login_enabled: true,
          password_set_at: acceptedAt,
          date_of_birth: dateOfBirth,
          minimum_age_confirmed: true,
          legal_terms_accepted_at: acceptedAt,
          legal_terms_version: "2026-07-13",
        },
      });

      if (updateError) throw updateError;

      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error("Failed setting password:", err);
      setError(err.message || "Could not complete account setup.");
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
        <h1>Complete your account</h1>
        <p>
          Set a password and confirm that you meet the BURGRS minimum age requirement.
        </p>

        <form onSubmit={handleSubmit} className="set-password-form">
          <label htmlFor="date-of-birth">Date of birth</label>
          <input
            id="date-of-birth"
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            autoComplete="bday"
            required
          />
          <small className="set-password-help">
            You must be at least 13. Your full date of birth is not displayed publicly.
          </small>

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

          <label className="set-password-legal-check">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(event) => setAcceptedLegal(event.target.checked)}
            />
            <span>
              I confirm that I am at least 13 and agree to the {" "}
              <a href="/terms/" target="_blank" rel="noreferrer">Terms of Use</a>, {" "}
              <a href="/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a> and {" "}
              <a href="/community-guidelines/" target="_blank" rel="noreferrer">Community Guidelines</a>.
            </span>
          </label>

          {error ? <div className="set-password-error">{error}</div> : null}

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Complete account setup"}
          </button>

          <a className="set-password-age-link" href="/age-and-children/">
            Read Age & Children information
          </a>
        </form>
      </section>
    </main>
  );
}
