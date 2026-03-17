"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY = "body-diary-app-state-v1";
const FREE_RECORD_LIMIT = 3;

const tabs = [
  { id: "home", label: "홈" },
  { id: "record", label: "기록" },
  { id: "compare", label: "비교" },
  { id: "meal", label: "식단" },
  { id: "profile", label: "마이" }
];

const conditionOptions = [
  { id: "good", label: "좋음", emoji: "🙂" },
  { id: "normal", label: "보통", emoji: "😐" },
  { id: "tired", label: "피곤함", emoji: "😮‍💨" }
];

const mealTypes = ["아침", "점심", "저녁", "간식"];

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replaceAll(". ", ".")
    .replace(/\.$/, "");
}

function formatShortDate(value) {
  const match = value.match(/(\d{4})\.\s?(\d{2})\.\s?(\d{2})/);
  if (!match) return value;
  return `${match[2]}.${match[3]}`;
}

function initialRecordDraft() {
  return {
    date: formatDate(),
    frontImage: "",
    sideImage: "",
    weight: "",
    condition: "normal",
    memo: ""
  };
}

const initialMealDraft = { type: "아침", calories: "", note: "" };

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl, maxSize = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    image.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const array = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    array[index] = binary.charCodeAt(index);
  }

  return new Blob([array], { type: mime });
}

function getConditionLabel(condition) {
  return conditionOptions.find((option) => option.id === condition)?.label || "보통";
}

function buildComparePayload(beforeRecord, afterRecord, angle) {
  const field = angle === "측면" ? "sideImage" : "frontImage";
  const beforeImage = beforeRecord[field];
  const afterImage = afterRecord[field];

  if (!beforeImage || !afterImage) {
    throw new Error(`${angle} 사진이 모두 있는 기록끼리 비교해 주세요.`);
  }

  const formData = new FormData();
  formData.append("before_file", dataUrlToBlob(beforeImage), "before.jpg");
  formData.append("after_file", dataUrlToBlob(afterImage), "after.jpg");
  return formData;
}

function buildWeeklySummary(records, meals, compareHistory) {
  const recentRecords = records.slice(0, 7);
  const recentMeals = meals.slice(0, 14);
  const latestReport = compareHistory[0];
  const averageWeight = recentRecords.length
    ? (
        recentRecords.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) / recentRecords.length
      ).toFixed(1)
    : null;

  return {
    streak: records.length,
    recentRecordCount: recentRecords.length,
    recentMealCount: recentMeals.length,
    averageWeight,
    latestSignal: latestReport?.overall_signal || "아직 데이터가 적어요",
    latestHeadline: latestReport?.headline || "첫 전후 비교 리포트를 만들면 변화 흐름이 보이기 시작해요."
  };
}

function localizeConfidenceLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("high")) return "신뢰도 높음";
  if (normalized.includes("medium")) return "신뢰도 보통";
  if (normalized.includes("low")) return "신뢰도 낮음";
  return value || "신뢰도 보통";
}

function localizeSignal(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("strong improvement")) return "좋아지는 흐름이 분명해요";
  if (normalized.includes("moderate improvement")) return "전반적으로 좋아지는 흐름이에요";
  if (normalized.includes("reverse trend")) return "예전보다 흐름이 조금 무너졌어요";
  if (normalized.includes("slight regression")) return "약간 둔해진 변화가 보여요";
  if (normalized.includes("mostly stable")) return "전체적으로 비슷한 흐름이에요";
  return value || "변화 분석";
}

function localizeHeadline(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("clear tightening trend")) return "눈에 띄게 정리된 흐름이 보여요";
  if (normalized.includes("solid visual progress")) return "사진상 좋아진 흐름이 보여요";
  if (normalized.includes("visible reverse trend")) return "이전보다 둔한 흐름이 보여요";
  if (normalized.includes("mixed result with some softness")) return "좋아진 부분과 아쉬운 부분이 함께 보여요";
  if (normalized.includes("body shape looks mostly stable")) return "전체적으로 비슷한 상태로 보여요";
  return value || "눈바디 변화 리포트";
}

function localizeMetricLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("waist line")) return "허리선";
  if (normalized.includes("v-taper")) return "상체 라인";
  if (normalized.includes("waist-to-hip balance")) return "허리-골반 밸런스";
  if (normalized.includes("lower-body definition")) return "하체 밸런스";
  if (normalized.includes("abdomen projection")) return "복부 돌출감";
  return label || "변화 지표";
}

function buildLocalizedMetricSummary(label, changePercent) {
  const amount = Math.abs(Number(changePercent) || 0).toFixed(1);
  const positive = (Number(changePercent) || 0) > 1.5;
  const negative = (Number(changePercent) || 0) < -1.5;

  if (label === "허리선") {
    if (positive) return `허리 실루엣이 이전보다 ${amount}% 정도 더 정리된 흐름으로 읽혀요.`;
    if (negative) return `허리선이 이전보다 ${amount}% 정도 덜 정리된 흐름으로 보여요.`;
    return "허리선은 전후 사진에서 큰 차이 없이 비슷하게 보여요.";
  }

  if (label === "상체 라인") {
    if (positive) return `어깨 대비 허리 비율이 좋아져 상체 라인이 ${amount}% 정도 또렷해 보여요.`;
    if (negative) return `상체 대비 허리 라인이 이전보다 ${amount}% 정도 덜 또렷하게 읽혀요.`;
    return "상체 라인은 전후 사진에서 크게 달라 보이지 않아요.";
  }

  if (label === "허리-골반 밸런스") {
    if (positive) return `허리와 골반 비율이 ${amount}% 정도 더 안정적으로 보여요.`;
    if (negative) return `허리-골반 밸런스가 이전보다 ${amount}% 정도 덜 안정적으로 읽혀요.`;
    return "허리-골반 밸런스는 전후가 비슷하게 보여요.";
  }

  if (label === "하체 밸런스") {
    if (positive) return `하체 대비 허리 비율이 ${amount}% 정도 좋아져 전체 밸런스가 나아 보여요.`;
    if (negative) return `하체 밸런스가 이전보다 ${amount}% 정도 덜 선명하게 보일 수 있어요.`;
    return "하체 밸런스는 큰 차이 없이 비슷해 보여요.";
  }

  if (label === "복부 돌출감") {
    if (positive) return `측면 기준 복부 돌출감이 ${amount}% 정도 줄어든 흐름으로 읽혀요.`;
    if (negative) return `측면 기준 복부 돌출감이 이전보다 ${amount}% 정도 더 도드라져 보여요.`;
    return "복부 돌출감은 전후 사진에서 비슷하게 보여요.";
  }

  return `${label} 변화가 ${amount}% 정도 감지됐어요.`;
}

function buildLocalizedSummary(changeScore) {
  if (changeScore >= 7) {
    return "이전 사진과 비교하면 최근 사진에서 전체 라인이 더 정리된 흐름으로 보여요. 특히 허리선과 상체 비율 변화가 좋게 읽혔어요.";
  }
  if (changeScore >= 2) {
    return "전반적으로는 좋아지는 흐름이 보이지만, 극적인 차이라기보다 서서히 정리되는 느낌에 가까워요.";
  }
  if (changeScore <= -7) {
    return "이전 사진보다 최근 사진에서 라인이 덜 정리돼 보이는 신호가 있어요. 촬영 조건 차이도 함께 확인해 보는 게 좋아요.";
  }
  if (changeScore <= -2) {
    return "조금 둔해진 변화가 읽히지만, 자세나 거리 차이의 영향도 함께 있을 수 있어요.";
  }
  return "전후 사진을 비교했을 때 전체적으로는 비슷한 흐름으로 보여요. 큰 변화보다는 유지에 가까운 상태예요.";
}

