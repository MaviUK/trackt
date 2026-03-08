import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";

export default function ShowDetails() {
  const { id } = useParams();

  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadShow = async () => {
      try {
        const res = await fetch(`/.netlify/functions/getShow?id=${id}`);
        const data = await res.json();
        setShow(data);
      } catch (error) {
        setMessage("Failed to load show");
      } finally {
        setLoading(false);
      }
    };

    loadShow();
  }, [id]);

  const saveShow = async () => {
    if (!show) return;

    setSaving(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You need to log in first");
        setSaving(false);
        return;
      }

      const { data: existingShow, error: checkError } = await supabase
        .from("user_shows")
        .select("id")
        .eq("user_id", user.id)
        .eq("tvdb_id", String(show.id))
        .maybeSingle();

      if (checkError) {
        setMessage("Failed to check existing shows");
        setSaving(false);
        return;
      }

      if (existingShow) {
        setMessage("Show already in My Shows");
        setSaving(false);
        return;
      }

      const { error: insertError } = await supabase.from("user_shows").insert({
        user_id: user.id,
        tvdb_id: String(show.id),
        show_name: show.name,
        poster_url: show.image || "",
        overview: show.overview || "",
        first_aired: show.firstAired || "",
      });

      if (insertError) {
        setMessage("Failed to save show");
        setSaving(false);
        return;
      }

      setMessage("Show added to My Shows");
    } catch (error) {
      setMessage("Failed to save show");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  if (!show) {
    return <div className="page">Show not found</div>;
  }

  return (
    <div className="page">
      <h1>{show.name}</h1>

      {show.image && (
        <img
          src={show.image}
          alt={show.name}
          width="200"
          style={{ borderRadius: "12px" }}
        />
      )}

      {show.overview && <p>{show.overview}</p>}

      {show.firstAired && <p>First aired: {formatDate(show.firstAired)}</p>}

      <button onClick={saveShow} disabled={saving}>
        {saving ? "Saving..." : "Add to My Shows"}
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}
