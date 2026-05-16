import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./LoginModal.css";

export default function LoginModal({ onClose }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
  event.preventDefault();

  try {
    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError) throw loginError;

      onClose?.();
    } else {
      const { error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error) throw error;

      onClose?.();
    }
  } catch (error) {
    setMessage(error.message || "Authentication failed.");
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

        <h2>{mode === "signup" ? "Create account" : "Sign in"}</h2>

        <form onSubmit={handleSubmit} className="login-modal-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "signup"
              ? "Create account"
              : "Sign in"}
          </button>
        </form>

        {message ? (
          <p className="login-modal-message">{message}</p>
        ) : null}

        <button
          type="button"
          className="login-modal-switch"
          onClick={() =>
            setMode((value) =>
              value === "login" ? "signup" : "login"
            )
          }
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