function localizeNotes(notes, confidence) {
  const localized = [
    "같은 자세, 같은 거리, 같은 조명으로 찍을수록 전후 비교가 더 자연스럽고 믿을 만해집니다.",
    "이 리포트는 몸 변화의 방향을 보는 용도에 적합하고, 의료용 체지방 측정값을 대신하진 않아요."
  ];

  if (String(confidence).includes("낮음") || String(confidence).toLowerCase().includes("low")) {
    localized.push("이번 비교는 사진 인식 신호가 약해서 신뢰도가 낮아요. 전신이 더 잘 보이는 사진이면 결과가 더 안정적입니다.");
  }

  if (Array.isArray(notes) && notes.length > 2) {
    return localized.concat(notes.slice(2));
  }

  return localized;
}

function localizeProgressPayload(payload) {
  const localizedConfidence = localizeConfidenceLabel(payload.confidence);
  const localizedMetrics = (payload.metrics || []).map((metric) => {
    const localizedLabel = localizeMetricLabel(metric.label);
    return {
      ...metric,
      label: localizedLabel,
      summary: buildLocalizedMetricSummary(localizedLabel, metric.change_percent)
    };
  });

  return {
    ...payload,
    overall_signal: localizeSignal(payload.overall_signal),
    headline: localizeHeadline(payload.headline),
    summary: buildLocalizedSummary(payload.change_score),
    confidence: localizedConfidence,
    metrics: localizedMetrics,
    notes: localizeNotes(payload.notes, localizedConfidence),
    before_snapshot: {
      ...payload.before_snapshot,
      view: payload.before_snapshot?.view || payload.before_snapshot?.view_type || "정면"
    },
    after_snapshot: {
      ...payload.after_snapshot,
      view: payload.after_snapshot?.view || payload.after_snapshot?.view_type || "정면"
    }
  };
}

