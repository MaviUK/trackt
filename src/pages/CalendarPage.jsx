import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./CalendarPage.css";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatGroupLabel(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [range, setRange] = useState("week");

  useEffect(() => {
    async function loadCalendar() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: userShows, error: showsError } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("show_name", { ascending: true });

      if (showsError) {
        console.error("Failed to load shows:", showsError);
        setItems([]);
        setLoading(false);
        return;
      }

      const safeShows = userShows || [];
      const tvdbIds = safeShows.map((show) => String(show.tvdb_id));
      const showLookup = {};

      for (const show of safeShows) {
        showLookup[String(show.tvdb_id)] = show;
      }

      const today = startOfToday();
      const collected = [];

      if (tvdbIds.length > 0) {
        const { data: episodeRows, error: episodesError } = await supabase
          .from("episodes")
          .select("*")
          .in("show_tvdb_id", tvdbIds)
          .gte("aired", today.toISOString().slice(0, 10))
          .order("aired", { ascending: true })
          .order("season_number", { ascending: true })
          .order("episode_number", { ascending: true });

        if (episodesError) {
          console.error("Failed to load calendar episodes:", episodesError);
          setItems([]);
          setLoading(false);
          return;
        }

        for (const row of episodeRows || []) {
          const show = showLookup[String(row.show_tvdb_id)];
          if (!show) continue;

          const airValue = row.aired;
          if (!airValue) continue;

          const airDate = new Date(airValue);
          if (Number.isNaN(airDate.getTime())) continue;

          const airDay = new Date(airDate);
          airDay.setHours(0, 0, 0, 0);

          if (airDay < today) continue;

          collected.push({
            showTvdbId: String(row.show_tvdb_id),
            showName: show.show_name,
            posterUrl: show.poster_url,
            episodeId: row.id,
            episodeName: row.episode_name,
            seasonNumber: row.season_number,
            episodeNumber: row.episode_number,
            aired: row.aired,
          });
        }
      }

      collected.sort((a, b) => new Date(a.aired) - new Date(b.aired));
      setItems(collected);
      setLoading(false);
    }

    loadCalendar();
  }, []);

  const filteredItems = useMemo(() => {
    const today = startOfToday();
    const end = new Date(today);

    if (range === "today") {
      end.setDate(today.getDate() + 1);
    } else if (range === "week") {
      end.setDate(today.getDate() + 7);
    } else if (range === "month") {
      end.setMonth(today.getMonth() + 1);
    }

    if (range === "all") return items;

    return items.filter((item) => {
      const d = new Date(item.aired);
      return d >= today && d < end;
    });
  }, [items, range]);

  const groupedItems = useMemo(() => {
    const groups = {};

    filteredItems.forEach((item) => {
      const key = new Date(item.aired).toISOString().slice(0, 10);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return Object.entries(groups)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([date, episodes]) => ({
        date,
        label: formatGroupLabel(date),
        episodes,
      }));
  }, [filteredItems]);

  const toggleStyle = (active) => ({
    padding: "10px 16px",
    borderRadius: "999px",
    border: active ? "1px solid #8b5cf6" : "1px solid #26324a",
    background: active ? "#8b5cf6" : "#121a2b",
    color: "#fff",
    fontWeight: "700",
    cursor: "pointer",
  });

  if (loading) {
    return (
      <div className="calendar-page">
        <div className="calendar-shell">
          <div className="calendar-header">
            <h1>Calendar</h1>
            <p>Loading upcoming episodes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-page">
      <div className="calendar-shell">
        <div className="calendar-header">
          <h1>Calendar</h1>
          <p>Upcoming episodes from your saved shows.</p>
        </div>

        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setRange("today")}
            style={toggleStyle(range === "today")}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setRange("week")}
            style={toggleStyle(range === "week")}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setRange("month")}
            style={toggleStyle(range === "month")}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setRange("all")}
            style={toggleStyle(range === "all")}
          >
            All Upcoming
          </button>
        </div>

        {groupedItems.length === 0 ? (
          <div className="calendar-empty">
            <p>No upcoming episodes in this range.</p>
          </div>
        ) : (
          <div className="calendar-groups">
            {groupedItems.map((group) => (
              <section key={group.date} className="calendar-group-card">
                <div className="calendar-group-header">
                  <h2>{group.label}</h2>
                  <span>
                    {group.episodes.length} episode
                    {group.episodes.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="calendar-list">
                  {group.episodes.map((item) => (
                    <Link
                      key={`${item.showTvdbId}-${item.episodeId}`}
                      to={`/my-shows/${item.showTvdbId}?episode=${item.episodeId}`}
                      className="calendar-item"
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.showName}
                          className="calendar-poster"
                        />
                      ) : (
                        <div className="calendar-poster calendar-poster-fallback" />
                      )}

                      <div className="calendar-main">
                        <div className="calendar-show-name">{item.showName}</div>
                        <div className="calendar-episode-code">
                          {getEpisodeCode({
                            seasonNumber: item.seasonNumber,
                            number: item.episodeNumber,
                          })}
                        </div>
                        <div className="calendar-episode-name">
                          {item.episodeName || "Untitled episode"}
                        </div>
                      </div>

                      <div className="calendar-date">
                        {formatDate(item.aired)}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
