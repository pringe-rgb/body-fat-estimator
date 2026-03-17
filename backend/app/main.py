from __future__ import annotations

import os
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.estimate import analyze_progress, progress_analysis_dict


app = FastAPI(title="Body Fat Estimator API")


def _get_allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS")
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


allowed_origins = _get_allowed_origins()
allow_credentials = "*" not in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


def _decode_upload(file_bytes: bytes) -> np.ndarray:
    image_array = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Unable to decode uploaded image.")
    return image


def _validate_image_upload(file: UploadFile, label: str) -> None:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"{label} must be an image.")


@app.post("/analyze-progress")
async def analyze_body_progress(
    before_file: UploadFile = File(...),
    after_file: UploadFile = File(...),
) -> dict[str, Any]:
    _validate_image_upload(before_file, "Before image")
    _validate_image_upload(after_file, "After image")

    before_contents = await before_file.read()
    after_contents = await after_file.read()

    before_image = _decode_upload(before_contents)
    after_image = _decode_upload(after_contents)

    try:
        result = analyze_progress(before_image, after_image)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected analysis error: {exc}") from exc

    return progress_analysis_dict(result)
