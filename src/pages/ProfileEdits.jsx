import { useEffect, useMemo, useRef, useState } from "react";
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDobForInput(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [day, month, year] = value.split("-");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function distanceBetweenTouches(touchA, touchB) {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

async function buildCroppedAvatarDataUrl(imageSrc, zoom, offsetX, offsetY) {
  const img = await loadImage(imageSrc);

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare avatar image.");
  }

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.translate(size / 2 + offsetX * (size / 200), size / 2 + offsetY * (size / 200));
  ctx.scale(zoom, zoom);

  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.9);
}

async function fetchCommentHistory(userId) {
  const { data: comments, error } = await supabase
    .from("rankd_matchup_comments")
    .select("id, matchup_id, parent_comment_id, body, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;

  const rows = comments || [];
  const matchupIds = rows.map((row) => row.matchup_id).filter(Boolean);

  if (!matchupIds.length) {
    return rows.map((comment) => ({ ...comment, matchup: null }));
  }

  try {
    const { data: matchups, error: matchupError } = await supabase
      .from("rankd_matchups")
      .select("id, pair_key, show_a_id, show_b_id")
      .in("id", matchupIds);

    if (matchupError) throw matchupError;

    const showIds = Array.from(
      new Set(
        (matchups || [])
          .flatMap((matchup) => [matchup.show_a_id, matchup.show_b_id])
          .filter(Boolean)
      )
    );

    let showMap = new Map();

    if (showIds.length) {
      const { data: shows, error: showsError } = await supabase
        .from("shows")
        .select("id, name")
        .in("id", showIds);

      if (showsError) throw showsError;

      showMap = new Map(
        (shows || []).map((show) => [String(show.id), show.name])
      );
    }

    const matchupMap = new Map(
      (matchups || []).map((matchup) => [
        String(matchup.id),
        {
          ...matchup,
          showAName: showMap.get(String(matchup.show_a_id)) || "Show A",
          showBName: showMap.get(String(matchup.show_b_id)) || "Show B",
        },
      ])
    );

    return rows.map((comment) => ({
      ...comment,
      matchup: matchupMap.get(String(comment.matchup_id)) || null,
    }));
  } catch (err) {
    console.error("Failed hydrating Rank'd comment history:", err);
    return rows.map((comment) => ({ ...comment, matchup: null }));
  }
}

async function fetchReviewHistory(userId) {
  const { data: reviews, error } = await supabase
    .from("show_reviews")
    .select("id, show_id, parent_id, body, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;

  const rows = reviews || [];
  const showIds = Array.from(
    new Set(rows.map((row) => row.show_id).filter(Boolean))
  );

  if (!showIds.length) {
    return rows.map((review) => ({ ...review, show: null, burgr_rating: null }));
  }

  try {
    const { data: shows, error: showsError } = await supabase
      .from("shows")
      .select("id, tvdb_id, tmdb_id, name, first_aired")
      .in("id", showIds);

    if (showsError) throw showsError;

    const showMap = new Map(
      (shows || []).map((show) => [String(show.id), show])
    );

    const { data: ratingRows, error: ratingError } = await supabase
      .from("burgr_ratings")
      .select("show_id, rating")
      .eq("user_id", userId)
      .in("show_id", showIds);

    if (ratingError) throw ratingError;

    const ratingMap = new Map(
      (ratingRows || []).map((rating) => [
        String(rating.show_id),
        rating.rating,
      ])
    );

    return rows.map((review) => ({
      ...review,
      show: showMap.get(String(review.show_id)) || null,
      burgr_rating: ratingMap.get(String(review.show_id)) ?? null,
    }));
  } catch (err) {
    console.error("Failed hydrating review history:", err);
    return rows.map((review) => ({ ...review, show: null, burgr_rating: null }));
  }
}

export default function ProfileEdit() {
  const navigate = useNavigate();
  const previewRef = useRef(null);
  const dragStateRef = useRef(null);
  const pinchStateRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState("comments");
  const [commentHistory, setCommentHistory] = useState([]);
  const [reviewHistory, setReviewHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 640;
  });

  const [selectedAvatarDataUrl, setSelectedAvatarDataUrl] = useState("");
  const [existingAvatarUrl, setExistingAvatarUrl] = useState("");

  const [form, setForm] = useState({
    username: "",
    full_name: "",
    avatar_zoom: 1,
    avatar_x: 0,
    avatar_y: 0,
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

  const previewAvatarUrl = useMemo(() => {
    return selectedAvatarDataUrl || existingAvatarUrl || "";
  }, [selectedAvatarDataUrl, existingAvatarUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const handleChange = (event) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

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
          setExistingAvatarUrl(data.avatar_url || "");

          setForm({
            username: data.username || "",
            full_name: data.full_name || "",
            avatar_zoom: Number(data.avatar_zoom ?? 1),
            avatar_x: Number(data.avatar_x ?? 0),
            avatar_y: Number(data.avatar_y ?? 0),
            dob: formatDobForInput(data.dob),
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

        setHistoryLoading(true);
        try {
          const commentRows = await fetchCommentHistory(user.id);
          setCommentHistory(commentRows);
        } catch (historyError) {
          console.error("Failed loading Rank'd comment history:", historyError);
          setCommentHistory([]);
        }

        try {
          const reviewRows = await fetchReviewHistory(user.id);
          setReviewHistory(reviewRows);
        } catch (historyError) {
          console.error("Failed loading review history:", historyError);
          setReviewHistory([]);
        } finally {
          setHistoryLoading(false);
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

  async function handleImageSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setMessage("");

    try {
      const dataUrl = await fileToDataUrl(file);

      setSelectedAvatarDataUrl(dataUrl);
      setForm((prev) => ({
        ...prev,
        avatar_zoom: 1,
        avatar_x: 0,
        avatar_y: 0,
      }));

      setMessage("Image selected. Drag to move it. Pinch on mobile to zoom, then save.");
    } catch (err) {
      console.error("Failed to select image:", err);
      setError(err.message || "Failed to load selected image.");
    }
  }

  function handlePointerDown(event) {
    if (!previewAvatarUrl || !previewRef.current) return;

    event.preventDefault();

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startAvatarX: form.avatar_x,
      startAvatarY: form.avatar_y,
    };

    setIsDragging(true);
  }

  function handlePointerMove(event) {
    if (!dragStateRef.current || !previewRef.current) return;
    if (dragStateRef.current.pointerId !== event.pointerId) return;

    const rect = previewRef.current.getBoundingClientRect();
    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;

    const scaledWidth = rect.width * form.avatar_zoom;
    const scaledHeight = rect.height * form.avatar_zoom;

    const maxOffsetX = Math.max(0, (scaledWidth - rect.width) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - rect.height) / 2);

    const nextX = dragStateRef.current.startAvatarX + deltaX;
    const nextY = dragStateRef.current.startAvatarY + deltaY;

    setForm((prev) => ({
      ...prev,
      avatar_x: clamp(nextX, -maxOffsetX, maxOffsetX),
      avatar_y: clamp(nextY, -maxOffsetY, maxOffsetY),
    }));
  }

  function endPointerDrag(event) {
    if (!dragStateRef.current) return;
    if (event && dragStateRef.current.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handleWheel(event) {
    if (!previewAvatarUrl || !previewRef.current) return;

    event.preventDefault();

    const rect = previewRef.current.getBoundingClientRect();
    const nextZoom = clamp(
      Number((form.avatar_zoom + (event.deltaY > 0 ? -0.08 : 0.08)).toFixed(2)),
      1,
      4
    );

    const scaledWidth = rect.width * nextZoom;
    const scaledHeight = rect.height * nextZoom;

    const maxOffsetX = Math.max(0, (scaledWidth - rect.width) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - rect.height) / 2);

    setForm((prev) => ({
      ...prev,
      avatar_zoom: nextZoom,
      avatar_x: clamp(prev.avatar_x, -maxOffsetX, maxOffsetX),
      avatar_y: clamp(prev.avatar_y, -maxOffsetY, maxOffsetY),
    }));
  }

  function handleTouchStart(event) {
    if (!previewAvatarUrl) return;
    if (event.touches.length !== 2) return;

    const distance = distanceBetweenTouches(event.touches[0], event.touches[1]);

    pinchStateRef.current = {
      startDistance: distance,
      startZoom: form.avatar_zoom,
    };
  }

  function handleTouchMove(event) {
    if (!previewAvatarUrl || !previewRef.current) return;

    if (event.touches.length === 2 && pinchStateRef.current) {
      event.preventDefault();

      const rect = previewRef.current.getBoundingClientRect();
      const distance = distanceBetweenTouches(event.touches[0], event.touches[1]);
      const zoomRatio = distance / pinchStateRef.current.startDistance;
      const nextZoom = clamp(
        Number((pinchStateRef.current.startZoom * zoomRatio).toFixed(2)),
        1,
        4
      );

      const scaledWidth = rect.width * nextZoom;
      const scaledHeight = rect.height * nextZoom;

      const maxOffsetX = Math.max(0, (scaledWidth - rect.width) / 2);
      const maxOffsetY = Math.max(0, (scaledHeight - rect.height) / 2);

      setForm((prev) => ({
        ...prev,
        avatar_zoom: nextZoom,
        avatar_x: clamp(prev.avatar_x, -maxOffsetX, maxOffsetX),
        avatar_y: clamp(prev.avatar_y, -maxOffsetY, maxOffsetY),
      }));
    }
  }

  function handleTouchEnd() {
    pinchStateRef.current = null;
  }

  async function saveProfileRow(userId, payload) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select("id");

    if (updateError) throw updateError;

    if (updatedRows && updatedRows.length > 0) {
      return;
    }

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

      let avatarUrlToSave = existingAvatarUrl || null;

      if (previewAvatarUrl) {
        avatarUrlToSave = await buildCroppedAvatarDataUrl(
          previewAvatarUrl,
          Number(form.avatar_zoom) || 1,
          Number(form.avatar_x) || 0,
          Number(form.avatar_y) || 0
        );
      }

      const payload = {
        username: cleanedUsername || null,
        full_name: cleanedFullName || null,
        avatar_url: avatarUrlToSave,
        avatar_zoom: 1,
        avatar_x: 0,
        avatar_y: 0,
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

      await saveProfileRow(user.id, payload);

      setExistingAvatarUrl(avatarUrlToSave || "");
      setSelectedAvatarDataUrl("");
      setMessage("Profile updated.");

      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError(err.message || "Failed to save profile.");
      alert(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setError("");
    setMessage("");

    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      setError(logoutError.message || "Failed to log out.");
      return;
    }

    navigate("/login", { replace: true });
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
    <div className="page profile-edit-page">
      <div className="page-header profile-edit-header" style={{ marginBottom: isMobile ? 18 : 24 }}>
        <h1>Edit Profile</h1>
        <p>Update your photo, name, bio, and socials.</p>
      </div>

      <div
        className="profile-edit-card"
        style={{
          maxWidth: 860,
          background: "#0f172a",
          border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: 20,
          padding: isMobile ? 16 : 24,
        }}
      >

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

        <form onSubmit={handleSubmit} className="profile-edit-form">
          <div
            className="profile-edit-top-grid"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "220px 1fr",
              gap: isMobile ? 16 : 24,
              alignItems: "start",
              marginBottom: 24,
            }}
          >
            <div className="profile-edit-avatar-column">
              {previewAvatarUrl ? (
                <>
                  <div
                    ref={previewRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endPointerDrag}
                    onPointerCancel={endPointerDrag}
                    onWheel={handleWheel}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="profile-edit-avatar-preview"
                    style={{
                      width: isMobile ? 180 : 200,
                      height: isMobile ? 180 : 200,
                      borderRadius: "999px",
                      overflow: "hidden",
                      position: "relative",
                      cursor: isDragging ? "grabbing" : "grab",
                      userSelect: "none",
                      touchAction: "none",
                      border: "1px solid rgba(148,163,184,0.25)",
                      backgroundColor: "#e5e7eb",
                      backgroundImage:
                        "linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)",
                      backgroundSize: "20px 20px",
                      backgroundPosition:
                        "0 0, 0 10px, 10px -10px, -10px 0px",
                    }}
                  >
                    <img
                      src={previewAvatarUrl}
                      alt="Profile preview"
                      draggable={false}
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: `translate(calc(-50% + ${form.avatar_x}px), calc(-50% + ${form.avatar_y}px)) scale(${form.avatar_zoom})`,
                        transformOrigin: "center",
                        display: "block",
                        pointerEvents: "none",
                      }}
                    />
                  </div>

                  <div className="profile-edit-avatar-help" style={{ marginTop: 10, color: "#94a3b8", fontSize: 13 }}>
                    Drag to move. On mobile pinch with two fingers to zoom. On desktop use mouse wheel.
                  </div>
                </>
              ) : (
                <div
                  className="profile-edit-avatar-placeholder"
                  style={{
                    width: isMobile ? 180 : 200,
                    height: isMobile ? 180 : 200,
                    borderRadius: "999px",
                    background: "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 64,
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

            <div className="profile-edit-image-controls">
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
                className="profile-edit-file-input"
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                disabled={saving}
                style={{ color: "#cbd5e1" }}
              />

              <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 14 }}>
                PNG, JPG, WEBP supported.
              </div>
            </div>
          </div>

          <div
            className="profile-edit-fields-grid"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
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
            className="profile-edit-socials-grid"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
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

          <div className="profile-edit-actions" style={{ display: "flex", gap: 12, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
            <button
              type="submit"
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>

            <Link to="/dashboard" style={secondaryLinkStyle}>
              Cancel
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              disabled={saving}
              style={dangerButtonStyle}
            >
              Logout
            </button>
          </div>
        </form>
      </div>

      <section
        className="profile-comment-history-card"
        style={{
          maxWidth: 860,
          marginTop: 24,
          padding: isMobile ? 16 : 24,
          borderRadius: 20,
          border: "1px solid rgba(148,163,184,0.15)",
          background: "#0f172a",
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 22 }}>
            Profile History
          </h2>
          <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>
            View your Rank'd comments and show reviews in separate tabs.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveHistoryTab("comments")}
            style={historyTabStyle(activeHistoryTab === "comments")}
          >
            Comments ({commentHistory.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveHistoryTab("reviews")}
            style={historyTabStyle(activeHistoryTab === "reviews")}
          >
            Reviews ({reviewHistory.length})
          </button>
        </div>

        {historyLoading ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Loading history...</p>
        ) : activeHistoryTab === "comments" ? (
          commentHistory.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {commentHistory.map((comment) => {
                const matchup = comment.matchup;
                const targetUrl = matchup?.pair_key
                  ? `/rankd?matchup=${encodeURIComponent(
                      matchup.pair_key
                    )}&comment=${encodeURIComponent(comment.id)}`
                  : "/rankd";

                return (
                  <Link key={comment.id} to={targetUrl} style={historyItemStyle}>
                    <strong style={{ color: "#c4b5fd" }}>
                      {matchup
                        ? `${matchup.showAName} vs ${matchup.showBName}`
                        : "Rank'd matchup"}
                    </strong>

                    <p style={{ margin: "8px 0 0", color: "#e2e8f0" }}>
                      {comment.body}
                    </p>

                    <small style={{ color: "#94a3b8" }}>
                      {new Date(comment.created_at).toLocaleString()}
                    </small>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "#94a3b8", margin: 0 }}>
              You have not posted any Rank'd comments yet.
            </p>
          )
        ) : reviewHistory.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {reviewHistory.map((review) => {
              const show = review.show;
              const year = show?.first_aired?.slice?.(0, 4) || "";
              const reviewUrl = show?.tvdb_id
                ? `/my-shows/${show.tvdb_id}`
                : show?.tmdb_id
                  ? `/my-shows/tmdb/${show.tmdb_id}`
                  : "/my-shows";

              return (
                <Link
                  key={review.id}
                  to={reviewUrl}
                  style={historyItemStyle}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <strong style={{ color: "#c4b5fd" }}>
                      {show?.name || "Show review"}{year ? ` (${year})` : ""}
                    </strong>

                    {review.burgr_rating != null ? (
                      <span style={historyBadgeStyle}>
                        {Number(review.burgr_rating)}/10
                      </span>
                    ) : null}

                    {review.parent_id ? (
                      <div style={historyBadgeStyle}>Reply</div>
                    ) : null}
                  </div>

                  <p style={{ margin: "8px 0 0", color: "#e2e8f0" }}>
                    {review.body}
                  </p>

                  <small style={{ color: "#94a3b8" }}>
                    {new Date(review.created_at).toLocaleString()}
                  </small>
                </Link>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "#94a3b8", margin: 0 }}>
            You have not posted any show reviews yet.
          </p>
        )}
      </section>
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


const historyItemStyle = {
  display: "block",
  padding: 14,
  borderRadius: 14,
  border: "1px solid #26324a",
  background: "#182235",
  color: "#f8fafc",
  textDecoration: "none",
};

const historyBadgeStyle = {
  display: "inline-flex",
  width: "fit-content",
  marginTop: 8,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(99,102,241,0.15)",
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 800,
};

function historyTabStyle(isActive) {
  return {
    padding: "10px 14px",
    borderRadius: 999,
    border: isActive ? "1px solid #818cf8" : "1px solid #334155",
    background: isActive ? "#4f46e5" : "#182235",
    color: "#f8fafc",
    fontWeight: 800,
    cursor: "pointer",
  };
}

const dangerButtonStyle = {
  padding: "12px 18px",
  borderRadius: 14,
  border: "1px solid #7f1d1d",
  background: "#991b1b",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
