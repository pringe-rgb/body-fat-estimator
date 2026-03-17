from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import tempfile

import mediapipe as mp
import numpy as np
from mediapipe.python import solution_base as mp_solution_base


mp_pose = mp.solutions.pose


@dataclass
class EstimationResult:
    estimated_body_fat_percent: float
    confidence: str
    view_type: str
    summary: str


def _prepare_mediapipe_resources() -> None:
    """Mirror required MediaPipe assets into an ASCII-only temp path on Windows."""
    package_root = Path(mp.__file__).resolve().parent
    temp_root = Path(tempfile.gettempdir()) / "body-fat-estimator-mediapipe"
    target_root = temp_root / "mediapipe"
    target_modules_dir = target_root / "modules"
    source_modules_dir = package_root / "modules"

    target_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_modules_dir, target_modules_dir, dirs_exist_ok=True)

    fake_solution_base = target_root / "python" / "solution_base.py"
    fake_solution_base.parent.mkdir(parents=True, exist_ok=True)
    fake_solution_base.touch(exist_ok=True)

    mp_solution_base.__file__ = str(fake_solution_base)


def _distance(point_a, point_b) -> float:
    return float(np.linalg.norm(np.array([point_a.x, point_a.y]) - np.array([point_b.x, point_b.y])))


def _safe_average(values: list[float]) -> float:
    valid = [value for value in values if value > 0]
    if not valid:
        return 0.0
    return float(sum(valid) / len(valid))


def _get_landmark(landmarks, name: str):
    return landmarks[mp_pose.PoseLandmark[name].value]


def _midpoint(point_a, point_b) -> tuple[float, float]:
    return ((point_a.x + point_b.x) / 2.0, (point_a.y + point_b.y) / 2.0)


def _normalized_visibility(landmarks, names: list[str]) -> float:
    scores = [_get_landmark(landmarks, name).visibility for name in names]
    return round(float(sum(scores) / len(scores)), 2)


def _sample_mask_width(mask: np.ndarray, center_y: float, band: int = 4, threshold: float = 0.5) -> float:
    if mask.ndim != 2:
        return 0.0

    row_index = int(round(center_y * (mask.shape[0] - 1)))
    row_start = max(0, row_index - band)
    row_end = min(mask.shape[0], row_index + band + 1)

    widths: list[float] = []
    for row in range(row_start, row_end):
        active = np.where(mask[row] > threshold)[0]
        if active.size > 1:
            widths.append(float((active[-1] - active[0]) / mask.shape[1]))

    return _safe_average(widths)


def _clamp_ratio(value: float, low: float, high: float) -> float:
    return float(np.clip(value, low, high))


def _estimate_front_view(
    shoulder_width: float,
    hip_width: float,
    torso_height: float,
    leg_length: float,
    chest_width: float,
    waist_width: float,
    thigh_width: float,
) -> float:
    shoulder_width = max(shoulder_width, 1e-6)
    hip_width = max(hip_width, 1e-6)
    chest_width = max(chest_width, shoulder_width * 0.82)
    waist_width = max(waist_width, hip_width * 0.45)
    thigh_width = max(thigh_width, waist_width * 0.65)

    waist_to_shoulder = _clamp_ratio(waist_width / shoulder_width, 0.45, 1.2)
    waist_to_hip = _clamp_ratio(waist_width / hip_width, 0.5, 1.25)
    chest_to_waist_drop = _clamp_ratio((chest_width - waist_width) / chest_width, -0.2, 0.45)
    torso_to_leg = _clamp_ratio(torso_height / max(leg_length, 1e-6), 0.55, 1.25)
    thigh_to_waist = _clamp_ratio(thigh_width / waist_width, 0.6, 1.5)

    body_fat = 8.0
    body_fat += (waist_to_shoulder - 0.55) * 26.0
    body_fat += (waist_to_hip - 0.72) * 16.0
    body_fat += (0.24 - chest_to_waist_drop) * 30.0
    body_fat += (torso_to_leg - 0.72) * 10.0
    body_fat += (0.92 - thigh_to_waist) * 6.0

    return float(np.clip(body_fat, 6.0, 35.0))


def _estimate_side_view(
    torso_height: float,
    leg_length: float,
    chest_width: float,
    waist_width: float,
    hip_width: float,
    shoulder_hip_offset: float,
) -> float:
    torso_height = max(torso_height, 1e-6)
    chest_width = max(chest_width, 1e-6)
    waist_width = max(waist_width, chest_width * 0.7)
    hip_width = max(hip_width, waist_width * 0.85)

    waist_to_chest = _clamp_ratio(waist_width / chest_width, 0.65, 1.3)
    hip_to_chest = _clamp_ratio(hip_width / chest_width, 0.7, 1.35)
    torso_to_leg = _clamp_ratio(torso_height / max(leg_length, 1e-6), 0.55, 1.25)
    abdomen_projection = _clamp_ratio(shoulder_hip_offset / torso_height, 0.0, 0.45)

    body_fat = 9.0
    body_fat += (waist_to_chest - 0.78) * 28.0
    body_fat += (hip_to_chest - 0.9) * 10.0
    body_fat += abdomen_projection * 30.0
    body_fat += (torso_to_leg - 0.72) * 8.0

    return float(np.clip(body_fat, 7.0, 38.0))


