import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function getYouTubeVideoId(urlValue) {
  try {
    const url = new URL(normalizeUrl(urlValue));
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/").filter(Boolean)[1] || "";
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/").filter(Boolean)[1] || "";
      return url.searchParams.get("v") || "";
    }
  } catch {
    return "";
  }
  return "";
}

function getTikTokVideoId(urlValue) {
  try {
    const url = new URL(normalizeUrl(urlValue));
    const host = url.hostname.replace(/^www\./, "");
    if (!host.endsWith("tiktok.com")) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    const videoIndex = parts.indexOf("video");
    if (videoIndex >= 0 && parts[videoIndex + 1]) return parts[videoIndex + 1];
  } catch {
    return "";
  }
  return "";
}

function getVideoEmbedInfo(urlValue) {
  const cleanedUrl = normalizeUrl(urlValue);
  if (!cleanedUrl) return null;

  const youtubeId = getYouTubeVideoId(cleanedUrl);
  if (youtubeId) {
    return {
      provider: "youtube",
      url: cleanedUrl,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      label: "YouTube video",
      canEmbed: true,
      needsResolve: false,
    };
  }

  const tiktokId = getTikTokVideoId(cleanedUrl);
  if (tiktokId) {
    return {
      provider: "tiktok",
      url: cleanedUrl,
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokId}`,
      label: "TikTok video",
      canEmbed: true,
      needsResolve: false,
    };
  }

  try {
    const url = new URL(cleanedUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host.endsWith("tiktok.com")) {
      return {
        provider: "tiktok",
        url: cleanedUrl,
        embedUrl: null,
        label: "TikTok video",
        canEmbed: false,
        needsResolve: true,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveTikTokEmbedInfo(urlValue) {
  const cleanedUrl = normalizeUrl(urlValue);
  if (!cleanedUrl) return null;

  const directInfo = getVideoEmbedInfo(cleanedUrl);
  if (!directInfo || directInfo.provider !== "tiktok") return directInfo;
  if (directInfo.canEmbed) return directInfo;

  try {
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanedUrl)}`);
    if (!response.ok) return directInfo;
    const data = await response.json();
    const html = String(data?.html || "");
    const videoId =
      html.match(/data-video-id=["'](\d+)["']/)?.[1] ||
      html.match(/\/video\/(\d+)/)?.[1] ||
      html.match(/embed\/v2\/(\d+)/)?.[1];
    if (!videoId) return directInfo;
    return {
      provider: "tiktok",
      url: cleanedUrl,
      embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
      label: "TikTok video",
      canEmbed: true,
      needsResolve: false,
    };
  } catch (err) {
    console.warn("Failed to resolve TikTok short link:", err);
    return directInfo;
  }
}

async function uploadCreatorPostImage(userId, file) {
  if (!file) return null;
  const safeExtension =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExtension}`;
  const { error: uploadError } = await supabase.storage
    .from("creator-posts")
    .upload(filePath, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("creator-posts").getPublicUrl(filePath);
  return data?.publicUrl || null;
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

export default function CreatorPostEditor() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postType, setPostType] = useState("post");
  const [postVideoUrl, setPostVideoUrl] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoResolving, setVideoResolving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadUser() {
      const { data: authData, error: userError } = await supabase.auth.getUser();
      const user = authData?.user || null;
      if (!active) return;
      if (userError || !user) {
        navigate("/login", { replace: true });
        return;
      }
      setCurrentUser(user);
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, username, full_name, display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (active) {
        setProfile(profileRow || { id: user.id });
        setChecking(false);
      }
    }
    loadUser();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    async function prepareVideoPreview() {
      const trimmed = postVideoUrl.trim();
      if (!trimmed) {
        setVideoPreview(null);
        setVideoResolving(false);
        return;
      }
      const basicInfo = getVideoEmbedInfo(trimmed);
      setVideoPreview(basicInfo);
      if (!basicInfo?.needsResolve) {
        setVideoResolving(false);
        return;
      }
      setVideoResolving(true);
      const resolvedInfo = await resolveTikTokEmbedInfo(trimmed);
      if (!cancelled) {
        setVideoPreview(resolvedInfo);
        setVideoResolving(false);
      }
    }
    prepareVideoPreview();
    return () => {
      cancelled = true;
    };
  }, [postVideoUrl]);

  function handleImageSelect(event) {
    const file = event.target.files?.[0] || null;
    setSelectedImageFile(file);
    setError("");
    setMessage("");
    setImagePreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  function clearImage() {
    setSelectedImageFile(null);
    setImagePreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return "";
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const hasTitle = Boolean(postTitle.trim());
    const hasBody = Boolean(postBody.trim());
    const hasVideo = Boolean(postVideoUrl.trim());
    const hasImage = Boolean(selectedImageFile);
    if (!hasTitle && !hasBody && !hasVideo && !hasImage) {
      setError("Add some text, an image, or a video before publishing.");
      return;
    }
    if (hasVideo && hasImage) {
      setError("Choose either a video or an image for this post, not both.");
      return;
    }
    setPosting(true);
    setError("");
    setMessage("");
    try {
      if (!currentUser?.id) throw new Error("You must be logged in.");
      const videoInfo = hasVideo ? await resolveTikTokEmbedInfo(postVideoUrl) : null;
      if (hasVideo && !videoInfo) throw new Error("Please enter a valid YouTube or TikTok link.");
      if (hasVideo && !videoInfo?.canEmbed) {
        throw new Error("This TikTok link could not be embedded. Open the TikTok link, tap Share, copy the full video link, and try again.");
      }
      const imageUrl = hasImage ? await uploadCreatorPostImage(currentUser.id, selectedImageFile) : null;
      const { error: postError } = await supabase.from("creator_posts").insert({
        user_id: currentUser.id,
        title: postTitle.trim() || null,
        body: postBody.trim() || null,
        post_type: postType,
        visibility: "public",
        video_url: videoInfo?.url || null,
        video_provider: videoInfo?.provider || null,
        video_embed_url: videoInfo?.embedUrl || null,
        image_url: imageUrl,
      });
      if (postError) throw postError;
      setPostTitle("");
      setPostBody("");
      setPostType("post");
      setPostVideoUrl("");
      clearImage();
      setMessage("Creator post published.");
    } catch (err) {
      console.error("Failed creating creator post:", err);
      setError(err.message || "Failed creating creator post.");
    } finally {
      setPosting(false);
    }
  }

  if (checking) return <main className="page"><p className="creator-muted">Loading post editor...</p></main>;

  const profileHref = profile?.username ? `/u/${encodeURIComponent(profile.username)}` : "/profile/edit";

  return (
    <main className="page profile-edit-page">
      <div className="page-header profile-edit-header" style={{ marginBottom: 18 }}>
        <h1>Create Post</h1>
        <p>Share a post with people who follow your creator page.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <Link to={profileHref} className="creator-btn creator-btn-secondary">Creator page</Link>
          <Link to="/creator/lists/new" className="creator-btn creator-btn-secondary">Create list</Link>
          <Link to="/profile/edit" className="creator-btn creator-btn-secondary">Edit profile</Link>
        </div>
      </div>

      {error ? <div style={{ maxWidth: 860, marginBottom: 16, padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.12)", color: "#fecaca", border: "1px solid rgba(239,68,68,0.25)" }}>{error}</div> : null}
      {message ? <div style={{ maxWidth: 860, marginBottom: 16, padding: 12, borderRadius: 12, background: "rgba(34,197,94,0.12)", color: "#bbf7d0", border: "1px solid rgba(34,197,94,0.25)" }}>{message}</div> : null}

      <section style={{ maxWidth: 860, background: "#0f172a", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 20, padding: 18 }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Post type</label>
            <select value={postType} onChange={(event) => setPostType(event.target.value)} style={inputStyle}>
              <option value="post">Post</option>
              <option value="hot_take">Hot take</option>
              <option value="recommendation">Recommendation</option>
              <option value="tonights_pick">Tonight&apos;s pick</option>
              <option value="watchlist_advice">Watchlist advice</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Title</label>
            <input type="text" value={postTitle} onChange={(event) => setPostTitle(event.target.value)} placeholder="Optional title" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>YouTube or TikTok link</label>
            <input type="text" value={postVideoUrl} onChange={(event) => setPostVideoUrl(event.target.value)} placeholder="Optional video link" style={inputStyle} />
          </div>
          {postVideoUrl.trim() ? (
            videoResolving ? <p style={{ margin: 0, color: "#c4b5fd", fontSize: 13, fontWeight: 700 }}>Resolving TikTok embed...</p> :
            videoPreview?.canEmbed ? (
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(148,163,184,0.18)", background: "#020617" }}>
                <iframe title={videoPreview.label} src={videoPreview.embedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen style={{ display: "block", width: "100%", aspectRatio: videoPreview.provider === "tiktok" ? "9 / 16" : "16 / 9", border: "none" }} />
              </div>
            ) : <p style={{ margin: 0, color: "#fecaca", fontSize: 13 }}>Paste a valid YouTube or TikTok link.</p>
          ) : null}
          <div style={{ display: "grid", gap: 8 }}>
            <label style={labelStyle}>Image for non-video posts</label>
            <input type="file" accept="image/*" onChange={handleImageSelect} disabled={posting || Boolean(postVideoUrl.trim())} style={{ color: "#cbd5e1" }} />
            {postVideoUrl.trim() ? <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>Remove the video link if you want to attach an image instead.</p> : null}
            {imagePreviewUrl ? (
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(148,163,184,0.18)", background: "#020617" }}>
                <img src={imagePreviewUrl} alt="Post preview" style={{ display: "block", width: "100%", maxHeight: 360, objectFit: "cover" }} />
                <button type="button" onClick={clearImage} disabled={posting} style={{ width: "100%", padding: "10px 12px", border: "none", background: "rgba(239,68,68,0.18)", color: "#fecaca", fontWeight: 800, cursor: "pointer" }}>Remove image</button>
              </div>
            ) : null}
          </div>
          <div>
            <label style={labelStyle}>Post</label>
            <textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder="What do you want to share?" rows={6} style={{ ...inputStyle, resize: "vertical", minHeight: 140 }} />
          </div>
          <button type="submit" disabled={posting} style={primaryButtonStyle}>{posting ? "Publishing..." : "Publish Post"}</button>
        </form>
      </section>
    </main>
  );
}
