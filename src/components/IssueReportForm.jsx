import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./IssueReportForm.css";

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function createReportId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function safeFileName(fileName, fallbackExtension = "jpg") {
  const rawName = String(fileName || "screenshot");
  const extension =
    (rawName.split(".").pop() || fallbackExtension)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || fallbackExtension;
  const baseName = rawName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "screenshot";

  return `${baseName}.${extension}`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IssueReportForm() {
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [screenshots, setScreenshots] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const previewItems = useMemo(
    () =>
      screenshots.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    [screenshots]
  );

  useEffect(() => {
    return () => {
      previewItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [previewItems]);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data?.user?.email || "");
    });

    return () => {
      active = false;
    };
  }, []);

  function handleScreenshotSelection(event) {
    const chosenFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (!chosenFiles.length) return;

    setError("");
    setMessage("");

    const nextFiles = [];

    for (const file of chosenFiles) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setError("Screenshots must be JPG, PNG, WEBP or GIF images.");
        continue;
      }

      if (file.size > MAX_SCREENSHOT_BYTES) {
        setError(`${file.name} is larger than 5 MB.`);
        continue;
      }

      nextFiles.push(file);
    }

    setScreenshots((current) =>
      [...current, ...nextFiles].slice(0, MAX_SCREENSHOTS)
    );
  }

  function removeScreenshot(indexToRemove) {
    if (submitting) return;
    setScreenshots((current) =>
      current.filter((_, index) => index !== indexToRemove)
    );
  }

  async function uploadScreenshots(userId, reportId) {
    const uploadedPaths = [];

    for (let index = 0; index < screenshots.length; index += 1) {
      const file = screenshots[index];
      const filePath = `${userId}/${reportId}/${index + 1}-${safeFileName(
        file.name
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("issue-screenshots")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;
      uploadedPaths.push(filePath);
    }

    return uploadedPaths;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanedSubject = subject.trim();
    const cleanedDescription = description.trim();
    const cleanedEmail = email.trim();

    if (!cleanedSubject) {
      setError("Please add a short subject for the issue.");
      return;
    }

    if (cleanedDescription.length < 10) {
      setError("Please describe the issue in a little more detail.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    let uploadedPaths = [];

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const user = authData?.user || null;
      if (!user?.id) throw new Error("You must be logged in to report an issue.");

      const reportId = createReportId();
      uploadedPaths = await uploadScreenshots(user.id, reportId);

      const { error: reportError } = await supabase.from("issue_reports").insert({
        id: reportId,
        user_id: user.id,
        email: cleanedEmail || user.email || null,
        category,
        subject: cleanedSubject,
        description: cleanedDescription,
        steps_to_reproduce: steps.trim() || null,
        screenshot_paths: uploadedPaths,
        page_url: window.location.href,
        user_agent: navigator.userAgent || null,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        status: "open",
      });

      if (reportError) throw reportError;

      setCategory("bug");
      setSubject("");
      setDescription("");
      setSteps("");
      setScreenshots([]);
      setMessage("Your report has been sent. Thank you for helping improve BURGRS.");
    } catch (err) {
      if (uploadedPaths.length) {
        await supabase.storage
          .from("issue-screenshots")
          .remove(uploadedPaths)
          .catch(() => {});
      }

      console.error("Failed submitting issue report:", err);
      setError(
        err.message || "Your report could not be sent. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="issue-report-section" aria-labelledby="issue-report-title">
      <div className="issue-report-heading">
        <div>
          <h2 id="issue-report-title">Report an issue</h2>
          <p>Tell us what went wrong. Screenshots make problems much easier to fix.</p>
        </div>
        <span className="issue-report-icon" aria-hidden="true">!</span>
      </div>

      {error ? <div className="issue-report-alert is-error">{error}</div> : null}
      {message ? <div className="issue-report-alert is-success">{message}</div> : null}

      <form className="issue-report-form" onSubmit={handleSubmit}>
        <div className="issue-report-grid">
          <label>
            <span>Issue type</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={submitting}
            >
              <option value="bug">Something is not working</option>
              <option value="content">Incorrect show or episode information</option>
              <option value="account">Account or login problem</option>
              <option value="suggestion">Feature suggestion</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            <span>Contact email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={submitting}
            />
          </label>
        </div>

        <label>
          <span>Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Example: Episodes are not marking as watched"
            maxLength={140}
            disabled={submitting}
          />
        </label>

        <label>
          <span>What happened?</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe what you expected to happen and what happened instead."
            rows={6}
            maxLength={3000}
            disabled={submitting}
          />
        </label>

        <label>
          <span>Steps to reproduce <small>(optional)</small></span>
          <textarea
            value={steps}
            onChange={(event) => setSteps(event.target.value)}
            placeholder="1. Open My Shows\n2. Tap a show\n3. Mark an episode as watched"
            rows={4}
            maxLength={2000}
            disabled={submitting}
          />
        </label>

        <div className="issue-report-screenshots">
          <div className="issue-report-screenshot-title">
            <span>Screenshots <small>(optional)</small></span>
            <small>{screenshots.length}/{MAX_SCREENSHOTS}</small>
          </div>

          {screenshots.length < MAX_SCREENSHOTS ? (
            <label className="issue-report-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleScreenshotSelection}
                disabled={submitting}
              />
              <strong>Add screenshots</strong>
              <span>Up to three images, maximum 5 MB each</span>
            </label>
          ) : null}

          {previewItems.length ? (
            <div className="issue-report-preview-grid">
              {previewItems.map((item, index) => (
                <div className="issue-report-preview" key={`${item.file.name}-${item.file.lastModified}-${index}`}>
                  <img src={item.previewUrl} alt={`Screenshot ${index + 1} preview`} />
                  <div>
                    <span>{item.file.name}</span>
                    <small>{formatFileSize(item.file.size)}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeScreenshot(index)}
                    disabled={submitting}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <button className="issue-report-submit" type="submit" disabled={submitting}>
          {submitting ? "Sending report..." : "Send report"}
        </button>
      </form>
    </section>
  );
}