def estimate_body_fat_from_landmarks(landmarks, segmentation_mask: np.ndarray | None = None) -> EstimationResult:
    left_shoulder = _get_landmark(landmarks, "LEFT_SHOULDER")
    right_shoulder = _get_landmark(landmarks, "RIGHT_SHOULDER")
    left_hip = _get_landmark(landmarks, "LEFT_HIP")
    right_hip = _get_landmark(landmarks, "RIGHT_HIP")
    left_knee = _get_landmark(landmarks, "LEFT_KNEE")
    right_knee = _get_landmark(landmarks, "RIGHT_KNEE")

    shoulder_width = _distance(left_shoulder, right_shoulder)
    hip_width = _distance(left_hip, right_hip)
    torso_height = _safe_average([
        _distance(left_shoulder, left_hip),
        _distance(right_shoulder, right_hip),
    ])
    leg_length = _safe_average([
        _distance(left_hip, left_knee),
        _distance(right_hip, right_knee),
    ])

    if torso_height == 0:
        raise ValueError("Unable to calculate a stable body ratio from landmarks.")

    shoulder_mid_x, shoulder_mid_y = _midpoint(left_shoulder, right_shoulder)
    hip_mid_x, hip_mid_y = _midpoint(left_hip, right_hip)

    chest_y = shoulder_mid_y + (hip_mid_y - shoulder_mid_y) * 0.25
    waist_y = shoulder_mid_y + (hip_mid_y - shoulder_mid_y) * 0.7
    thigh_y = hip_mid_y + (_safe_average([left_knee.y, right_knee.y]) - hip_mid_y) * 0.35

    chest_width_mask = _sample_mask_width(segmentation_mask, chest_y) if segmentation_mask is not None else 0.0
    waist_width_mask = _sample_mask_width(segmentation_mask, waist_y) if segmentation_mask is not None else 0.0
    hip_width_mask = _sample_mask_width(segmentation_mask, hip_mid_y) if segmentation_mask is not None else 0.0
    thigh_width_mask = _sample_mask_width(segmentation_mask, thigh_y) if segmentation_mask is not None else 0.0

    front_view_signal = shoulder_width / max(hip_width, 1e-6)
    if shoulder_width < hip_width * 0.55 or front_view_signal < 0.75:
        view_type = "side"
    else:
        view_type = "front"

    if view_type == "front":
        chest_width = chest_width_mask or shoulder_width * 0.95
        waist_width = waist_width_mask or hip_width * 0.78
        hip_width_value = hip_width_mask or hip_width
        thigh_width = thigh_width_mask or waist_width * 0.92
        body_fat = _estimate_front_view(
            shoulder_width=shoulder_width,
            hip_width=hip_width_value,
            torso_height=torso_height,
            leg_length=leg_length,
            chest_width=chest_width,
            waist_width=waist_width,
            thigh_width=thigh_width,
        )
    else:
        chest_width = chest_width_mask or torso_height * 0.34
        waist_width = waist_width_mask or chest_width * 0.95
        hip_width_value = hip_width_mask or waist_width * 1.05
        shoulder_hip_offset = abs(shoulder_mid_x - hip_mid_x)
        body_fat = _estimate_side_view(
            torso_height=torso_height,
            leg_length=leg_length,
            chest_width=chest_width,
            waist_width=waist_width,
            hip_width=hip_width_value,
            shoulder_hip_offset=shoulder_hip_offset,
        )

    visibility = _normalized_visibility(
        landmarks,
        [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_KNEE",
            "RIGHT_KNEE",
        ],
    )

    if visibility >= 0.8 and segmentation_mask is not None:
        confidence = "high"
    elif visibility >= 0.65:
        confidence = "medium"
    else:
        confidence = "low"

    summary = (
        f"Estimated from a {view_type} body pose using pose landmarks and body silhouette ratios. "
        "This is a rough visual heuristic, not a medical measurement."
    )

    return EstimationResult(
        estimated_body_fat_percent=round(body_fat, 1),
        confidence=confidence,
        view_type=view_type,
        summary=summary,
    )


def estimate_body_fat_from_image(image_bgr: np.ndarray) -> EstimationResult:
    _prepare_mediapipe_resources()

    pose = mp_pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        enable_segmentation=True,
        min_detection_confidence=0.5,
    )

    image_rgb = image_bgr[:, :, ::-1]
    result = pose.process(image_rgb)
    pose.close()

    if not result.pose_landmarks:
        raise ValueError("No full body pose was detected. Please upload a clearer front or side body image.")

    segmentation_mask = None
    if result.segmentation_mask is not None:
        segmentation_mask = np.asarray(result.segmentation_mask)

    return estimate_body_fat_from_landmarks(result.pose_landmarks.landmark, segmentation_mask)
