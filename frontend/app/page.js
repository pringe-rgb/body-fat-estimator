"use client";

import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function FilePicker({ id, label, hint, file, previewUrl, onChange }) {
  return (
    <label className="upload-panel" htmlFor={id}>
      <div className="upload-copy">
        <span className="upload-label">{label}</span>
        <small>{hint}</small>
      </div>
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} />
      {previewUrl ? (
        <div className="preview-frame">
          <img src={previewUrl} alt={`${label} preview`} />
          <strong>{file?.name}</strong>
        </div>
      ) : (
        <div className="empty-preview">
          <span>Upload photo</span>
          <small>Clear full-body shot, same angle and lighting if possible.</small>
        </div>
      )}
    </label>
  );
}

export default function HomePage() {
  const [beforeFile, setBeforeFile] = useState(null);
  const [afterFile, setAfterFile] = useState(null);
  const [beforePreview, setBeforePreview] = useState("");
  const [afterPreview, setAfterPreview] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const updateFile = (setter, previewSetter) => (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setter(selectedFile);
    previewSetter(selectedFile ? URL.createObjectURL(selectedFile) : "");
    setResult(null);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!beforeFile || !afterFile) {
      setError("Please upload both a before photo and an after photo.");
      return;
    }

    const formData = new FormData();
    formData.append("before_file", beforeFile);
    formData.append("after_file", afterFile);

    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/analyze-progress`, {
        method: "POST",
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "Failed to analyze progress photos.");
      }

      setResult(payload);
    } catch (submitError) {
      setError(submitError.message || "Unexpected error while analyzing progress.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="app-card">
        <div className="hero">
          <div>
            <span className="eyebrow">AI Physique Progress Report</span>
            <h1>Track visual body change, not just a shaky body-fat guess.</h1>
          </div>
          <p>
            Upload before and after photos from the same angle. We compare waist line,
            torso taper, and silhouette balance to generate a progress report you can
            actually use week to week.
          </p>
        </div>

        <div className="hero-strip">
          <div>
            <span>Best for</span>
            <strong>cutting, recomposition, bulk check-ins</strong>
          </div>
          <div>
            <span>Input</span>
            <strong>before + after, same angle</strong>
          </div>
          <div>
            <span>Output</span>
            <strong>visual progress signal + change metrics</strong>
          </div>
        </div>

        <form className="compare-form" onSubmit={handleSubmit}>
          <div className="upload-grid">
            <FilePicker
              id="before-photo"
              label="Before"
              hint="Use your earlier check-in photo."
              file={beforeFile}
              previewUrl={beforePreview}
              onChange={updateFile(setBeforeFile, setBeforePreview)}
            />
            <FilePicker
              id="after-photo"
              label="After"
              hint="Use your latest check-in photo."
              file={afterFile}
              previewUrl={afterPreview}
              onChange={updateFile(setAfterFile, setAfterPreview)}
            />
          </div>

          <button className="submit-button" type="submit" disabled={isLoading}>
            {isLoading ? "Analyzing progress..." : "Generate Progress Report"}
          </button>
        </form>

        {error ? <p className="status error">{error}</p> : null}

        {result ? (
          <section className="report-shell">
            <div className="report-hero">
              <div>
                <span className="report-kicker">{result.overall_signal}</span>
                <h2>{result.headline}</h2>
                <p>{result.summary}</p>
              </div>
              <div className="score-card">
                <span>Change Score</span>
                <strong>{result.change_score > 0 ? "+" : ""}{result.change_score}</strong>
                <small>{result.confidence} confidence</small>
              </div>
            </div>

            <div className="metrics-grid">
              {result.metrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.change_percent > 0 ? "+" : ""}{metric.change_percent}%</strong>
                  <p>{metric.summary}</p>
                </article>
              ))}
            </div>

            <div className="snapshot-grid">
              <article className="snapshot-card">
                <span>Before snapshot</span>
                <strong>{result.before_snapshot.view_type} view</strong>
                <p>V-taper {result.before_snapshot.v_taper_ratio}</p>
                <p>Waist/hip {result.before_snapshot.waist_to_hip_ratio}</p>
              </article>
              <article className="snapshot-card">
                <span>After snapshot</span>
                <strong>{result.after_snapshot.view_type} view</strong>
                <p>V-taper {result.after_snapshot.v_taper_ratio}</p>
                <p>Waist/hip {result.after_snapshot.waist_to_hip_ratio}</p>
              </article>
            </div>

            <div className="notes-card">
              <span>Coach notes</span>
              <ul>
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section className="placeholder-report">
            <span>What you get</span>
            <h2>A clean before/after report instead of one shaky body-fat number.</h2>
            <p>
              This flow is designed for visual tracking: did the waist tighten, did the
              torso taper improve, and does the side profile look leaner or softer?
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