function HomeTab({ records, meals, compareHistory, onMove }) {
  const summary = buildWeeklySummary(records, meals, compareHistory);
  const today = formatDate();
  const todayMeals = meals.filter((meal) => meal.date === today);
  const latestReport = compareHistory[0];

  return (
    <div className="content-grid">
      <section className="panel hero-panel span-2">
        <div className="hero-copy">
          <span className="eyebrow">Body Diary</span>
          <h1>몸 변화는 숫자보다 흐름으로 보는 게 더 오래 갑니다.</h1>
          <p>
            눈바디 사진, 식단 메모, 전후 비교를 한곳에 쌓아두고 지난 기록보다 좋아졌는지 자연스럽게 확인하는
            다이어리입니다.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary-button" onClick={() => onMove("record")}>
            오늘 체크인 추가
          </button>
          <button className="secondary-button" onClick={() => onMove("compare")}>
            전후 비교 하러 가기
          </button>
        </div>
      </section>

      <section className="panel stats-panel">
        <span className="section-label">이번 주 요약</span>
        <div className="stats-list">
          <article>
            <span>체크인</span>
            <strong>{summary.recentRecordCount}회</strong>
          </article>
          <article>
            <span>식단 기록</span>
            <strong>{summary.recentMealCount}개</strong>
          </article>
          <article>
            <span>평균 몸무게</span>
            <strong>{summary.averageWeight ? `${summary.averageWeight}kg` : "미입력"}</strong>
          </article>
          <article>
            <span>최근 신호</span>
            <strong>{summary.latestSignal}</strong>
          </article>
        </div>
      </section>

      <section className="panel report-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">최근 리포트</span>
            <h2>전후 비교 미리보기</h2>
          </div>
          <button className="ghost-button" onClick={() => onMove("compare")}>
            비교 보기
          </button>
        </div>

        {latestReport ? (
          <div className="report-preview">
            <div className="report-preview-head">
              <div>
                <span className="eyebrow small">{latestReport.overall_signal}</span>
                <strong>{latestReport.headline}</strong>
              </div>
              <div className="mini-score">
                {latestReport.change_score > 0 ? "+" : ""}
                {latestReport.change_score}
              </div>
            </div>
            <p>{latestReport.summary}</p>
          </div>
        ) : (
          <div className="empty-box">
            <strong>아직 전후 비교 리포트가 없어요.</strong>
            <small>기록 두 개를 쌓으면 변화 문장을 바로 만들어 드립니다.</small>
          </div>
        )}
      </section>

      <section className="panel span-2">
        <div className="panel-head">
          <div>
            <span className="section-label">기록 타임라인</span>
            <h2>최근 눈바디 기록</h2>
          </div>
        </div>

        {records.length ? (
          <div className="timeline-grid">
            {records.slice(0, 6).map((record) => (
              <article className="timeline-card" key={record.id}>
                <div className="timeline-image">
                  {record.frontImage ? <img src={record.frontImage} alt={`${record.date} 기록`} /> : null}
                </div>
                <strong>{formatShortDate(record.date)}</strong>
                <small>
                  {record.weight ? `${record.weight}kg` : "몸무게 미입력"} · {getConditionLabel(record.condition)}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-box">
            <strong>첫 체크인을 아직 안 했어요.</strong>
            <small>정면 사진 한 장만 올려도 다이어리를 시작할 수 있어요.</small>
          </div>
        )}
      </section>

      <section className="panel span-2">
        <div className="panel-head">
          <div>
            <span className="section-label">오늘 식단</span>
            <h2>간단한 식사 메모</h2>
          </div>
          <button className="ghost-button" onClick={() => onMove("meal")}>
            식단 기록
          </button>
        </div>

        {todayMeals.length ? (
          <div className="meal-list">
            {todayMeals.slice(0, 4).map((meal) => (
              <article className="meal-card" key={meal.id}>
                <div>
                  <strong>{meal.type}</strong>
                  <p>{meal.note}</p>
                </div>
                <span>{meal.calories || 0} kcal</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-box">
            <strong>오늘 식단 메모가 아직 없어요.</strong>
            <small>식단을 가볍게 적어두면 몸 변화와 연결해서 보기 좋아집니다.</small>
          </div>
        )}
      </section>
    </div>
  );
}

function RecordTab({ draft, setDraft, onSave, saveError, isSaving, isLimitReached }) {
  const onFieldChange = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  const onFileChange = (field) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const resizedDataUrl = await resizeImageDataUrl(dataUrl);
      setDraft((current) => ({ ...current, [field]: resizedDataUrl }));
    } catch {
      setDraft((current) => ({ ...current, [field]: "" }));
    }
  };

  return (
    <div className="content-grid">
      <section className="panel span-2">
        <div className="panel-head">
          <div>
            <span className="section-label">오늘의 체크인</span>
            <h2>몸 변화 기록 추가</h2>
          </div>
        </div>

        <div className="date-banner">
          <span>기록 날짜</span>
          <strong>{draft.date}</strong>
        </div>

        <div className="upload-grid">
          <label className="upload-card">
            <span>정면 사진</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange("frontImage")} />
            {draft.frontImage ? (
              <img src={draft.frontImage} alt="정면 기록 미리보기" />
            ) : (
              <small>전신이 보이는 정면 사진을 올려 주세요.</small>
            )}
          </label>

          <label className="upload-card">
            <span>측면 사진</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange("sideImage")} />
            {draft.sideImage ? (
              <img src={draft.sideImage} alt="측면 기록 미리보기" />
            ) : (
              <small>가능하면 같은 거리, 같은 조명으로 찍으면 더 좋아요.</small>
            )}
          </label>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">몸 상태</span>
        <div className="field-stack">
          <label className="field-card">
            <span>몸무게</span>
            <input value={draft.weight} onChange={onFieldChange("weight")} placeholder="예: 72.4" />
          </label>

          <div className="field-card">
            <span>컨디션</span>
            <div className="condition-grid">
              {conditionOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={draft.condition === option.id ? "condition-chip active" : "condition-chip"}
                  onClick={() => setDraft((current) => ({ ...current, condition: option.id }))}
                >
                  <span>{option.emoji}</span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">메모</span>
        <label className="field-card fill-card">
          <span>오늘의 느낌</span>
          <textarea
            rows={7}
            value={draft.memo}
            onChange={onFieldChange("memo")}
            placeholder="운동 후 느낌, 몸 상태, 식단 메모를 자유롭게 적어 보세요."
          />
        </label>
      </section>

      <section className="panel span-2">
        <div className="tip-card">
          <strong>촬영 팁</strong>
          <p>같은 장소와 비슷한 자세로 찍을수록 전후 비교 결과가 훨씬 자연스럽고 안정적으로 나옵니다.</p>
        </div>

        {isLimitReached ? (
          <div className="paywall-card">
            <strong>무료 기록 3개를 모두 사용했어요.</strong>
            <p>정식 버전에서는 로그인 후 무제한 기록과 주간 리포트, 식단 분석으로 이어갈 예정입니다.</p>
          </div>
        ) : null}

        {saveError ? <p className="status error">{saveError}</p> : null}

        <button className="primary-button full-width" onClick={onSave} disabled={isSaving || isLimitReached}>
          {isSaving ? "저장 중..." : "오늘 체크인 완료"}
        </button>
      </section>
    </div>
  );
}

function CompareTab({
  records,
  beforeId,
  afterId,
  angle,
  setBeforeId,
  setAfterId,
  setAngle,
  onAnalyze,
  compareError,
  compareResult,
  isAnalyzing
}) {
  const beforeRecord = records.find((record) => record.id === beforeId);
  const afterRecord = records.find((record) => record.id === afterId);
  const imageField = angle === "측면" ? "sideImage" : "frontImage";

  return (
    <div className="content-grid compare-page">
      <section className="panel compare-form-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">전후 비교</span>
            <h2>사진 선택</h2>
          </div>
        </div>

        <div className="field-stack">
          <label className="field-card">
            <span>이전 기록</span>
            <select value={beforeId} onChange={(event) => setBeforeId(event.target.value)}>
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.date}
                </option>
              ))}
            </select>
          </label>

          <label className="field-card">
            <span>최근 기록</span>
            <select value={afterId} onChange={(event) => setAfterId(event.target.value)}>
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.date}
                </option>
              ))}
            </select>
          </label>

          <label className="field-card">
            <span>비교 각도</span>
            <select value={angle} onChange={(event) => setAngle(event.target.value)}>
              <option value="정면">정면</option>
              <option value="측면">측면</option>
            </select>
          </label>
        </div>

        {compareError ? <p className="status error">{compareError}</p> : null}

        <button className="primary-button full-width" onClick={onAnalyze} disabled={isAnalyzing || records.length < 2}>
          {isAnalyzing ? "분석 중..." : "변화 리포트 만들기"}
        </button>
      </section>

      <section className="panel compare-preview-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">선택한 사진</span>
            <h2>전후 미리보기</h2>
          </div>
        </div>

        {beforeRecord?.[imageField] && afterRecord?.[imageField] ? (
          <div className="compare-preview-stack">
            <article className="compare-shot-card">
              <span>이전 기록</span>
              <img src={beforeRecord[imageField]} alt="이전 사진 미리보기" />
              <strong>{beforeRecord.date}</strong>
            </article>
            <article className="compare-shot-card">
              <span>최근 기록</span>
              <img src={afterRecord[imageField]} alt="최근 사진 미리보기" />
              <strong>{afterRecord.date}</strong>
            </article>
          </div>
        ) : (
          <div className="empty-box">
            <strong>사진 두 장을 고르면 여기에서 미리보기가 보여요.</strong>
            <small>모바일에서도 잘리지 않도록 세로 카드 형태로 바꿔두었습니다.</small>
          </div>
        )}
      </section>

      {compareResult ? (
        <section className="panel span-2 report-result-panel">
          <div className="report-hero">
            <div>
              <span className="eyebrow small">{compareResult.overall_signal}</span>
              <h2>{compareResult.headline}</h2>
              <p>{compareResult.summary}</p>
            </div>
            <div className="score-card">
              <span>변화 신호</span>
              <strong>
                {compareResult.change_score > 0 ? "+" : ""}
                {compareResult.change_score}
              </strong>
              <small>{compareResult.confidence}</small>
            </div>
          </div>

          <div className="snapshot-grid">
            <article className="snapshot-card">
              <span>이전 스냅샷</span>
              <strong>{compareResult.before_snapshot?.view || angle}</strong>
              <small>V-taper {compareResult.before_snapshot?.v_taper}</small>
              <small>Waist/Hip {compareResult.before_snapshot?.waist_to_hip}</small>
            </article>
            <article className="snapshot-card">
              <span>최근 스냅샷</span>
              <strong>{compareResult.after_snapshot?.view || angle}</strong>
              <small>V-taper {compareResult.after_snapshot?.v_taper}</small>
              <small>Waist/Hip {compareResult.after_snapshot?.waist_to_hip}</small>
            </article>
          </div>

          <div className="metrics-grid">
            {compareResult.metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>
                  {metric.change_percent > 0 ? "+" : ""}
                  {metric.change_percent}%
                </strong>
                <p>{metric.summary}</p>
              </article>
            ))}
          </div>

          <div className="notes-card">
            <span>코치 메모</span>
            <ul>
              {compareResult.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="panel span-2">
          <div className="empty-box">
            <strong>전후 리포트는 비교 버튼을 누르면 아래에 생성됩니다.</strong>
            <small>같은 각도와 비슷한 자세의 사진일수록 결과가 더 믿을 만해요.</small>
          </div>
        </section>
      )}
    </div>
  );
}

