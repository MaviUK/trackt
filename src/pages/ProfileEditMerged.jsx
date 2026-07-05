import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

const inputStyle = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  background: "rgba(15,23,42,0.96)",
  color: "#f8fafc",
  padding: "12px 14px",
  fontSize: 15,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: 7,
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 800,
};

const primaryButtonStyle = {
  width: "100%",
  border: "none",
  borderRadius: 16,
  background: "linear-gradient(135deg, #7c3aed, #db2777)",
  color: "#ffffff",
  padding: "13px 16px",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(255,255,255,0.06)",
  color: "#e5e7eb",
  fontWeight: 800,
  textDecoration: "none",
  fontSize: 14,
};

function formatDobForInput(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProfileEditMerged() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [form, setForm] = useState({
    email: "",
    username: "",
    full_name: "",
    avatar_url: "",
    dob: "",
    gender: "",
    country: "",
    bio: "",
    cover_url: "",
    creator_tagline: "",
    creator_niche: "",
    creator_bio: "",
    instagram_url: "",
    x_url: "",
    tiktok_url: "",
    youtube_url: "",
    website_url: "",
  });

  const profileHref = useMemo(() => {
    return form.username.trim() ? `/u/${encodeURIComponent(form.username.trim())}` : "/profile/edit";
  }, [form.username]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const { data: authData, error: userError } = await supabase.auth.getUser();
        const user = authData?.user || null;

        if (userError) throw userError;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(`
            id,
            email,
            username,
            full_name,
            display_name,
            avatar_url,
            dob,
            gender,
            country,
            bio,
            cover_url,
            creator_tagline,
            creator_niche,
            creator_bio,
            instagram_url,
            x_url,
            tiktok_url,
            youtube_url,
            website_url
          `)
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!active) return;

        const nextForm = {
          email: data?.email || user.email || "",
          username: data?.username || "",
          full_name: data?.full_name || data?.display_name || "",
          avatar_url: data?.avatar_url || "",
          dob: formatDobForInput(data?.dob),
          gender: data?.gender || "",
          country: data?.country || "",
          bio: data?.bio || "",
          cover_url: data?.cover_url || "",
          creator_tagline: data?.creator_tagline || "",
          creator_niche: data?.creator_niche || "",
          creator_bio: data?.creator_bio || "",
          instagram_url: data?.instagram_url || "",
          x_url: data?.x_url || "",
          tiktok_url: data?.tiktok_url || "",
          youtube_url: data?.youtube_url || "",
          website_url: data?.website_url || "",
        };

        setForm(nextForm);
        setAvatarPreview(nextForm.avatar_url);
        setCoverPreview(nextForm.cover_url);
      } catch (err) {
        console.error("Failed loading profile:", err);
        setError(err.message || "Failed loading profile.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "avatar_url") setAvatarPreview(value);
    if (name === "cover_url") setCoverPreview(value);
  }

  async function handleAvatarFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setAvatarPreview(dataUrl);
    setForm((prev) => ({ ...prev, avatar_url: dataUrl }));
  }

  async function handleCoverFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setCoverPreview(dataUrl);
    setForm((prev) => ({ ...prev, cover_url: dataUrl }));
  }

  async function saveProfileRow(userId, payload) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("id");

    if (updateError) throw updateError;
    if (updatedRows && updatedRows.length > 0) return;

    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      ...payload,
    });

    if (insertError) throw insertError;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data: authData, error: userError } = await supabase.auth.getUser();
      const user = authData?.user || null;

      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in.");

      const cleanedEmail = form.email.trim();
      if (cleanedEmail && cleanedEmail !== user.email) {
        const { error: emailUpdateError } = await supabase.auth.updateUser({ email: cleanedEmail });
        if (emailUpdateError) throw emailUpdateError;
      }

      const payload = {
        email: cleanedEmail || null,
        username: form.username.trim() || null,
        full_name: form.full_name.trim() || null,
        display_name: form.full_name.trim() || null,
        avatar_url: form.avatar_url || null,
        dob: form.dob || null,
        gender: form.gender.trim() || null,
        country: form.country.trim() || null,
        bio: form.bio.trim() || null,
        cover_url: form.cover_url.trim().startsWith("data:") ? form.cover_url.trim() : normalizeUrl(form.cover_url) || null,
        creator_tagline: form.creator_tagline.trim() || null,
        creator_niche: form.creator_niche.trim() || null,
        creator_bio: form.creator_bio.trim() || null,
        instagram_url: normalizeUrl(form.instagram_url) || null,
        x_url: normalizeUrl(form.x_url) || null,
        tiktok_url: normalizeUrl(form.tiktok_url) || null,
        youtube_url: normalizeUrl(form.youtube_url) || null,
        website_url: normalizeUrl(form.website_url) || null,
        updated_at: new Date().toISOString(),
      };

      await saveProfileRow(user.id, payload);
      setMessage("Profile updated.");
      setAvatarPreview(payload.avatar_url || "");
      setCoverPreview(payload.cover_url || "");
    } catch (err) {
      console.error("Failed saving profile:", err);
      setError(err.message || "Failed saving profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return <main className="page"><p className="creator-muted">Loading your profile...</p></main>;
  }

  return (
    <main className="page profile-edit-page">
      <div className="page-header profile-edit-header" style={{ marginBottom: 18 }}>
        <h1>Edit Profile</h1>
        <p>Your profile and creator page settings are now in one place.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <Link to={profileHref} style={secondaryButtonStyle}>View creator page</Link>
          <Link to="/creator/posts/new" style={secondaryButtonStyle}>Create post</Link>
          <Link to="/creator/lists/new" style={secondaryButtonStyle}>Create list</Link>
        </div>
      </div>

      {error ? <div style={{ maxWidth: 860, marginBottom: 16, padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.12)", color: "#fecaca", border: "1px solid rgba(239,68,68,0.25)" }}>{error}</div> : null}
      {message ? <div style={{ maxWidth: 860, marginBottom: 16, padding: 12, borderRadius: 12, background: "rgba(34,197,94,0.12)", color: "#bbf7d0", border: "1px solid rgba(34,197,94,0.25)" }}>{message}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 860, display: "grid", gap: 18 }}>
        <section style={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 20, padding: 18 }}>
          <h2 style={{ margin: "0 0 14px", color: "#f8fafc" }}>Profile</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 14, alignItems: "center" }}>
              {avatarPreview ? <img src={avatarPreview} alt="" style={{ width: 96, height: 96, borderRadius: "999px", objectFit: "cover", background: "#1e293b" }} /> : <div style={{ width: 96, height: 96, borderRadius: "999px", background: "#1e293b", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 32 }}>{(form.username || form.full_name || "U").charAt(0).toUpperCase()}</div>}
              <div style={{ display: "grid", gap: 8 }}>
                <label style={labelStyle}>Profile image</label>
                <input type="file" accept="image/*" onChange={handleAvatarFile} style={{ color: "#cbd5e1" }} />
                <input type="text" value={form.avatar_url} onChange={(event) => updateField("avatar_url", event.target.value)} placeholder="Or paste image URL" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              <div><label style={labelStyle}>Username</label><input value={form.username} onChange={(e) => updateField("username", e.target.value)} placeholder="Unique username" style={inputStyle} /></div>
              <div><label style={labelStyle}>Display name</label><input value={form.full_name} onChange={(e) => updateField("full_name", e.target.value)} placeholder="Your name" style={inputStyle} /></div>
              <div><label style={labelStyle}>Email</label><input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="you@example.com" style={inputStyle} /></div>
              <div><label style={labelStyle}>Country</label><input value={form.country} onChange={(e) => updateField("country", e.target.value)} placeholder="Country" style={inputStyle} /></div>
              <div><label style={labelStyle}>Date of birth</label><input type="date" value={form.dob} onChange={(e) => updateField("dob", e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Gender</label><input value={form.gender} onChange={(e) => updateField("gender", e.target.value)} placeholder="Gender" style={inputStyle} /></div>
            </div>

            <div><label style={labelStyle}>Bio</label><textarea value={form.bio} onChange={(e) => updateField("bio", e.target.value)} placeholder="Tell people a little about yourself..." rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 120 }} /></div>
          </div>
        </section>

        <section style={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 20, padding: 18 }}>
          <h2 style={{ margin: "0 0 6px", color: "#f8fafc" }}>Creator page</h2>
          <p style={{ margin: "0 0 14px", color: "#94a3b8" }}>Cover image, tagline and creator bio are part of your main profile now.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {coverPreview ? <div style={{ minHeight: 160, borderRadius: 18, backgroundImage: `url(${coverPreview})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid rgba(148,163,184,0.18)" }} /> : null}
            <div><label style={labelStyle}>Cover image</label><input type="file" accept="image/*" onChange={handleCoverFile} style={{ color: "#cbd5e1", marginBottom: 8 }} /><input value={form.cover_url} onChange={(e) => updateField("cover_url", e.target.value)} placeholder="Or paste cover image URL" style={inputStyle} /></div>
            <div><label style={labelStyle}>Tagline</label><input value={form.creator_tagline} onChange={(e) => updateField("creator_tagline", e.target.value)} placeholder="Crime dramas, hidden gems & brutal finales" style={inputStyle} /></div>
            <div><label style={labelStyle}>Creator niche</label><input value={form.creator_niche} onChange={(e) => updateField("creator_niche", e.target.value)} placeholder="Crime dramas / thrillers / hidden gems" style={inputStyle} /></div>
            <div><label style={labelStyle}>Creator bio</label><textarea value={form.creator_bio} onChange={(e) => updateField("creator_bio", e.target.value)} placeholder="Tell followers why they should follow your TV taste..." rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 120 }} /></div>
          </div>
        </section>

        <section style={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 20, padding: 18 }}>
          <h2 style={{ margin: "0 0 14px", color: "#f8fafc" }}>Links</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <div><label style={labelStyle}>Instagram</label><input value={form.instagram_url} onChange={(e) => updateField("instagram_url", e.target.value)} placeholder="instagram.com/yourname" style={inputStyle} /></div>
            <div><label style={labelStyle}>X / Twitter</label><input value={form.x_url} onChange={(e) => updateField("x_url", e.target.value)} placeholder="x.com/yourname" style={inputStyle} /></div>
            <div><label style={labelStyle}>TikTok</label><input value={form.tiktok_url} onChange={(e) => updateField("tiktok_url", e.target.value)} placeholder="tiktok.com/@yourname" style={inputStyle} /></div>
            <div><label style={labelStyle}>YouTube</label><input value={form.youtube_url} onChange={(e) => updateField("youtube_url", e.target.value)} placeholder="youtube.com/@yourname" style={inputStyle} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>Website</label><input value={form.website_url} onChange={(e) => updateField("website_url", e.target.value)} placeholder="yourwebsite.com" style={inputStyle} /></div>
          </div>
        </section>

        <div style={{ display: "grid", gap: 10 }}>
          <button type="submit" disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Save profile"}</button>
          <button type="button" onClick={handleLogout} style={{ ...secondaryButtonStyle, width: "100%" }}>Log out</button>
        </div>
      </form>
    </main>
  );
}
