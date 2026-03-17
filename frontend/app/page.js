"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY = "body-diary-app-state-v1";
const FREE_RECORD_LIMIT = 3;

const tabItems = [
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

const initialRecordDraft = () => ({
  date: formatDate(),
  frontImage: "",
  sideImage: "",
  weight: "",
  condition: "normal",
  memo: ""
});

const initialMealDraft = { type: "아침", calories: "", note: "" };

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
  const date = new Date(value.replaceAll(".", "-"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replaceAll(". ", ".")
    .replace(/\.$/, "");
}

function getConditionLabel(id) {
  return conditionOptions.find((option) => option.id === id)?.label || "보통";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
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

function buildComparePayload(beforeRecord, afterRecord, angle) {
  const imageField = angle === "측면" ? "sideImage" : "frontImage";
  const beforeImage = beforeRecord[imageField];
  const afterImage = afterRecord[imageField];

  if (!beforeImage || !afterImage) {
    throw new Error(`${angle} 사진이 모두 있는 기록끼리 비교해 주세요.`);
  }

  const formData = new FormData();
  formData.append("before_file", dataUrlToBlob(beforeImage), "before.jpg");
  formData.append("after_file", dataUrlToBlob(afterImage), "after.jpg");
  return formData;
}

function calculateWeeklySummary(records, meals, compareHistory) {
  const recentRecords = records.slice(0, 7);
  const recentMeals = meals.slice(0, 14);
  const latestReport = compareHistory[0];
  const streak = records.length;
  const avgWeight = recentRecords.length
    ? (
        recentRecords.reduce((sum, record) => sum + (Number(record.weight) || 0), 0) / recentRecords.length
      ).toFixed(1)
    : null;

  return {
    streak,
    recentRecordCount: recentRecords.length,
    recentMealCount: recentMeals.length,
    latestSignal: latestReport?.overall_signal || "데이터 수집 중",
    latestHeadline: latestReport?.headline || "아직 전후 비교 리포트가 없어요.",
    changeScore: latestReport?.change_score || 0,
    avgWeight
  };
}

function HeroCard({ summary, onNavigate }) {
  return (
    <section className="hero-card">
      <div className="hero-copy">
        <span className="eyebrow">Body Diary</span>
        <h1>몸 변화를 숫자 하나보다 흐름으로 기록해 보세요.</h1>
        <p>
          눈바디 사진, 식단 메모, 전후 비교 리포트를 한곳에 쌓아두고 지난주보다 좋아졌는지 자연스럽게
          확인하는 다이어리입니다.
        </p>
      </div>

      <div className="insight-card">
        <span>최근 변화 인사이트</span>
        <strong>{summary.latestHeadline}</strong>
        <small>{summary.streak}일 연속 기록 중</small>
      </div>

      <div className="quick-grid">
        <button className="quick-card primary" onClick={() => onNavigate("record")}>
          <span>오늘 체크인</span>
          <strong>사진 기록 추가</strong>
        </button>
        <button className="quick-card" onClick={() => onNavigate("compare")}>
          <span>전후 비교</span>
          <strong>변화 리포트 보기</strong>
        </button>
      </div>
    </section>
  );
}

function HomeTab({ records, meals, compareHistory, onNavigate }) {
  const today = formatDate();
  const todayMeals = meals.filter((meal) => meal.date === today);
  const weeklySummary = calculateWeeklySummary(records, meals, compareHistory);
  const latestReport = compareHistory[0];

  return (
    <div className="tab-shell">
      <HeroCard summary={weeklySummary} onNavigate={onNavigate} />

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>이번 주 요약</span>
            <h2>몸 변화 다이어리 현황</h2>
          </div>
        </div>
        <div className="summary-grid">
          <article>
            <span>체크인</span>
            <strong>{weeklySummary.recentRecordCount}회</strong>
          </article>
          <article>
            <span>식단 기록</span>
            <strong>{weeklySummary.recentMealCount}개</strong>
          </article>
          <article>
            <span>최근 신호</span>
            <strong>{weeklySummary.latestSignal}</strong>
          </article>
          <article>
            <span>평균 몸무게</span>
            <strong>{weeklySummary.avgWeight ? `${weeklySummary.avgWeight}kg` : "미입력"}</strong>
          </article>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>최근 비교</span>
            <h2>전후 리포트 미리보기</h2>
          </div>
          <button className="ghost-button" onClick={() => onNavigate("compare")}>
            비교하러 가기
          </button>
        </div>

        {latestReport ? (
          <div className="report-preview-card">
            <div className="report-preview-head">
              <div>
                <span className="report-kicker">{latestReport.overall_signal}</span>
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
          <div className="empty-state compact">
            <strong>아직 비교 리포트가 없어요.</strong>
            <small>기록 두 개를 쌓은 뒤 전후 비교 탭에서 바로 리포트를 만들 수 있어요.</small>
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>최근 체크인</span>
            <h2>사진 타임라인</h2>
          </div>
        </div>

        {records.length ? (
          <div className="timeline-row">
            {records.slice(0, 4).map((record) => (
              <article className="timeline-card" key={record.id}>
                <div className="timeline-image">
                  {record.frontImage ? <img src={record.frontImage} alt={`${record.date} 정면 기록`} /> : null}
                </div>
                <strong>{formatShortDate(record.date)}</strong>
                <small>
                  {record.weight ? `${record.weight}kg` : "몸무게 미입력"} · {getConditionLabel(record.condition)}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <strong>아직 첫 기록이 없어요.</strong>
            <small>정면 사진 한 장만 있어도 시작할 수 있어요.</small>
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>오늘 식단</span>
            <h2>가볍게 기록한 내용</h2>
          </div>
          <button className="ghost-button" onClick={() => onNavigate("meal")}>
            식단 입력
          </button>
        </div>

        {todayMeals.length ? (
          <div className="meal-list">
            {todayMeals.slice(0, 3).map((meal) => (
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
          <div className="empty-state compact">
            <strong>오늘 식단 기록이 아직 없어요.</strong>
            <small>간단한 메모부터 남기면 몸 변화와 연결해서 보기 쉬워집니다.</small>
          </div>
        )}
      </section>
    </div>
  );
}

function RecordTab({ draft, setDraft, onSave, saveError, isSaving, isLimitReached }) {
  const handleTextChange = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleFileChange = (field) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraft((current) => ({ ...current, [field]: dataUrl }));
  };

  return (
    <div className="tab-shell">
      <section className="section-card">
        <div className="section-head">
          <div>
            <span>오늘의 체크인</span>
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
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange("frontImage")} />
            {draft.frontImage ? (
              <img src={draft.frontImage} alt="정면 기록 미리보기" />
            ) : (
              <small>전신이 보이는 정면 사진을 올려 주세요.</small>
            )}
          </label>

          <label className="upload-card">
            <span>측면 사진</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange("sideImage")} />
            {draft.sideImage ? (
              <img src={draft.sideImage} alt="측면 기록 미리보기" />
            ) : (
              <small>가능하면 같은 거리와 조명으로 찍으면 더 좋아요.</small>
            )}
          </label>
        </div>

        <div className="field-grid">
          <label className="field-card">
            <span>몸무게</span>
            <input value={draft.weight} onChange={handleTextChange("weight")} placeholder="예: 72.4" />
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

        <label className="field-card full">
          <span>메모</span>
          <textarea
            value={draft.memo}
            onChange={handleTextChange("memo")}
            rows={4}
            placeholder="오늘 몸 상태나 운동 후 느낌, 식단 메모를 자유롭게 적어 보세요."
          />
        </label>

        <div className="tip-card">
          <strong>촬영 팁</strong>
          <p>같은 장소, 같은 거리, 비슷한 자세로 찍을수록 전후 비교 결과가 더 안정적으로 나옵니다.</p>
        </div>

        {isLimitReached ? (
          <div className="paywall-card">
            <strong>무료 체험 기록 3개를 모두 사용했어요.</strong>
            <p>정식 버전에서는 로그인 후 기록 무제한, 주간 리포트, 식단 분석 같은 기능으로 이어갈 예정입니다.</p>
          </div>
        ) : null}

        {saveError ? <p className="status error">{saveError}</p> : null}

        <button className="submit-button" onClick={onSave} disabled={isSaving || isLimitReached}>
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
    <div className="tab-shell">
      <section className="section-card">
        <div className="section-head">
          <div>
            <span>전후 비교</span>
            <h2>눈바디 변화 리포트</h2>
          </div>
        </div>

        <div className="field-grid">
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
        </div>

        <label className="field-card full">
          <span>비교 각도</span>
          <select value={angle} onChange={(event) => setAngle(event.target.value)}>
            <option value="정면">정면</option>
            <option value="측면">측면</option>
          </select>
        </label>

        {beforeRecord?.[imageField] && afterRecord?.[imageField] ? (
          <div className="compare-preview-grid">
            <div className="compare-shot">
              <span>이전</span>
              <img src={beforeRecord[imageField]} alt="이전 기록 미리보기" />
            </div>
            <div className="compare-shot">
              <span>최근</span>
              <img src={afterRecord[imageField]} alt="최근 기록 미리보기" />
            </div>
          </div>
        ) : null}

        {compareError ? <p className="status error">{compareError}</p> : null}

        <button className="submit-button" onClick={onAnalyze} disabled={isAnalyzing || records.length < 2}>
          {isAnalyzing ? "분석 중..." : "변화 리포트 만들기"}
        </button>
      </section>

      {compareResult ? (
        <section className="report-shell">
          <div className="report-hero">
            <div>
              <span className="report-kicker">{compareResult.overall_signal}</span>
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
        <section className="section-card">
          <div className="empty-state">
            <strong>기록 두 개를 고른 뒤 전후 비교를 시작해 보세요.</strong>
            <small>같은 자세, 같은 거리, 같은 각도의 사진일수록 결과가 더 자연스럽습니다.</small>
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

  const handleDraftChange = (field) => (event) => {
    setMealDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="tab-shell">
      <section className="section-card">
        <div className="section-head">
          <div>
            <span>오늘의 식단</span>
            <h2>가볍게 먹은 것 기록하기</h2>
          </div>
        </div>

        <div className="date-banner">
          <span>오늘 누적 칼로리</span>
          <strong>{todayCalories} kcal</strong>
        </div>

        <div className="field-grid">
          <label className="field-card">
            <span>식사 구분</span>
            <select value={mealDraft.type} onChange={handleDraftChange("type")}>
              {mealTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="field-card">
            <span>칼로리</span>
            <input value={mealDraft.calories} onChange={handleDraftChange("calories")} placeholder="예: 540" />
          </label>
        </div>

        <label className="field-card full">
          <span>식단 메모</span>
          <textarea
            rows={3}
            value={mealDraft.note}
            onChange={handleDraftChange("note")}
            placeholder="먹은 음식, 양, 만족감 같은 메모를 적어 보세요."
          />
        </label>

        <button className="submit-button" onClick={onAddMeal}>
          식단 기록 추가
        </button>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>오늘 기록</span>
            <h2>식사 타임라인</h2>
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
          <div className="empty-state compact">
            <strong>오늘 식단이 아직 비어 있어요.</strong>
            <small>간단한 메모만 적어도 나중에 몸 변화와 연결해 보기 쉬워집니다.</small>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileTab({ records, meals, compareHistory, onReset }) {
  const weeklySummary = calculateWeeklySummary(records, meals, compareHistory);
  const isFreeLimitReached = records.length >= FREE_RECORD_LIMIT;

  return (
    <div className="tab-shell">
      <section className="section-card profile-hero">
        <div>
          <span>현재 플랜</span>
          <h2>무료 체험 중</h2>
          <p>지금은 기기 안에만 저장되는 MVP 버전입니다. 기록이 쌓이는 감각과 전후 비교 흐름을 먼저 테스트하는 단계예요.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>사용 현황</span>
            <h2>내 다이어리 통계</h2>
          </div>
        </div>
        <div className="summary-grid">
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
          <article>
            <span>연속 기록</span>
            <strong>{weeklySummary.streak}일</strong>
          </article>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>출시 방향</span>
            <h2>프리미엄에서 들어갈 기능</h2>
          </div>
        </div>
        <div className="feature-list">
          <div className="feature-row">
            <strong>무료</strong>
            <p>기록 3개, 전후 비교, 기본 변화 리포트</p>
          </div>
          <div className="feature-row">
            <strong>유료</strong>
            <p>기록 무제한, AI 눈바디 분석, 식단 분석, 주간·월간 리포트, 공유 카드</p>
          </div>
        </div>
        <div className="paywall-card">
          <strong>{isFreeLimitReached ? "업그레이드 유도가 자연스럽게 필요한 상태예요." : "지금은 무료 체험 단계예요."}</strong>
          <p>다음 단계에서는 구글 로그인, 서버 저장, 결제, 누적 타임라인까지 붙여서 진짜 서비스처럼 확장할 수 있습니다.</p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span>테스트용 관리</span>
            <h2>로컬 데이터 초기화</h2>
          </div>
        </div>
        <p className="muted-copy">지금은 기기 저장만 쓰고 있으니, 테스트를 다시 시작하고 싶을 때 전체 기록을 지울 수 있게 해두었습니다.</p>
        <button className="secondary-button danger" onClick={onReset}>
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
      setCompareHistory(parsed.compareHistory || []);
    } catch {
      // Ignore malformed local data and start fresh.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        records,
        meals,
        compareHistory
      })
    );
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

  const recordsById = useMemo(
    () => Object.fromEntries(records.map((record) => [record.id, record])),
    [records]
  );

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

    const newRecord = {
      id: crypto.randomUUID(),
      ...recordDraft
    };

    setRecords((current) => [newRecord, ...current]);
    setRecordDraft(initialRecordDraft());
    setIsSaving(false);
    setActiveTab("home");
  };

  const addMeal = () => {
    if (!mealDraft.note.trim()) {
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      date: formatDate(),
      ...mealDraft
    };

    setMeals((current) => [entry, ...current]);
    setMealDraft(initialMealDraft);
  };

  const analyzeCompare = async () => {
    const beforeRecord = recordsById[beforeId];
    const afterRecord = recordsById[afterId];

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
      const formData = buildComparePayload(beforeRecord, afterRecord, angle);
      const response = await fetch(`${API_BASE_URL}/analyze-progress`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "비교 리포트를 만들지 못했습니다.");
      }

      const historyEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        beforeId,
        afterId,
        angle,
        ...payload
      };

      setCompareResult(historyEntry);
      setCompareHistory((current) => [historyEntry, ...current].slice(0, 20));
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
      <div className="phone-frame">
        {activeTab === "home" ? (
          <HomeTab records={records} meals={meals} compareHistory={compareHistory} onNavigate={setActiveTab} />
        ) : null}

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

        {activeTab === "meal" ? (
          <MealTab meals={meals} mealDraft={mealDraft} setMealDraft={setMealDraft} onAddMeal={addMeal} />
        ) : null}

        {activeTab === "profile" ? (
          <ProfileTab records={records} meals={meals} compareHistory={compareHistory} onReset={resetLocalData} />
        ) : null}

        <nav className="bottom-nav">
          {tabItems.map((item) => (
            <button
              key={item.id}
              className={item.id === activeTab ? "nav-item active" : "nav-item"}
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}