function MealTab({ meals, mealDraft, setMealDraft, onAddMeal }) {
  const today = formatDate();
  const todayMeals = meals.filter((meal) => meal.date === today);
  const todayCalories = todayMeals.reduce((total, meal) => total + (Number(meal.calories) || 0), 0);

  const onFieldChange = (field) => (event) => {
    setMealDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="content-grid">
      <section className="panel">
        <span className="section-label">오늘 누적</span>
        <div className="date-banner">
          <span>오늘 칼로리</span>
          <strong>{todayCalories} kcal</strong>
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-head">
          <div>
            <span className="section-label">식단 입력</span>
            <h2>가볍게 메모 남기기</h2>
          </div>
        </div>

        <div className="meal-form-grid">
          <label className="field-card">
            <span>식사 구분</span>
            <select value={mealDraft.type} onChange={onFieldChange("type")}>
              {mealTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="field-card">
            <span>칼로리</span>
            <input value={mealDraft.calories} onChange={onFieldChange("calories")} placeholder="예: 540" />
          </label>

          <label className="field-card meal-note-card">
            <span>식단 메모</span>
            <textarea
              rows={4}
              value={mealDraft.note}
              onChange={onFieldChange("note")}
              placeholder="먹은 음식, 양, 만족감 같은 메모를 적어 보세요."
            />
          </label>
        </div>

        <button className="primary-button" onClick={onAddMeal}>
          식단 기록 추가
        </button>
      </section>

      <section className="panel span-2">
        <div className="panel-head">
          <div>
            <span className="section-label">오늘 타임라인</span>
            <h2>기록한 식사</h2>
          </div>
        </div>

        {todayMeals.length ? (
          <div className="meal-list">
            {todayMeals.map((meal) => (
              <article className="meal-card" key={meal.id}>
                <div>
                  <strong>{meal.type}</strong>
                  <p>{meal.note}</p>
                </div>
                <span>{meal.calories || 0} kcal</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-box">
            <strong>오늘 식단이 아직 비어 있어요.</strong>
            <small>간단하게 적어도 주간 리포트의 맥락이 좋아집니다.</small>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileTab({ records, meals, compareHistory, onReset }) {
  const isFreeLimitReached = records.length >= FREE_RECORD_LIMIT;

  return (
    <div className="content-grid">
      <section className="panel span-2">
        <div className="panel-head">
          <div>
            <span className="section-label">현재 상태</span>
            <h2>무료 체험 MVP</h2>
          </div>
        </div>
        <p className="muted-copy">
          지금은 기기 안에만 저장되는 테스트 단계입니다. 다음 버전에서 로그인, 서버 저장, 결제, 주간 리포트까지
          확장할 수 있도록 구조를 잡고 있습니다.
        </p>
      </section>

      <section className="panel">
        <span className="section-label">사용 현황</span>
        <div className="stats-list">
          <article>
            <span>사진 기록</span>
            <strong>
              {records.length}/{FREE_RECORD_LIMIT}
            </strong>
          </article>
          <article>
            <span>식단 기록</span>
            <strong>{meals.length}개</strong>
          </article>
          <article>
            <span>비교 리포트</span>
            <strong>{compareHistory.length}개</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">프리미엄 방향</span>
        <div className="feature-list">
          <div className="feature-row">
            <strong>무료</strong>
            <p>기록 3개, 전후 비교, 기본 변화 리포트</p>
          </div>
          <div className="feature-row">
            <strong>유료</strong>
            <p>기록 무제한, AI 분석, 식단 분석, 주간 리포트, 공유 카드</p>
          </div>
        </div>
      </section>

      <section className="panel span-2">
        <div className="paywall-card">
          <strong>{isFreeLimitReached ? "이제는 업그레이드 동선이 필요한 상태예요." : "아직은 무료 체험을 써보는 단계예요."}</strong>
          <p>다음 단계에서 구글 로그인과 서버 저장을 붙이면 기기 바뀌어도 기록이 유지되는 진짜 서비스가 됩니다.</p>
        </div>

        <button className="secondary-button danger full-width" onClick={onReset}>
          이 기기 데이터 초기화
        </button>
      </section>
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("home");
  const [records, setRecords] = useState([]);
  const [meals, setMeals] = useState([]);
  const [compareHistory, setCompareHistory] = useState([]);
  const [recordDraft, setRecordDraft] = useState(initialRecordDraft);
  const [mealDraft, setMealDraft] = useState(initialMealDraft);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [angle, setAngle] = useState("정면");
  const [compareResult, setCompareResult] = useState(null);
  const [compareError, setCompareError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      setRecords(parsed.records || []);
      setMeals(parsed.meals || []);
      setCompareHistory((parsed.compareHistory || []).map(localizeProgressPayload));
    } catch {
      // Ignore malformed local data and start fresh.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          records,
          meals,
          compareHistory
        })
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        setSaveError("저장 공간이 부족해 기록을 이 기기에 저장하지 못했습니다. 더 작은 사진으로 다시 시도해 주세요.");
      }
    }
  }, [records, meals, compareHistory]);

  useEffect(() => {
    if (records.length >= 2) {
      setBeforeId(records[1]?.id || records[0]?.id || "");
      setAfterId(records[0]?.id || "");
    } else if (records.length === 1) {
      setBeforeId(records[0].id);
      setAfterId(records[0].id);
    } else {
      setBeforeId("");
      setAfterId("");
    }
  }, [records]);

  const recordMap = useMemo(() => Object.fromEntries(records.map((record) => [record.id, record])), [records]);
  const isLimitReached = records.length >= FREE_RECORD_LIMIT;

  const saveRecord = async () => {
    if (!recordDraft.frontImage) {
      setSaveError("정면 사진은 꼭 올려 주세요.");
      return;
    }

    if (isLimitReached) {
      setSaveError("무료 체험은 기록 3개까지예요. 다음 단계에서 로그인과 유료 플랜으로 확장할 예정입니다.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    setRecords((current) => [
      {
        id: crypto.randomUUID(),
        ...recordDraft
      },
      ...current
    ]);

    setRecordDraft(initialRecordDraft());
    setIsSaving(false);
    setActiveTab("home");
  };

  const addMeal = () => {
    if (!mealDraft.note.trim()) return;

    setMeals((current) => [
      {
        id: crypto.randomUUID(),
        date: formatDate(),
        ...mealDraft
      },
      ...current
    ]);

    setMealDraft(initialMealDraft);
  };

  const analyzeCompare = async () => {
    const beforeRecord = recordMap[beforeId];
    const afterRecord = recordMap[afterId];

    if (!beforeRecord || !afterRecord) {
      setCompareError("비교할 기록 두 개를 먼저 골라 주세요.");
      return;
    }

    if (beforeRecord.id === afterRecord.id) {
      setCompareError("같은 기록끼리는 비교할 수 없어요.");
      return;
    }

    setIsAnalyzing(true);
    setCompareError("");
    setCompareResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/analyze-progress`, {
        method: "POST",
        body: buildComparePayload(beforeRecord, afterRecord, angle)
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "비교 리포트를 만들지 못했습니다.");
      }

      const entry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        beforeId,
        afterId,
        angle,
        ...localizeProgressPayload(payload)
      };

      setCompareResult(entry);
      setCompareHistory((current) => [entry, ...current].slice(0, 20));
    } catch (error) {
      setCompareError(error.message || "비교 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetLocalData = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setRecords([]);
    setMeals([]);
    setCompareHistory([]);
    setCompareResult(null);
    setRecordDraft(initialRecordDraft());
    setMealDraft(initialMealDraft);
    setActiveTab("home");
  };

  return (
    <main className="app-shell">
      <div className="app-frame">
        <header className="top-header">
          <div>
            <span className="section-label">눈바디 변화 다이어리</span>
            <h1>몸 변화 추적</h1>
          </div>
          <p>모바일에서는 세로 흐름, 웹에서는 넓은 레이아웃으로 보이도록 정리한 버전입니다.</p>
        </header>

        <div className="desktop-nav-wrap">
          <nav className="tab-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "tab-button active" : "tab-button"}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="page-body">
          {activeTab === "home" ? <HomeTab records={records} meals={meals} compareHistory={compareHistory} onMove={setActiveTab} /> : null}
          {activeTab === "record" ? (
            <RecordTab
              draft={recordDraft}
              setDraft={setRecordDraft}
              onSave={saveRecord}
              saveError={saveError}
              isSaving={isSaving}
              isLimitReached={isLimitReached}
            />
          ) : null}
          {activeTab === "compare" ? (
            <CompareTab
              records={records}
              beforeId={beforeId}
              afterId={afterId}
              angle={angle}
              setBeforeId={setBeforeId}
              setAfterId={setAfterId}
              setAngle={setAngle}
              onAnalyze={analyzeCompare}
              compareError={compareError}
              compareResult={compareResult}
              isAnalyzing={isAnalyzing}
            />
          ) : null}
          {activeTab === "meal" ? <MealTab meals={meals} mealDraft={mealDraft} setMealDraft={setMealDraft} onAddMeal={addMeal} /> : null}
          {activeTab === "profile" ? <ProfileTab records={records} meals={meals} compareHistory={compareHistory} onReset={resetLocalData} /> : null}
        </div>

        <nav className="bottom-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "bottom-nav-button active" : "bottom-nav-button"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}
