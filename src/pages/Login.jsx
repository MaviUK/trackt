import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session ?? null);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async () => {
    setError("");

    if (!supabase) {
      setError("Supabase environment variables are missing.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  };

  if (session === undefined) {
    return null;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page">
      <h1>Login</h1>

      {sent ? (
        <p>Check your email for the login link.</p>
      ) : (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button onClick={login}>Send Login Link</button>

          {error && <p>{error}</p>}
        </>
      )}
    </div>
  );
}
