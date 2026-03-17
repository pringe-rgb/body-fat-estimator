"use client";

import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function HomePage() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];

    setResult(null);
    setError("");
    setFile(selectedFile || null);

    if (selectedFile) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
      return;
    }

    setPreviewUrl("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      setError("Please choose an image before estimating.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/estimate-body-fat`, {
        method: "POST",
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "Failed to estimate body fat percentage.");
      }

      setResult(payload);
    } catch (submitError) {
      setError(submitError.message || "Unexpected error while estimating.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="card">
        <div className="hero">
          <span className="eyebrow">Computer Vision Demo</span>
          <h1>Body Fat Estimator</h1>
          <p>
            Upload a front or side body photo and get a rough body fat estimate
            based on MediaPipe body pose landmarks.
          </p>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label className="upload-box" htmlFor="body-image">
            <input
              id="body-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
            />
            <span>Choose an image</span>
            <small>PNG, JPG, or WEBP. Full body front or side view works best.</small>
          </label>

          <button className="submit-button" type="submit" disabled={isLoading}>
            {isLoading ? "Estimating..." : "Estimate Body Fat %"}
          </button>
        </form>

        {previewUrl ? (
          <div className="preview-panel">
            <h2>Preview</h2>
            <img src={previewUrl} alt="Selected body preview" />
          </div>
        ) : null}

        {error ? <p className="status error">{error}</p> : null}

        {result ? (
          <section className="result-panel">
            <h2>{result.estimated_body_fat_percent}%</h2>
            <p>{result.summary}</p>
            <div className="metrics">
              <div>
                <span>View</span>
                <strong>{result.view_type}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{result.confidence}</strong>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
