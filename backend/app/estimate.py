from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import shutil
import tempfile

import mediapipe as mp
import numpy as np
from mediapipe.python import solution_base as mp_solution_base


mp_pose = mp.solutions.pose


@dataclass
class BodySnapshot:
    view_type: str
    confidence_code: str
    visibility: float
    shoulder_width: float
    hip_width: float
    chest_width: float
    waist_width: float
    thigh_width: float
    torso_height: float
    leg_length: float
    v_taper_ratio: float
    waist_to_hip_ratio: float
    torso_to_leg_ratio: float
    abdomen_projection: float
    silhouette_confidence: str


@dataclass
class ProgressMetric:
    code: str
    direction: str
    change_percent: float


@dataclass
class ProgressAnalysis:
    signal_code: str
    confidence_code: str
    view_type: str
    change_score: float
    before_snapshot: BodySnapshot
    after_snapshot: BodySnapshot
    metrics: list[ProgressMetric]
    notes: list[str]


def _prepare_mediapipe_resources() -> None:
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
    if mask is None or mask.ndim != 2:
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


def _direction_from_delta(delta: float, threshold: float = 1.5) -> str:
    if delta >= threshold:
        return "up"
    if delta <= -threshold:
        return "down"
    return "flat"


def _confidence_code(visibility: float, has_mask: bool) -> str:
    if visibility >= 0.82 and has_mask:
        return "high"
    if visibility >= 0.68:
        return "medium"
    return "low"


def _signal_code(change_score: float) -> str:
    if change_score >= 7:
        return "strong_improvement"
    if change_score >= 2:
        return "moderate_improvement"
    if change_score <= -7:
        return "reverse_trend"
    if change_score <= -2:
        return "slight_regression"
    return "mostly_stable"


def _ratio_change(before: float, after: float) -> float:
    if before <= 0:
        return 0.0
    return round(((after - before) / before) * 100, 1)


def _build_metric(code: str, before: float, after: float, prefer_lower: bool) -> ProgressMetric:
    raw_change = _ratio_change(before, after)
    effective_change = -raw_change if prefer_lower else raw_change
    direction = _direction_from_delta(effective_change)
    return ProgressMetric(code=code, direction=direction, change_percent=round(effective_change, 1))


def _snapshot_dict(snapshot: BodySnapshot) -> dict:
    payload = asdict(snapshot)
    payload["view_code"] = payload.pop("view_type")
    return payload


def _metrics_dict(metrics: list[ProgressMetric]) -> list[dict]:
    return [asdict(metric) for metric in metrics]


def _detect_view_type(shoulder_width: float, hip_width: float) -> str:
    if shoulder_width < hip_width * 0.55:
        return "side"
    if shoulder_width / max(hip_width, 1e-6) < 0.75:
        return "side"
    return "front"


def analyze_body_image(image_bgr: np.ndarray) -> BodySnapshot:
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
        raise ValueError("No full body pose was detected. Please use a clearer full-body photo.")

    landmarks = result.pose_landmarks.landmark
    segmentation_mask = np.asarray(result.segmentation_mask) if result.segmentation_mask is not None else None

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
    knee_mid_y = _safe_average([left_knee.y, right_knee.y])

    chest_y = shoulder_mid_y + (hip_mid_y - shoulder_mid_y) * 0.25
    waist_y = shoulder_mid_y + (hip_mid_y - shoulder_mid_y) * 0.7
    thigh_y = hip_mid_y + (knee_mid_y - hip_mid_y) * 0.35

    chest_width = _sample_mask_width(segmentation_mask, chest_y) or shoulder_width * 0.95
    waist_width = _sample_mask_width(segmentation_mask, waist_y) or hip_width * 0.78
    hip_width_mask = _sample_mask_width(segmentation_mask, hip_mid_y)
    thigh_width = _sample_mask_width(segmentation_mask, thigh_y) or waist_width * 0.92

    view_type = _detect_view_type(shoulder_width, hip_width)
    if hip_width_mask > 0:
        hip_width = hip_width_mask

    visibility = _normalized_visibility(
        landmarks,
        ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE"],
    )

    v_taper_ratio = _clamp_ratio(chest_width / max(waist_width, 1e-6), 0.7, 2.0)
    waist_to_hip_ratio = _clamp_ratio(waist_width / max(hip_width, 1e-6), 0.45, 1.4)
    torso_to_leg_ratio = _clamp_ratio(torso_height / max(leg_length, 1e-6), 0.55, 1.3)
    abdomen_projection = _clamp_ratio(abs(shoulder_mid_x - hip_mid_x) / torso_height, 0.0, 0.45)

    return BodySnapshot(
        view_type=view_type,
        confidence_code=_confidence_code(visibility, segmentation_mask is not None),
        visibility=visibility,
        shoulder_width=round(shoulder_width, 4),
        hip_width=round(hip_width, 4),
        chest_width=round(chest_width, 4),
        waist_width=round(waist_width, 4),
        thigh_width=round(thigh_width, 4),
        torso_height=round(torso_height, 4),
        leg_length=round(leg_length, 4),
        v_taper_ratio=round(v_taper_ratio, 3),
        waist_to_hip_ratio=round(waist_to_hip_ratio, 3),
        torso_to_leg_ratio=round(torso_to_leg_ratio, 3),
        abdomen_projection=round(abdomen_projection, 3),
        silhouette_confidence="good" if segmentation_mask is not None else "limited",
    )


def analyze_progress(before_image_bgr: np.ndarray, after_image_bgr: np.ndarray) -> ProgressAnalysis:
    before = analyze_body_image(before_image_bgr)
    after = analyze_body_image(after_image_bgr)

    if before.view_type != after.view_type:
        raise ValueError("Before and after photos should use the same angle. Please upload matching front/front or side/side photos.")

    metrics = [
        _build_metric("waist_line", before.waist_width, after.waist_width, prefer_lower=True),
        _build_metric("v_taper", before.v_taper_ratio, after.v_taper_ratio, prefer_lower=False),
        _build_metric("waist_to_hip_balance", before.waist_to_hip_ratio, after.waist_to_hip_ratio, prefer_lower=True),
    ]

    if before.view_type == "side":
        metrics.append(
            _build_metric("abdomen_projection", before.abdomen_projection, after.abdomen_projection, prefer_lower=True)
        )
    else:
        metrics.append(
            _build_metric(
                "lower_body_definition",
                before.thigh_width / max(before.waist_width, 1e-6),
                after.thigh_width / max(after.waist_width, 1e-6),
                prefer_lower=False,
            )
        )

    change_score = round(sum(metric.change_percent for metric in metrics) / len(metrics), 1)
    confidence_code = _confidence_code(min(before.visibility, after.visibility), True)

    notes = [
        "keep_pose_consistent",
        "report_is_directional",
    ]
    if confidence_code == "low":
        notes.append("low_confidence_photo")

    return ProgressAnalysis(
        signal_code=_signal_code(change_score),
        confidence_code=confidence_code,
        view_type=before.view_type,
        change_score=change_score,
        before_snapshot=before,
        after_snapshot=after,
        metrics=metrics,
        notes=notes,
    )


def progress_analysis_dict(result: ProgressAnalysis) -> dict:
    return {
        "signal_code": result.signal_code,
        "confidence_code": result.confidence_code,
        "view_code": result.view_type,
        "change_score": result.change_score,
        "before_snapshot": _snapshot_dict(result.before_snapshot),
        "after_snapshot": _snapshot_dict(result.after_snapshot),
        "metrics": _metrics_dict(result.metrics),
        "notes": result.notes,
    }
