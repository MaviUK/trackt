import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const LIST_IDEAS = [
  "Best mini series",
  "Best horror shows",
  "Best crime dramas",
  "Hidden gems",
  "Shows to binge in a weekend",
];

function normalizeYear(value) {
  if (!value) return "";
  return String(value).slice(0, 4);
}

function toListShow(show) {
  return {
    id: String(show.id),
    name: show.name || "Untitled show",
    year: normalizeYear(show.first_aired),
    poster_url: show.poster_url || "",
    tmdb_id: show.tmdb_id ? String(show.tmdb_id) : "",
    note: "",
  };
}

function showHref(show) {
  if (!show) return "#";
  if (show.tmdb_id) return `/show/tmdb/${show.tmdb_id}`;
  return `/show/${show.id}`;
}

export default function CreatorListEditor() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [title, setTitle] = useState("Best mini series");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedShows, setSelectedShows] = useState([]);

  const profileUrl = useMemo(() => {
    if (!profile?.username) return "/profile/edit";
    return `/u/${encodeURIComponent(profile.username)}`;
  }, [profile?.username]);

  useEffect(() => {
    let active = true;

    async function loadUserProfile() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        if (!active) return;
        setCurrentUser(user);

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, full_name, display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!active) return;

        setProfile(data || null);
      } catch (err) {
        console.error("Failed loading list creator:", err);
        if (active) setError(err.message || "Could not load your profile.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUserProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const term = searchTerm.trim();

    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const { data, error: searchError } = await supabase
          .from("shows")
          .select("id, name, first_aired, poster_url, tmdb_id")
          .ilike("name", `%${term}%`)
          .order("name", { ascending: true })
          .limit(12);

        if (searchError) throw searchError;
        if (active) setSearchResults(data || []);
      } catch (err) {
        console.error("Show search failed:", err);
        if (active) setError(err.message || "Show search failed.");
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  function addShow(show) {
    const nextShow = toListShow(show);

    setSelectedShows((currentShows) => {
      if (currentShows.some((item) => item.id === nextShow.id)) {
        return currentShows;
      }

      return [...currentShows, nextShow];
    });

    setMessage(`${nextShow.name} added to the list.`);
  }

  function removeShow(showId) {
    setSelectedShows((currentShows) =>
      currentShows.filter((show) => show.id !== String(showId))
    );
  }

  function moveShow(showId, direction) {
    setSelectedShows((currentShows) => {
      const index = currentShows.findIndex((show) => show.id === String(showId));
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= currentShows.length) {
        return currentShows;
      }

      const nextShows = [...currentShows];
      const [item] = nextShows.splice(index, 1);
      nextShows.splice(nextIndex, 0, item);
      return nextShows;
    });
  }

  function updateShowNote(showId, note) {
    setSelectedShows((currentShows) =>
      currentShows.map((show) =>
        show.id === String(showId) ? { ...show, note } : show
      )
    );
  }

  async function handleSaveList(event) {
    event.preventDefault();

    const cleanedTitle = title.trim();
    const cleanedDescription = description.trim();

    if (!currentUser?.id) {
      setError("You must be logged in to create a list.");
      return;
    }

    if (!cleanedTitle) {
      setError("Give your list a title, for example Best horror shows.");
      return;
    }

    if (!selectedShows.length) {
      setError("Add at least one show before saving the list.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data: listRow, error: listError } = await supabase
        .from("creator_lists")
        .insert({
          user_id: currentUser.id,
          title: cleanedTitle,
          description: cleanedDescription || null,
          list_type: "custom",
          visibility,
        })
        .select("id")
        .single();

      if (listError) throw listError;

      const items = selectedShows.map((show, index) => ({
        list_id: listRow.id,
        rank: index + 1,
        show_id: show.id,
        show_name: show.name,
        show_year: show.year || null,
        poster_url: show.poster_url || null,
        tmdb_id: show.tmdb_id || null,
        note: show.note.trim() || null,
      }));

      const { error: itemError } = await supabase
        .from("creator_list_items")
        .insert(items);

      if (itemError) throw itemError;

      setMessage("List created.");
      navigate(profileUrl, { replace: true });
    } catch (err) {
      console.error("Failed creating creator list:", err);
      setError(
        err.message ||
          "Could not create the list. Make sure the creator_lists tables have been added in Supabase."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={mutedStyle}>Loading list creator...</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Creator list</p>
          <h1 style={titleStyle}>Create a ranked TV list</h1>
          <p style={mutedStyle}>
            Build lists like Best mini series, Best horror shows, hidden gems or anything your followers should watch.
          </p>
        </div>

        <Link to={profileUrl} style={secondaryButtonStyle}>
          Back to profile
        </Link>
      </section>

      {error ? <div style={errorStyle}>{error}</div> : null}
      {message ? <div style={messageStyle}>{message}</div> : null}

      <form onSubmit={handleSaveList} style={cardStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>List title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Best horror shows"
              style={inputStyle}
            />
          </div>

          <div style={ideaGridStyle}>
            {LIST_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setTitle(idea)}
                style={ideaButtonStyle(title === idea)}
              >
                {idea}
              </button>
            ))}
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tell people what kind of list this is..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: 92 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Visibility</label>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
              style={inputStyle}
            >
              <option value="public">Public on creator profile</option>
              <option value="private">Private draft</option>
            </select>
          </div>
        </div>

        <div style={dividerStyle} />

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Search shows to add</label>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search for a show..."
              style={inputStyle}
            />
          </div>

          {searching ? <p style={mutedStyle}>Searching...</p> : null}

          {searchResults.length ? (
            <div style={searchResultsStyle}>
              {searchResults.map((show) => {
                const listShow = toListShow(show);
                const alreadyAdded = selectedShows.some((item) => item.id === listShow.id);

                return (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => addShow(show)}
                    disabled={alreadyAdded}
                    style={searchResultStyle(alreadyAdded)}
                  >
                    {listShow.poster_url ? (
                      <img src={listShow.poster_url} alt="" style={posterStyle} />
                    ) : (
                      <span style={posterFallbackStyle}>?</span>
                    )}
                    <span style={{ minWidth: 0 }}>
                      <strong style={resultTitleStyle}>{listShow.name}</strong>
                      {listShow.year ? <small style={resultMetaStyle}>{listShow.year}</small> : null}
                    </span>
                    <span style={addBadgeStyle}>{alreadyAdded ? "Added" : "Add"}</span>
                  </button>
                );
              })}
            </div>
          ) : searchTerm.trim().length >= 2 && !searching ? (
            <p style={mutedStyle}>No shows found.</p>
          ) : null}
        </div>

        <div style={dividerStyle} />

        <section>
          <h2 style={sectionTitleStyle}>List order ({selectedShows.length})</h2>

          {selectedShows.length ? (
            <div style={selectedListStyle}>
              {selectedShows.map((show, index) => (
                <article key={show.id} style={selectedItemStyle}>
                  <Link to={showHref(show)} style={selectedShowLinkStyle}>
                    <strong style={rankStyle}>#{index + 1}</strong>
                    {show.poster_url ? (
                      <img src={show.poster_url} alt="" style={posterStyle} />
                    ) : (
                      <span style={posterFallbackStyle}>?</span>
                    )}
                    <span style={{ minWidth: 0 }}>
                      <strong style={resultTitleStyle}>{show.name}</strong>
                      {show.year ? <small style={resultMetaStyle}>{show.year}</small> : null}
                    </span>
                  </Link>

                  <textarea
                    value={show.note}
                    onChange={(event) => updateShowNote(show.id, event.target.value)}
                    placeholder="Optional note: why it makes the list..."
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
                  />

                  <div style={itemActionsStyle}>
                    <button
                      type="button"
                      onClick={() => moveShow(show.id, -1)}
                      disabled={index === 0}
                      style={smallButtonStyle}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveShow(show.id, 1)}
                      disabled={index === selectedShows.length - 1}
                      style={smallButtonStyle}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeShow(show.id)}
                      style={dangerButtonStyle}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p style={mutedStyle}>Search for shows above, then tap Add to build the list.</p>
          )}
        </section>

        <button type="submit" disabled={saving} style={primaryButtonStyle}>
          {saving ? "Saving list..." : "Save list"}
        </button>
      </form>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: "18px 14px 96px",
  background:
    "radial-gradient(circle at top, rgba(124, 58, 237, 0.2), transparent 34%), #07111f",
  color: "#f8fafc",
};

const headerStyle = {
  display: "grid",
  gap: 14,
  marginBottom: 16,
};

const eyebrowStyle = {
  margin: "0 0 8px",
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const titleStyle = {
  margin: "0 0 8px",
  fontSize: 34,
  lineHeight: 1,
  letterSpacing: "-0.05em",
};

const mutedStyle = {
  margin: 0,
  color: "#94a3b8",
  lineHeight: 1.45,
};

const cardStyle = {
  display: "grid",
  gap: 18,
  padding: 16,
  borderRadius: 24,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.72))",
  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.22)",
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  color: "#f8fafc",
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid #26324a",
  background: "#182235",
  color: "#f8fafc",
  fontSize: "1rem",
  outline: "none",
  boxSizing: "border-box",
};

