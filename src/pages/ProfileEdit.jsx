import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export default function ProfileEdit() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    username: "",
    full_name: "",
    avatar_url: "",
    avatar_zoom: 1,
    avatar_x: 50,
    avatar_y: 50,
    dob: "",
    gender: "",
    country: "",
    bio: "",
    instagram_url: "",
    x_url: "",
    tiktok_url: "",
    youtube_url: "",
    website_url: "",
  });

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          navigate("/login");
          return;
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(`
            id,
            username,
            full_name,
            avatar_url,
            avatar_zoom,
            avatar_x,
            avatar_y,
            dob,
            gender,
            country,
            bio,
            instagram_url,
            x_url,
            tiktok_url,
            youtube_url,
            website_url
          `)
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (data) {
          setForm({
            username: data.username || "",
            full_name: data.full_name || "",
            avatar_url: data.avatar_url || "",
            avatar_zoom: Number(data.avatar_zoom ?? 1),
            avatar_x: Number(data.avatar_x ?? 50),
            avatar_y: Number(data.avatar_y ?? 50),
            dob: data.dob || "",
            gender: data.gender || "",
            country: data.country || "",
            bio: data.bio || "",
            instagram_url: data.instagram_url || "",
            x_url: data.x_url || "",
            tiktok_url: data.tiktok_url || "",
            youtube_url: data.youtube_url || "",
            website_url: data.website_url || "",
          });
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        setError(err.message || "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [navigate]);

  function updateField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in.");

      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
      const filePath = `${user.id}/avatar-${Date.now()}.${safeExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl || "";

      if (!publicUrl) {
        throw new Error("Could not get uploaded image URL.");
      }

      setForm((prev) => ({
        ...prev,
        avatar_url: publicUrl,
      }));

      setMessage("Image uploaded. Save profile to keep changes.");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setError(err.message || "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in.");

      const cleanedUsername = form.username.trim();
      const cleanedFullName = form.full_name.trim();
      const cleanedCountry = form.country.trim();
      const cleanedBio = form.bio.trim();

      const payload = {
        id: user.id,
        username: cleanedUsername || null,
        full_name: cleanedFullName || null,
        avatar_url: form.avatar_url.trim() || null,
        avatar_zoom: Number(form.avatar_zoom) || 1,
        avatar_x: Number(form.avatar_x) || 50,
        avatar_y: Number(form.avatar_y) || 50,
        dob: form.dob || null,
        gender: form.gender.trim() || null,
        country: cleanedCountry || null,
        bio: cleanedBio || null,
        instagram_url: normalizeUrl(form.instagram_url) || null,
        x_url: normalizeUrl(form.x_url) || null,
        tiktok_url: normalizeUrl(form.tiktok_url) || null,
        youtube_url: normalizeUrl(form.youtube_url) || null,
        website_url: normalizeUrl(form.website_url) || null,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(payload);

      if (upsertError) {
        if (
          upsertError.message?.toLowerCase().includes("duplicate") ||
          upsertError.message?.toLowerCase().includes("unique")
        ) {
          throw new Error("That username is already taken.");
        }

        throw upsertError;
      }

      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Edit Profile</h1>
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>Edit Profile</h1>
        <p>Update your photo, name, bio, and socials.</p>
      </div>

      <div
        style={{
          maxWidth: 860,
          background: "#0f172a",
          border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: 20,
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <Link
            to="/dashboard"
            style={{
              color: "#a78bfa",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            ← Back to Dashboard
          </Link>
        </div>

        {error ? (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 12,
              background: "rgba(239,68,68,0.12)",
              color: "#fecaca",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            {error}
          </div>
        ) : null}

        {message ? (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 12,
              background: "rgba(34,197,94,0.12)",
              color: "#bbf7d0",
              border: "1px solid rgba(34,197,94,0.25)",
            }}
          >
            {message}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 20,
              alignItems: "start",
              marginBottom: 24,
            }}
          >
            <div>
              {form.avatar_url ? (
                <div
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: "999px",
                    overflow: "hidden",
                    background: "#111827",
                    position: "relative",
                  }}
                >
                  <img
                    src={form.avatar_url}
                    alt="Profile"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: `${form.avatar_x}% ${form.avatar_y}%`,
                      transform: `scale(${form.avatar_zoom})`,
                      transformOrigin: "center center",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: "999px",
                    background: "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 36,
                    fontWeight: 800,
                    color: "#fff",
                  }}
                >
                  {(form.username || form.full_name || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "#f8fafc",
                }}
              >
                Profile image
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading || saving}
                style={{ color: "#cbd5e1" }}
              />

              <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 14 }}>
                {uploading ? "Uploading image..." : "PNG, JPG, WEBP supported."}
              </div>

              {form.avatar_url ? (
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>
                      Zoom: {Number(form.avatar_zoom).toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="2.5"
                      step="0.01"
                      value={form.avatar_zoom}
                      onChange={(e) =>
                        updateField("avatar_zoom", Number(e.target.value))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>
                      Horizontal Position: {form.avatar_x}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={form.avatar_x}
                      onChange={(e) =>
                        updateField("avatar_x", Number(e.target.value))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Vertical Position: {form.avatar_y}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={form.avatar_y}
                      onChange={(e) =>
                        updateField("avatar_y", Number(e.target.value))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                placeholder="Unique username"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Display name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                placeholder="Your name"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Date of birth</label>
              <input
                type="date"
                value={form.dob}
                onChange={(e) => updateField("dob", e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Gender</label>
              <input
                type="text"
                value={form.gender}
                onChange={(e) => updateField("gender", e.target.value)}
                placeholder="Gender"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => updateField("country", e.target.value)}
                placeholder="Country"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => updateField("bio", e.target.value)}
              placeholder="Tell people a little about yourself..."
              rows={5}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 120,
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <label style={labelStyle}>Instagram</label>
              <input
                type="text"
                value={form.instagram_url}
                onChange={(e) => updateField("instagram_url", e.target.value)}
                placeholder="instagram.com/yourname"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>X / Twitter</label>
              <input
                type="text"
                value={form.x_url}
                onChange={(e) => updateField("x_url", e.target.value)}
                placeholder="x.com/yourname"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>TikTok</label>
              <input
                type="text"
                value={form.tiktok_url}
                onChange={(e) => updateField("tiktok_url", e.target.value)}
                placeholder="tiktok.com/@yourname"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>YouTube</label>
              <input
                type="text"
                value={form.youtube_url}
                onChange={(e) => updateField("youtube_url", e.target.value)}
                placeholder="youtube.com/@yourname"
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Website</label>
              <input
                type="text"
                value={form.website_url}
                onChange={(e) => updateField("website_url", e.target.value)}
                placeholder="yourwebsite.com"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={saving || uploading}
              style={primaryButtonStyle}
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>

            <Link to="/dashboard" style={secondaryLinkStyle}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontWeight: 700,
  color: "#f8fafc",
};

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #26324a",
  background: "#182235",
  color: "#f8fafc",
  fontSize: "1rem",
  outline: "none",
  boxSizing: "border-box",
};

const primaryButtonStyle = {
  padding: "12px 18px",
  borderRadius: 14,
  border: "none",
  background: "#6366f1",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  borderRadius: 14,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f8fafc",
  fontWeight: 700,
  textDecoration: "none",
};
Need respond with corrected concise. Mention delete line and ensure two separate files. Could mention their ProfileEdit has Dashboard appended. Provide replacement? maybe enough. Since they asked with build error maybe not asking for full again. Let's answer pointing exact corrupted marker and that they need to overwrite both. Since they already have clean content in tool result maybe just brief. Include citations.
