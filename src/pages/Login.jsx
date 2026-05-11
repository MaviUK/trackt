import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import BurgrsBanner from "../components/BurgrsBanner";
import { supabase } from "../lib/supabase";
import "./Login.css";

const fallbackTrendingShows = [
  {
    id: "fallback-1",
    name: "Track your favourites",
    image: null,
    year: "Watchlist",
  },
  {
    id: "fallback-2",
    name: "Rank every show",
    image: null,
    year: "Rank'd",
  },
  {
    id: "fallback-3",
    name: "Rate episodes",
    image: null,
    year: "Burgr",
  },
  {
    id: "fallback-4",
    name: "See what's next",
    image: null,
    year: "Calendar",
  },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(undefined);
  const [trendingShows, setTrendingShows] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;

    async function loadTrendingShows() {
      try {
        setTrendingLoading(true);
        const response = await fetch("/.netlify/functions/getTrendingShows");
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.message || "Failed to load trending shows");
        }

        if (!cancelled) {
          setTrendingShows((payload?.shows || []).slice(0, 10));
        }
      } catch (trendingError) {
        console.error("Failed loading login trending shows:", trendingError);
        if (!cancelled) {
          setTrendingShows([]);
        }
      } finally {
        if (!cancelled) {
          setTrendingLoading(false);
        }
      }
    }

    loadTrendingShows();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (event) => {
    event?.preventDefault?.();
    setError("");

    if (!supabase) {
      setError("Supabase environment variables are missing.");
      return;
    }

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Enter your email address to get a login link.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
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

  const displayTrendingShows = trendingShows.length
    ? trendingShows
    : fallbackTrendingShows;

  return (
    <div className="login-page">
      <header className="login-header" aria-label="Burgrs header">
        <BurgrsBanner />
      </header>

      <main className="login-shell">
        <section className="login-login-section" aria-label="Login">
          <form className="login-form-card" onSubmit={login}>

            {sent ? (
              <div className="login-success" role="status">
                Check your email for the login link.
              </div>
            ) : (
              <>
                <label className="login-label" htmlFor="login-email">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />

                <button type="submit">Send Login Link</button>

                {error ? <p className="login-error">{error}</p> : null}
              </>
            )}
          </form>
        </section>

        <section className="login-trending-section" aria-label="Trending shows">
          <div className="login-section-head">
            <div>
              <h2>Discover what people are watching</h2>
            </div>
            {trendingLoading ? (
              <span className="login-muted">Loading...</span>
            ) : null}
          </div>

          <div className="login-trending-row">
            {displayTrendingShows.map((show, index) => {
              const showName = show?.name || show?.title || "Trending show";
              const poster = show?.image || show?.poster_url || null;

              return (
                <article
                  key={show?.id || `${showName}-${index}`}
                  className="login-trending-card"
                  aria-label={showName}
                >
                  {poster ? (
                    <img src={poster} alt="" loading="lazy" />
                  ) : (
                    <div className="login-trending-placeholder">
                      {showName.charAt(0)}
                    </div>
                  )}
                  <div className="login-trending-overlay">
                    <strong>{showName}</strong>
                    {show?.year ? <span>{show.year}</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="login-copy login-home-section" aria-label="Your TV tracking home">
          <h2>Track, rate and rank every show you watch.</h2>
          <p className="login-intro">
            Build your watchlist, keep episodes organised by progress,
            rate shows with Burgr scores, compare your favourites in Rank'd,
            and see what is ready to watch next.
          </p>

          <div className="login-feature-grid" aria-label="Website features">
            <div className="login-feature-card">
              <strong>My Shows</strong>
              <span>Sort shows into Watchlist, In Progress and Completed.</span>
            </div>
            <div className="login-feature-card">
              <strong>Rank'd</strong>
              <span>Build your personal TV ladder through head-to-head votes.</span>
            </div>
            <div className="login-feature-card">
              <strong>Episodes</strong>
              <span>Mark episodes watched and rate them as you go.</span>
            </div>
            <div className="login-feature-card">
              <strong>Calendar</strong>
              <span>See what is airing next from the shows you follow.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