const ideaGridStyle = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 2,
};

function ideaButtonStyle(isActive) {
  return {
    flex: "0 0 auto",
    padding: "9px 12px",
    borderRadius: 999,
    border: isActive ? "1px solid #a78bfa" : "1px solid #334155",
    background: isActive ? "rgba(124, 58, 237, 0.38)" : "#182235",
    color: "#f8fafc",
    fontWeight: 850,
    cursor: "pointer",
  };
}

const dividerStyle = {
  height: 1,
  background: "rgba(148, 163, 184, 0.16)",
};

const searchResultsStyle = {
  display: "grid",
  gap: 10,
};

function searchResultStyle(alreadyAdded) {
  return {
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 16,
    border: "1px solid rgba(255, 255, 255, 0.08)",
    background: alreadyAdded ? "rgba(34, 197, 94, 0.11)" : "rgba(255, 255, 255, 0.055)",
    color: "#f8fafc",
    textAlign: "left",
    cursor: alreadyAdded ? "not-allowed" : "pointer",
    opacity: alreadyAdded ? 0.75 : 1,
  };
}

const posterStyle = {
  width: 44,
  height: 62,
  borderRadius: 10,
  objectFit: "cover",
  background: "#1e293b",
};

const posterFallbackStyle = {
  width: 44,
  height: 62,
  borderRadius: 10,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#1e293b",
  color: "#94a3b8",
  fontWeight: 900,
};

