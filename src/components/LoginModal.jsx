import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./LoginModal.css";

export default function LoginModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const redirectTo = window.location.href;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      setMessage(
        "Check your email. Tap the login link and you’ll return to this matchup."
      );
    } catch (error) {
      setMessage(error.message || "Could not send login email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-modal-overlay">
      <div className="login-modal-card">
        <button
          type="button"
          className="login-modal-close"
          onClick={onClose}
        >
          ×
        </button>

        <h2>Sign in to vote</h2>

        <p className="login-modal-intro">
          Enter your email and we’ll send you a secure login link. You’ll come
          straight back to this matchup.
        </p>

        <form onSubmit={handleSubmit} className="login-modal-form">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Email me a login link"}
          </button>
        </form>

        {message ? (
          <p className="login-modal-message">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