const resultTitleStyle = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const resultMetaStyle = {
  display: "block",
  marginTop: 3,
  color: "#94a3b8",
  fontWeight: 800,
};

const addBadgeStyle = {
  padding: "6px 9px",
  borderRadius: 999,
  background: "rgba(124, 58, 237, 0.22)",
  color: "#ddd6fe",
  fontSize: 12,
  fontWeight: 900,
};

const sectionTitleStyle = {
  margin: "0 0 12px",
  fontSize: 20,
  letterSpacing: "-0.025em",
};

const selectedListStyle = {
  display: "grid",
  gap: 12,
};

const selectedItemStyle = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 18,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(255, 255, 255, 0.055)",
};

const selectedShowLinkStyle = {
  display: "grid",
  gridTemplateColumns: "42px 44px 1fr",
  alignItems: "center",
  gap: 10,
  color: "#f8fafc",
  textDecoration: "none",
};

const rankStyle = {
  color: "#c4b5fd",
  fontWeight: 950,
};

const itemActionsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const primaryButtonStyle = {
  minHeight: 48,
  border: "none",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 44,
  borderRadius: 999,
  padding: "0 16px",
  background: "rgba(255, 255, 255, 0.12)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  color: "#f8fafc",
  fontWeight: 900,
  textDecoration: "none",
};

const smallButtonStyle = {
  minHeight: 38,
  borderRadius: 999,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f8fafc",
  fontWeight: 850,
  cursor: "pointer",
};

const dangerButtonStyle = {
  minHeight: 38,
  borderRadius: 999,
  border: "1px solid rgba(248, 113, 113, 0.28)",
  background: "rgba(127, 29, 29, 0.32)",
  color: "#fecaca",
  fontWeight: 850,
  cursor: "pointer",
};

const errorStyle = {
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 16,
  background: "rgba(127, 29, 29, 0.32)",
  border: "1px solid rgba(248, 113, 113, 0.32)",
  color: "#fecaca",
  fontWeight: 800,
};

const messageStyle = {
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 16,
  background: "rgba(34, 197, 94, 0.12)",
  border: "1px solid rgba(34, 197, 94, 0.25)",
  color: "#bbf7d0",
  fontWeight: 800,
};
