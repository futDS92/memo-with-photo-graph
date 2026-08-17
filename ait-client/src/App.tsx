import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { TossAds } from "@apps-in-toss/web-framework";
import { defaultProject, seedState } from "./data/seed";
import {
  hydrateStateFromServer,
  authenticateWithGoogle,
  clearLocalState,
  loadCurrentAccount,
  loadLocalStateAsync,
  loadRanking,
  logoutFromAccount,
  saveLocalState,
  saveRankingProfile,
  syncStateToServer,
} from "./lib/storage";
import {
  relationTypes,
  type AppState,
  type Project,
  type RankingResponse,
  type RelationType,
  type Word,
} from "./types";
import {
  answerMatches,
  cardChapter,
  cardSubject,
  isDue,
  nextDue,
  type ReviewGrade,
} from "./domain/study";
import { graphColorClass, graphLayout } from "./domain/graph";
import { localizeSeedCards, normalizeWorkspace } from "./domain/workspace";
import { AIT_VERSION } from "./generated/build-version";

type View = "home" | "decks" | "study" | "mistakes" | "graph" | "stats" | "settings";
type StudyMode = "due" | "mistakes";
const TOSS_AD_GROUP_ID = import.meta.env.VITE_TOSS_AD_GROUP_ID || "";
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "683844235354-45qu9ct2r5cv9j9ddi5jedd23kunk0h4.apps.googleusercontent.com";
let tossAdsInitialization: Promise<void> | null = null;

function initializeTossAds() {
  if (!tossAdsInitialization) {
    tossAdsInitialization = new Promise((resolve, reject) => {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => resolve(),
          onInitializationFailed: () => reject(new Error("Toss Ads initialization failed")),
        },
      });
    });
  }
  return tossAdsInitialization;
}

function BannerAd() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "shown" | "empty">("idle");
  useEffect(() => {
    if (!TOSS_AD_GROUP_ID || !TossAds.initialize.isSupported() || !TossAds.attachBanner.isSupported()) {
      setStatus("empty");
      return;
    }
    setStatus("loading");
    let attached: { destroy: () => void } | undefined;
    let active = true;
    const attach = () => {
      if (!active || !containerRef.current) return;
      try {
        attached = TossAds.attachBanner(TOSS_AD_GROUP_ID, containerRef.current, {
          theme: "light",
          tone: "grey",
          variant: "expanded",
          callbacks: {
            onAdRendered: () => setStatus("shown"),
            onNoFill: () => setStatus("empty"),
            onAdFailedToRender: () => setStatus("empty"),
          },
        });
      } catch {
        setStatus("empty");
      }
    };
    initializeTossAds().then(attach).catch(() => active && setStatus("empty"));
    return () => {
      active = false;
      attached?.destroy();
    };
  }, []);
  return (
    <section className={`banner-ad ${status === "shown" ? "has-ad" : "no-ad"}`} aria-label="광고">
      <div ref={containerRef} className="banner-ad-slot" />
      {status !== "shown" && <span>{status === "loading" ? "광고 준비 중" : "광고 없음"}</span>}
    </section>
  );
}

type GoogleWindow = Window & {
  google?: {
    accounts: {
      id: {
        initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
        renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number }) => void;
      };
    };
  };
};

function GoogleSignIn({
  onAuthStarting,
  onSignedIn,
  onAuthFinished,
}: {
  onAuthStarting: () => void;
  onSignedIn: (email: string, migratedAnonymous: boolean, id: string) => void;
  onAuthFinished: () => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const onSignedInRef = useRef(onSignedIn);
  const [status, setStatus] = useState<"ready" | "disabled" | "error">("ready");
  onSignedInRef.current = onSignedIn;
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setStatus("disabled");
      return;
    }
    let timer: number | undefined;
    const render = () => {
      const google = (window as GoogleWindow).google;
      if (!google || !buttonRef.current) return false;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          onAuthStarting();
          try {
            const result = await authenticateWithGoogle(credential);
            await onSignedInRef.current(result.user.email, result.migratedAnonymous, result.user.id);
          } catch {
            setStatus("error");
          } finally {
            onAuthFinished();
          }
        },
      });
      buttonRef.current.replaceChildren();
      google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "large", width: 280 });
      return true;
    };
    if (!render()) timer = window.setInterval(() => render() && timer && window.clearInterval(timer), 250);
    return () => timer && window.clearInterval(timer);
  }, []);
  if (status === "disabled") {
    return (
      <div className="google-signin-state">
        <button className="google-signin-disabled" type="button" disabled>
          <span className="google-g-mark" aria-hidden="true">G</span>
          Google로 로그인
        </button>
        <small>Google Client ID 설정 후 활성화됩니다.</small>
      </div>
    );
  }
  if (status === "error") return <p className="account-error">Google 로그인에 실패했어요. 다시 시도해주세요.</p>;
  return <div className="google-signin" ref={buttonRef} aria-label="Google로 로그인" />;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function photoUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.78;
        let output = canvas.toDataURL("image/jpeg", quality);
        while (output.length > 1_000_000 && quality > 0.5) {
          quality -= 0.06;
          output = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(output);
      };
      image.onerror = reject;
      image.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function Icon({
  name,
}: {
  name:
    | "home"
    | "deck"
    | "plus"
    | "study"
    | "chart"
    | "graph"
    | "close"
    | "chevron"
    | "back"
    | "star";
}) {
  const paths = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6" />
      </>
    ),
    deck: (
      <>
        <rect x="4" y="4" width="15" height="16" rx="2" />
        <path d="M8 8h7M8 12h7M8 16h4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    study: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" />
        <path d="M4 5.5v12" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5M4 19h16" />
        <path d="m7 15 3-4 3 2 4-6" />
      </>
    ),
    graph: (
      <>
        <circle cx="6" cy="7" r="2" />
        <circle cx="18" cy="5" r="2" />
        <circle cx="15" cy="18" r="2" />
        <path d="m7.7 7 8.5-1M7 8.6l6.5 7.8M16.8 6.8l-1.2 9.3" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  }[name];
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

const koreanUi: Record<string, string> = {
  All: "전체",
  Other: "기타",
  concept: "개념",
  case: "사례",
  "multiple-choice": "객관식",
  related: "관련",
  "part of": "부분",
  "has part": "구성",
  hypernym: "상위",
  hyponym: "하위",
  synonym: "유의어",
  antonym: "반의어",
  example: "예시",
  "study deck": "스터디 덱",
  "Turn your syllabus into cards": "시험 내용을 카드로",
  Export: "내보내기",
  Saving: "저장 중",
  "Saved on device": "기기에 저장됨",
  Saved: "저장됨",
  "Today’s study": "오늘의 공부",
  "Review today.": "오늘 복습하고",
  "Remember more.": "더 오래 기억해요.",
  "Due today": "오늘 복습",
  "Start studying": "공부 시작",
  "Total cards": "전체 카드",
  Mistakes: "오답",
  Connections: "연결",
  Subjects: "과목",
  "Where do you want to start?": "어디부터 시작할까요?",
  "View all": "전체 보기",
  "MY DECKS": "내 카드",
  "Search questions or concepts": "질문·개념 검색",
  "No cards found": "카드가 없어요",
  "Try another search or subject.": "검색어나 과목을 바꿔 보세요.",
  "Today’s review": "오늘 복습",
  "Mistake review": "오답 복습",
  Answer: "정답",
  Formula: "공식",
  Cloze: "빈칸",
  "Choose an answer": "정답 선택",
  Question: "문제",
  "Explain the idea in your own words.": "내 말로 설명해 보세요.",
  "Recall the answer before revealing the card.": "정답을 떠올린 뒤 확인하세요.",
  "Choose the best answer.": "가장 알맞은 답을 고르세요.",
  "Reveal answer": "정답 보기",
  "Still difficult": "아직 어려워요",
  "I remembered": "기억했어요",
  "No cards are due": "복습할 카드가 없어요",
  "Add a card or come back when the next review is scheduled.":
    "카드를 추가하거나 다음 복습일에 다시 오세요.",
  REVIEW: "복습",
  "Cards that need another pass": "다시 볼 카드",
  "Start review": "복습 시작",
  "KNOWLEDGE MAP": "개념 지도",
  links: "연결",
  "Connect concepts to see how your syllabus fits together.":
    "개념을 연결해 전체 흐름을 확인하세요.",
  "From card": "출발 카드",
  "To card": "도착 카드",
  Connect: "연결하기",
  Unknown: "알 수 없음",
  "Remove connection": "연결 삭제",
  "NEW CARD": "새 카드",
  "Create a study card": "학습 카드 만들기",
  "Front · question": "앞면 · 문제",
  "Back · answer": "뒷면 · 정답",
  Subject: "과목",
  Chapter: "단원",
  Type: "유형",
  Tags: "태그",
  "Choices · comma separated": "보기 · 쉼표로 구분",
  "Memory note": "암기 메모",
  "Save card": "카드 저장",
  "Card details": "카드 상세",
  Front: "앞면",
  Back: "뒷면",
  Correct: "정답",
  Level: "레벨",
  "Study this card": "이 카드 공부",
  "Card visual": "카드 이미지",
  "Study session complete": "학습을 완료했어요",
  "Card added": "카드를 추가했어요",
  "Deck exported": "덱을 내보냈어요",
  "Deck imported": "덱을 가져왔어요",
  "Could not import this deck": "덱을 가져오지 못했어요",
  "Not quite — try again": "아직 아니에요. 다시 골라 보세요.",
  "Choose two different cards": "서로 다른 카드를 고르세요",
  "That connection already exists": "이미 연결된 카드예요",
  "Connection added": "연결했어요",
};

const studySessionKey = "memo-with-photo-graph.study-session";
function saveStudySession(session: { mode: StudyMode; ids: string[]; index: number } | null) {
  try {
    if (session) localStorage.setItem(studySessionKey, JSON.stringify(session));
    else localStorage.removeItem(studySessionKey);
  } catch {
    /* storage is optional */
  }
}
function readStudySession(): { mode: StudyMode; ids: string[]; index: number } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(studySessionKey) || "null");
    return parsed?.mode &&
      (parsed.mode === "due" || parsed.mode === "mistakes") &&
      Array.isArray(parsed.ids) &&
      typeof parsed.index === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function App() {
  const [state, setState] = useState<AppState>(() => seedState);
  const [view, setView] = useState<View>("home");
  const [currentProjectId, setCurrentProjectId] = useState(defaultProject.id);
  const [mode, setMode] = useState<StudyMode>("due");
  const [subject, setSubject] = useState("All");
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [studyIds, setStudyIds] = useState<string[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<{
    message: string;
    action: () => void;
  } | null>(null);
  const [sheet, setSheet] = useState<"add" | "detail" | "edit" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [rankingNickname, setRankingNickname] = useState(
    () => localStorage.getItem("graphflash.ranking.nickname") || "",
  );
  const [rankingOptedIn, setRankingOptedIn] = useState(
    () => localStorage.getItem("graphflash.ranking.opted-in") === "true",
  );
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState(false);
  const [rankingPeriod, setRankingPeriod] = useState<"week" | "month" | "all">("week");
  const [accountEmail, setAccountEmail] = useState(
    () => localStorage.getItem("graphflash.account.email") || "",
  );
  const [accountId, setAccountId] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem("graphflash.onboarding") !== "complete",
  );
  const [nowTick, setNowTick] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [relationFrom, setRelationFrom] = useState("");
  const [relationTo, setRelationTo] = useState("");
  const [relationType, setRelationType] = useState<RelationType>("related");
  const [clozeInput, setClozeInput] = useState("");
  const [graphSubject, setGraphSubject] = useState("All");
  const [graphSearch, setGraphSearch] = useState("");
  const [graphFocusId, setGraphFocusId] = useState("all");
  const [graphPreviewId, setGraphPreviewId] = useState<string | null>(null);
  const [graphHistory, setGraphHistory] = useState<string[]>(["all"]);
  const [graphHistoryIndex, setGraphHistoryIndex] = useState(0);
  const [graphMotion, setGraphMotion] = useState(false);
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [graphNodeOffsets, setGraphNodeOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const graphPointers = useRef(new Map<number, { x: number; y: number }>());
  const graphNodeDrag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const stateReady = useRef(false);
  const syncVersion = useRef(0);
  const syncQueue = useRef(Promise.resolve());
  const accountTransitioning = useRef(false);
  const toastTimer = useRef<number | null>(null);

  const projects = state.projects?.length ? state.projects : [defaultProject];
  const currentProject = projects.find((project) => project.id === currentProjectId) || projects[0];
  const cards = state.words.filter(
    (card) => (card.projectId || projects[0].id) === currentProject.id,
  );
  const projectRelations = useMemo(() => {
    const cardIds = new Set(cards.map((card) => card.id));
    return state.relations.filter(
      (relation) => cardIds.has(relation.fromWordId) && cardIds.has(relation.toWordId),
    );
  }, [cards, state.relations]);
  const selected = cards.find((card) => card.id === selectedId);
  const subjects = useMemo(
    () => ["All", ...Array.from(new Set([...customSubjects, ...cards.map(cardSubject)]))],
    [cards, customSubjects],
  );
  const dueCards = useMemo(() => cards.filter(isDue), [cards, nowTick]);
  const mistakeCards = useMemo(
    () => cards.filter((card) => (card.incorrectCount || 0) > (card.correctCount || 0)),
    [cards],
  );
  const filteredCards = useMemo(
    () =>
      cards.filter(
        (card) =>
          (subject === "All" || cardSubject(card) === subject) &&
          [card.term, card.definition, ...card.tags]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [cards, search, subject],
  );
  const graphSubjects = useMemo(
    () => ["All", ...Array.from(new Set(cards.map(cardSubject)))],
    [cards],
  );
  const graphCards = useMemo(() => {
    const base = cards.filter(
      (card) =>
        (graphSubject === "All" || cardSubject(card) === graphSubject) &&
        [card.term, card.definition, ...card.tags]
          .join(" ")
          .toLowerCase()
          .includes(graphSearch.trim().toLowerCase()),
    );
    if (graphFocusId === "all") return base.slice(0, 12);
    const connected = new Set([graphFocusId]);
    projectRelations.forEach((relation) => {
      if (relation.fromWordId === graphFocusId) connected.add(relation.toWordId);
      if (relation.toWordId === graphFocusId) connected.add(relation.fromWordId);
    });
    return base.filter((card) => connected.has(card.id)).slice(0, 12);
  }, [cards, graphFocusId, graphSearch, graphSubject, projectRelations]);
  const graphPositions = useMemo(
    () => graphLayout(graphCards, projectRelations),
    [graphCards, projectRelations],
  );
  const graphDisplayPositions = useMemo(
    () =>
      new Map([...graphPositions].map(([id, position]) => [id, graphNodeOffsets[id] || position])),
    [graphNodeOffsets, graphPositions],
  );
  const graphNeighbors = useMemo(() => {
    const neighbors = new Set<string>();
    if (graphFocusId === "all") return neighbors;
    neighbors.add(graphFocusId);
    projectRelations.forEach((relation) => {
      if (relation.fromWordId === graphFocusId) neighbors.add(relation.toWordId);
      if (relation.toWordId === graphFocusId) neighbors.add(relation.fromWordId);
    });
    return neighbors;
  }, [graphFocusId, projectRelations]);
  const totalAttempts = cards.reduce(
    (sum, card) => sum + (card.correctCount || 0) + (card.incorrectCount || 0),
    0,
  );
  const totalCorrect = cards.reduce((sum, card) => sum + (card.correctCount || 0), 0);
  const accuracy = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  const mastered = cards.filter((card) => (card.reviewLevel || 0) >= 3).length;
  const reviewLog = (state.reviewLog || []).filter((event) =>
    cards.some((card) => card.id === event.cardId),
  );
  const todayReviews = reviewLog.filter((event) => event.date === today());
  const studyDays = new Set(reviewLog.map((event) => event.date));
  let streak = 0;
  const streakDate = new Date();
  while (studyDays.has(streakDate.toISOString().slice(0, 10))) {
    streak += 1;
    streakDate.setDate(streakDate.getDate() - 1);
  }
  const weakCards = [...cards]
    .filter((card) => (card.incorrectCount || 0) > 0)
    .sort((a, b) => (b.incorrectCount || 0) - (a.incorrectCount || 0))
    .slice(0, 3);
  const recentReviews = [...reviewLog]
    .reverse()
    .map((event) => ({ event, card: cards.find((card) => card.id === event.cardId) }))
    .filter((item): item is { event: (typeof reviewLog)[number]; card: Word } => Boolean(item.card))
    .slice(0, 5);
  const currentCard = cards.find((card) => card.id === studyIds[studyIndex]);
  const graphPreview = cards.find((card) => card.id === graphPreviewId);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  };
  const askConfirm = (message: string, action: () => void) =>
    setConfirmRequest({ message, action });
  const finishOnboarding = () => {
    localStorage.setItem("graphflash.onboarding", "complete");
    setShowOnboarding(false);
  };
  const handleGoogleSignedIn = async (email: string, migratedAnonymous: boolean, id: string) => {
    localStorage.setItem("graphflash.account.email", email);
    setAccountEmail(email);
    setAccountId(id);
    if (!migratedAnonymous) await clearLocalState();
    const remote = await hydrateStateFromServer();
    if (remote) setState(normalizeWorkspace(localizeSeedCards(remote)));
    notify("Google 계정으로 연결했어요");
  };
  const beginAccountTransition = () => {
    accountTransitioning.current = true;
    syncVersion.current += 1;
    setSyncing(false);
  };
  const finishAccountTransition = () => {
    accountTransitioning.current = false;
  };
  const signOutAccount = async () => {
    try {
      await logoutFromAccount();
      localStorage.removeItem("graphflash.account.email");
      setAccountEmail("");
      setAccountId("");
      const local = await loadLocalStateAsync();
      setState(normalizeWorkspace(local));
      notify("계정에서 로그아웃했어요");
    } catch {
      notify("로그아웃하지 못했어요");
    }
  };
  const updateRankingProfile = async () => {
    const nickname = rankingNickname.trim();
    if (nickname.length < 2) {
      notify("닉네임을 2글자 이상 입력해주세요");
      return;
    }
    setRankingLoading(true);
    try {
      const result = await saveRankingProfile(nickname, rankingOptedIn, rankingPeriod);
      localStorage.setItem("graphflash.ranking.nickname", nickname);
      localStorage.setItem("graphflash.ranking.opted-in", String(rankingOptedIn));
      setRanking(result);
      setRankingError(false);
      notify(rankingOptedIn ? "랭킹 참여를 시작했어요" : "랭킹 참여를 해제했어요");
    } catch {
      setRankingError(true);
      notify("랭킹을 저장하지 못했어요");
    } finally {
      setRankingLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentAccount().then((account) => {
      if (!account) return;
      setAccountId(account.id);
      if (account.isAnonymous || !account.email) {
        localStorage.removeItem("graphflash.account.email");
        setAccountEmail("");
      } else {
        localStorage.setItem("graphflash.account.email", account.email);
        setAccountEmail(account.email);
      }
    });
  }, []);
  useEffect(() => {
    if (view !== "stats") return;
    setRankingLoading(true);
    loadRanking(rankingPeriod)
      .then((result) => {
        setRanking(result);
        setRankingError(false);
      })
      .catch(() => setRankingError(true))
      .finally(() => setRankingLoading(false));
  }, [view, rankingPeriod, syncTick, rankingOptedIn]);

  const focusGraphNode = (id: string) => {
    setGraphFocusId(id);
    setGraphPreviewId(id === "all" ? null : id);
    setGraphHistory((history) => [...history.slice(0, graphHistoryIndex + 1), id]);
    setGraphHistoryIndex((index) => index + 1);
  };
  const navigateGraphHistory = (direction: -1 | 1) => {
    const nextIndex = graphHistoryIndex + direction;
    if (nextIndex < 0 || nextIndex >= graphHistory.length) return;
    const nextId = graphHistory[nextIndex];
    setGraphHistoryIndex(nextIndex);
    setGraphFocusId(nextId);
    setGraphPreviewId(nextId === "all" ? null : nextId);
  };

  useEffect(() => {
    let mounted = true;
    loadLocalStateAsync().then((local) => {
      if (!mounted) return null;
      return hydrateStateFromServer(local).then((remote) => {
        if (!mounted) return null;
        const hydrated = normalizeWorkspace(localizeSeedCards(remote || local));
        setState(hydrated);
        const firstProject = hydrated.projects?.find((project) => project.id === defaultProject.id) || hydrated.projects?.[0];
        setCurrentProjectId(firstProject?.id || defaultProject.id);
        setGraphNodeOffsets(firstProject?.mapPositions || {});
        setGraphPan(firstProject?.mapPan || { x: 0, y: 0 });
        setGraphZoom(firstProject?.mapZoom || 1);
        const savedSession = readStudySession();
        if (savedSession) {
          const availableIds = savedSession.ids.filter((id) =>
            hydrated.words.some((card) => card.id === id),
          );
          if (availableIds.length) {
            setMode(savedSession.mode);
            setStudyIds(availableIds);
            setStudyIndex(Math.min(savedSession.index, availableIds.length - 1));
            setView("study");
          } else saveStudySession(null);
        }
        stateReady.current = true;
        return null;
      });
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("study-deck.subjects") || "[]");
      if (Array.isArray(saved)) {
        setCustomSubjects(saved.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      // Ignore invalid local settings.
    }
  }, []);
  useEffect(() => {
    const root = document.querySelector(".study-app");
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    nodes.forEach((text) => {
      const value = text.nodeValue?.trim() || "";
      if (koreanUi[value])
        text.nodeValue = text.nodeValue?.replace(value, koreanUi[value]) || koreanUi[value];
      else if (/^\d+ cards$/.test(value)) text.nodeValue = value.replace("cards", "장");
      else if (/^\d+ mistakes/.test(value)) text.nodeValue = value.replace("mistakes", "회 오답");
      else if (/^\d+ links$/.test(value)) text.nodeValue = value.replace("links", "개 연결");
      else if (/^Correct \d+/.test(value)) text.nodeValue = value.replace("Correct", "정답");
      else if (/^Mistakes \d+/.test(value)) text.nodeValue = value.replace("Mistakes", "오답");
      else if (/^Level \d+/.test(value)) text.nodeValue = value.replace("Level", "레벨");
    });
    root
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
      .forEach((field) => {
        if (koreanUi[field.placeholder]) field.placeholder = koreanUi[field.placeholder];
      });
    root.querySelectorAll<HTMLElement>("[aria-label]").forEach((element) => {
      if (element.getAttribute("aria-label") === "Remove connection")
        element.setAttribute("aria-label", koreanUi["Remove connection"]);
    });
  }, [view, state.words.length, state.relations.length, sheet, revealed]);
  useEffect(() => {
    document.documentElement.style.setProperty("--graph-zoom", String(graphZoom));
    document.documentElement.style.setProperty("--graph-pan-x", `${graphPan.x}px`);
    document.documentElement.style.setProperty("--graph-pan-y", `${graphPan.y}px`);
  }, [graphPan, graphZoom]);
  useEffect(() => {
    const savedProject = currentProject;
    setGraphNodeOffsets(savedProject.mapPositions || {});
    setGraphPan(savedProject.mapPan || { x: 0, y: 0 });
    setGraphZoom(savedProject.mapZoom || 1);
  }, [currentProject.id]);
  useEffect(() => {
    if (view !== "graph") return;
    setGraphMotion(true);
    const timer = window.setTimeout(() => setGraphMotion(false), 2600);
    return () => window.clearTimeout(timer);
  }, [view, currentProject.id, projectRelations.length]);
  useEffect(() => {
    if (!stateReady.current || view !== "graph") return;
    const timer = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        projects: (current.projects || projects).map((project) =>
          project.id === currentProject.id
            ? { ...project, mapPositions: graphNodeOffsets, mapPan: graphPan, mapZoom: graphZoom }
            : project,
        ),
      }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [currentProject.id, graphNodeOffsets, graphPan, graphZoom, view]);
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".graph-canvas");
    if (!canvas || view !== "graph") return;
    let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
    let pinchDistance = 0;
    const distance = () => {
      const points = [...graphPointers.current.values()];
      return points.length === 2
        ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        : 0;
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("button, input, select, a, .graph-node")) return;
      canvas.setPointerCapture(event.pointerId);
      graphPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (graphPointers.current.size === 1)
        dragStart = { x: event.clientX, y: event.clientY, panX: graphPan.x, panY: graphPan.y };
      else pinchDistance = distance();
    };
    const onMove = (event: PointerEvent) => {
      if (!graphPointers.current.has(event.pointerId)) return;
      graphPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (graphPointers.current.size === 2) {
        const nextDistance = distance();
        if (pinchDistance > 0)
          setGraphZoom((zoom) =>
            Math.max(
              0.8,
              Math.min(1.4, Number((zoom * (nextDistance / pinchDistance)).toFixed(2))),
            ),
          );
        pinchDistance = nextDistance;
      } else if (graphPointers.current.size === 1)
        setGraphPan({
          x: dragStart.panX + event.clientX - dragStart.x,
          y: dragStart.panY + event.clientY - dragStart.y,
        });
    };
    const onUp = (event: PointerEvent) => {
      graphPointers.current.delete(event.pointerId);
      if (graphPointers.current.size < 2) pinchDistance = 0;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      graphPointers.current.clear();
    };
  }, [view]);
  useEffect(() => {
    const retry = () => setSyncTick((tick) => tick + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    if (!stateReady.current || accountTransitioning.current) return;
    const version = ++syncVersion.current;
    setSyncing(true);
    saveLocalState(state);
    const timer = window.setTimeout(() => {
      syncQueue.current = syncQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (version !== syncVersion.current) return;
          try {
            if (accountTransitioning.current) return;
            await syncStateToServer(state);
            if (version === syncVersion.current) {
              setSyncing(false);
              setSyncError(false);
            }
          } catch {
            if (version === syncVersion.current) {
              setSyncing(false);
              setSyncError(true);
            }
          }
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [state, syncTick]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((tick) => tick + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const openStudy = (studyMode: StudyMode) => {
    const source = studyMode === "mistakes" ? mistakeCards : dueCards;
    const ids = source.map((card) => card.id);
    setMode(studyMode);
    setStudyIds(ids);
    setStudyIndex(0);
    setRevealed(false);
    setSelectedChoice(null);
    setClozeInput("");
    setView("study");
    saveStudySession({ mode: studyMode, ids, index: 0 });
  };
  const gradeCard = (grade: ReviewGrade) => {
    if (!currentCard) return;
    const level =
      grade === "again"
        ? Math.max((currentCard.reviewLevel || 0) - 1, 0)
        : grade === "easy"
          ? (currentCard.reviewLevel || 0) + 2
          : (currentCard.reviewLevel || 0) + 1;
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: now,
      words: current.words.map((card) =>
        card.id === currentCard.id
          ? {
              ...card,
              reviewLevel: level,
              reviewDueAt: nextDue(level, grade),
              lastReviewedAt: now,
              correctCount: (card.correctCount || 0) + (grade === "again" ? 0 : 1),
              incorrectCount: (card.incorrectCount || 0) + (grade === "again" ? 1 : 0),
            }
          : card,
      ),
      reviewLog: [
        ...(current.reviewLog || []),
        { id: newId("review"), cardId: currentCard.id, date: today(), correct: grade !== "again" },
      ].slice(-500),
    }));
    if (studyIndex + 1 >= studyIds.length) {
      setView("home");
      saveStudySession(null);
      notify("Study session complete");
    } else {
      const nextIndex = studyIndex + 1;
      setStudyIndex(nextIndex);
      saveStudySession({ mode, ids: studyIds, index: nextIndex });
      setRevealed(false);
      setSelectedChoice(null);
      setClozeInput("");
    }
  };
  const addCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get("question") || "").trim();
    const answer = String(data.get("answer") || "").trim();
    if (!question || !answer) return;
    if (cards.some((card) => card.term.trim().toLowerCase() === question.toLowerCase())) {
      notify("A card with the same question already exists");
      return;
    }
    const file = data.get("photo-library") || data.get("photo-camera");
    let photo = "";
    if (file instanceof File && file.size) {
      try {
        photo = await photoUrl(file);
      } catch {
        notify("The image could not be processed");
        return;
      }
    }
    const choices = String(data.get("choices") || "")
      .split(",")
      .map((choice) => choice.trim())
      .filter(Boolean);
    const newCard: Word = {
      id: newId("card"),
      projectId: currentProject.id,
      term: question,
      definition: answer,
      pos: String(data.get("subject") || "Other"),
      example: String(data.get("chapter") || "Core Concepts"),
      memo: String(data.get("memo") || ""),
      tags: String(data.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      photo,
      cardType: String(data.get("type") || "concept") as Word["cardType"],
      choices,
      reviewLevel: 0,
      correctCount: 0,
      incorrectCount: 0,
    };
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: [newCard, ...current.words],
    }));
    event.currentTarget.reset();
    setSheet(null);
    notify("Card added");
  };
  const updateBookmark = (id: string) =>
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: current.words.map((card) =>
        card.id === id ? { ...card, isBookmarked: !card.isBookmarked } : card,
      ),
    }));
  const deleteCard = (id: string) => {
    const nextIds = studyIds.filter((studyId) => studyId !== id);
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: current.words.filter((card) => card.id !== id),
      relations: current.relations.filter(
        (relation) => relation.fromWordId !== id && relation.toWordId !== id,
      ),
    }));
    setStudyIds(nextIds);
    setStudyIndex((index) => Math.min(index, Math.max(nextIds.length - 1, 0)));
    if (nextIds.length)
      saveStudySession({ mode, ids: nextIds, index: Math.min(studyIndex, nextIds.length - 1) });
    else saveStudySession(null);
    if (graphFocusId === id) focusGraphNode("all");
    setSelectedId(null);
    setSheet(null);
    notify("카드를 삭제했어요");
  };
  const deleteSelectedCards = () => {
    if (!selectedCardIds.length) return;
    const ids = new Set(selectedCardIds);
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: current.words.filter((card) => !ids.has(card.id)),
      relations: current.relations.filter(
        (relation) => !ids.has(relation.fromWordId) && !ids.has(relation.toWordId),
      ),
    }));
    setStudyIds((current) => current.filter((id) => !ids.has(id)));
    setSelectedCardIds([]);
    setSelectionMode(false);
    notify(`${ids.size}장의 카드를 삭제했어요`);
  };
  const resetCurrentProject = () => {
    const projectId = currentProject.id;
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: current.words.filter((card) => card.projectId !== projectId),
      relations: current.relations.filter((relation) => {
        const from = current.words.find((card) => card.id === relation.fromWordId);
        const to = current.words.find((card) => card.id === relation.toWordId);
        return from?.projectId !== projectId && to?.projectId !== projectId;
      }),
    }));
    setSelectedCardIds([]);
    notify("현재 프로젝트를 초기화했어요");
  };
  const editCard = (card: Word) => {
    setEditingId(card.id);
    setSheet("edit");
  };
  const removePhoto = (id: string) => {
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: current.words.map((card) => (card.id === id ? { ...card, photo: "" } : card)),
    }));
    setPhotoOpen(false);
    notify("사진을 삭제했어요");
  };
  const updateCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const card = cards.find((item) => item.id === editingId);
    if (!card) return;
    const data = new FormData(event.currentTarget);
    const term = String(data.get("question") || "").trim();
    const definition = String(data.get("answer") || "").trim();
    if (!term || !definition) return;
    if (
      cards.some(
        (item) => item.id !== card.id && item.term.trim().toLowerCase() === term.toLowerCase(),
      )
    ) {
      notify("같은 문제가 이미 있어요");
      return;
    }
    const file = data.get("photo-library") || data.get("photo-camera");
    let photo = card.photo;
    if (file instanceof File && file.size) {
      try {
        photo = await photoUrl(file);
      } catch {
        notify("사진을 처리하지 못했어요");
        return;
      }
    }
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      words: current.words.map((item) =>
        item.id === card.id
          ? {
              ...item,
              term,
              definition,
              photo,
              pos: String(data.get("subject") || item.pos || "기타"),
              example: String(data.get("chapter") || item.example || "기본"),
              memo: String(data.get("memo") || ""),
              tags: String(data.get("tags") || "")
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            }
          : item,
      ),
    }));
    setSheet("detail");
    notify("카드를 수정했어요");
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...state, schemaVersion: 2 }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "study-deck.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Deck exported");
  };
  const chooseAnswer = (choice: string) => {
    if (!currentCard) return;
    if (answerMatches(choice, currentCard.definition)) {
      setSelectedChoice(choice);
      setRevealed(true);
    } else {
      setSelectedChoice(choice);
      setState((current) => ({
        ...current,
        schemaVersion: 2,
        updatedAt: new Date().toISOString(),
        words: current.words.map((card) =>
          card.id === currentCard.id
            ? { ...card, incorrectCount: (card.incorrectCount || 0) + 1 }
            : card,
        ),
      }));
      notify("Not quite — try again");
    }
  };
  const addRelation = () => {
    if (!relationFrom || !relationTo || relationFrom === relationTo) {
      notify("Choose two different cards");
      return;
    }
    if (
      projectRelations.some(
        (relation) =>
          relation.fromWordId === relationFrom &&
          relation.toWordId === relationTo &&
          relation.type === relationType,
      )
    ) {
      notify("That connection already exists");
      return;
    }
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      relations: [
        ...current.relations,
        {
          id: newId("relation"),
          fromWordId: relationFrom,
          toWordId: relationTo,
          type: relationType,
        },
      ],
    }));
    notify("Connection added");
  };
  const removeRelation = (id: string) =>
    setState((current) => ({
      ...current,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      relations: current.relations.filter((relation) => relation.id !== id),
    }));
  const addSubject = () => {
    const value = newSubject.trim();
    if (!value || value === "All" || subjects.includes(value)) return;
    const next = [...customSubjects, value];
    setCustomSubjects(next);
    localStorage.setItem("study-deck.subjects", JSON.stringify(next));
    setNewSubject("");
    notify("과목을 추가했어요");
  };
  const removeSubject = (value: string) => {
    const next = customSubjects.filter((subjectName) => subjectName !== value);
    setCustomSubjects(next);
    localStorage.setItem("study-deck.subjects", JSON.stringify(next));
  };
  const addProject = () => {
    const name = newProjectName.trim();
    if (!name || projects.some((project) => project.name === name)) return;
    const project: Project = {
      id: newId("project"),
      name,
      color: ["#3182F6", "#30A46C", "#E89127", "#9B6BFF"][projects.length % 4],
    };
    setState((current) => ({
      ...current,
      projects: [...(current.projects || projects), project],
      updatedAt: new Date().toISOString(),
      schemaVersion: 2,
    }));
    setCurrentProjectId(project.id);
    setNewProjectName("");
    setView("home");
    notify("프로젝트를 만들었어요");
  };
  const removeProject = (projectId: string) => {
    if (projects.length <= 1) return;
    const nextProjects = projects.filter((project) => project.id !== projectId);
    const nextProjectId = nextProjects[0].id;
    setState((current) => ({
      ...current,
      projects: nextProjects,
      words: current.words.filter((word) => word.projectId !== projectId),
      relations: current.relations.filter(
        (relation) =>
          current.words.some(
            (word) => word.id === relation.fromWordId && word.projectId !== projectId,
          ) &&
          current.words.some(
            (word) => word.id === relation.toWordId && word.projectId !== projectId,
          ),
      ),
      updatedAt: new Date().toISOString(),
      schemaVersion: 2,
    }));
    setCurrentProjectId(nextProjectId);
    notify("프로젝트를 삭제했어요");
  };

  return (
    <main className="study-app">
      {showOnboarding && (
        <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
          <div className="onboarding-card">
            <img src="./brand/graphflash-logo-3d.png" alt="" />
            <p>PHOTO-FIRST STUDY</p>
            <h1 id="onboarding-title">사진과 연결로<br />더 오래 기억하세요</h1>
            <span>카드를 만들고, 맵으로 개념을 연결한 뒤 오늘 복습할 내용을 바로 시작해요.</span>
            <button type="button" onClick={finishOnboarding}>GraphFlash 시작하기</button>
            <button className="onboarding-skip" type="button" onClick={finishOnboarding}>다음에 볼게요</button>
          </div>
        </div>
      )}
      {photoOpen && selected?.photo && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-label="사진 크게 보기"
          onClick={() => setPhotoOpen(false)}
        >
          <img src={selected.photo} alt="확대 사진" />
          <button type="button" onClick={() => setPhotoOpen(false)} aria-label="닫기">
            ×
          </button>
        </div>
      )}
      {sheet === "edit" && selected && (
        <div className="study-sheet">
          <div className="sheet-dim" onClick={() => setSheet("detail")} />
          <div className="study-sheet-panel">
            <div className="sheet-grab" />
            <div className="sheet-title">
              <div>
                <p>카드 편집</p>
                <h2>내용을 수정하세요</h2>
              </div>
              <button type="button" onClick={() => setSheet("detail")}>
                <Icon name="close" />
              </button>
            </div>
            <form className="card-form" onSubmit={updateCard}>
              <label>
                문제
                <input name="question" defaultValue={selected.term} autoFocus required />
              </label>
              <label>
                정답
                <textarea name="answer" rows={4} defaultValue={selected.definition} required />
              </label>
              <div className="photo-input">
                <span>사진 추가</span>
                <div className="photo-source-row">
                  <label>
                    보관함에서 선택
                    <input name="photo-library" type="file" accept="image/*" />
                  </label>
                  <label>
                    카메라로 촬영
                    <input name="photo-camera" type="file" accept="image/*" capture="environment" />
                  </label>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  과목
                  <input name="subject" defaultValue={selected.pos} />
                </label>
                <label>
                  단원
                  <input name="chapter" defaultValue={selected.example} />
                </label>
              </div>
              <label>
                태그
                <input name="tags" defaultValue={selected.tags.join(", ")} />
              </label>
              <label>
                암기 메모
                <textarea name="memo" rows={2} defaultValue={selected.memo} />
              </label>
              <button className="known wide" type="submit">
                저장
              </button>
            </form>
          </div>
        </div>
      )}
      {view === "stats" && (
        <section className="study-content stats-page">
          <div className="study-page-title">
            <div>
              <p>학습 기록</p>
              <h1>통계</h1>
            </div>
          </div>
          <div className="stats-hero">
            <strong>{accuracy}%</strong>
            <span>전체 정답률</span>
            <small>{totalAttempts ? `${totalAttempts}회 풀이` : "아직 기록이 없어요"}</small>
          </div>
          <div className="stats-grid">
            <div>
              <strong>{cards.length}</strong>
              <small>전체 카드</small>
            </div>
            <div>
              <strong>{mastered}</strong>
              <small>익힌 카드</small>
            </div>
            <div>
              <strong>{dueCards.length}</strong>
              <small>오늘 복습</small>
            </div>
            <div>
              <strong>{mistakeCards.length}</strong>
              <small>오답 카드</small>
            </div>
            <div>
              <strong>{todayReviews.length}</strong>
              <small>오늘 풀이</small>
            </div>
            <div>
              <strong>{streak}일</strong>
              <small>학습 연속</small>
            </div>
          </div>
          <div className="stats-subjects">
            <strong>과목별 카드</strong>
            {subjects.slice(1).map((item) => (
              <div key={item}>
                <span>{item}</span>
                <small>
                  {cards.filter((card) => cardSubject(card) === item).length}장 ·{" "}
                  {cards.filter((card) => cardSubject(card) === item && isDue(card)).length}장 복습
                </small>
              </div>
            ))}
          </div>
          <div className="stats-subjects recent-list">
            <strong>최근 학습</strong>
            {recentReviews.length ? (
              recentReviews.map(({ event, card }) => (
                <button
                  type="button"
                  key={event.id}
                  onClick={() => {
                    setSelectedId(card.id);
                    setSheet("detail");
                  }}
                >
                  <span>{card.term}</span>
                  <small className={event.correct ? "review-good" : "review-bad"}>
                    {event.correct ? "정답" : "다시 보기"} · {event.date}
                  </small>
                </button>
              ))
            ) : (
              <small>학습을 시작하면 최근 기록이 표시돼요.</small>
            )}
          </div>
          <div className="stats-subjects stats-weak-list">
            <strong>다시 볼 개념</strong>
            {weakCards.length ? (
              weakCards.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  onClick={() => {
                    setSelectedId(card.id);
                    setSheet("detail");
                  }}
                >
                  <span>{card.term}</span>
                  <small>{card.incorrectCount || 0}회 오답 · 카드 열기</small>
                </button>
              ))
            ) : (
              <small>아직 오답 기록이 없어요.</small>
            )}
          </div>
          <section className="ranking-panel" aria-labelledby="ranking-title">
            <div className="ranking-head">
              <div>
                <strong id="ranking-title">주간 랭킹</strong>
                <small>이번 주 학습 기록으로 비교해요</small>
              </div>
              {ranking?.me && <b>내 순위 {ranking.me.rank}위</b>}
            </div>
            <div className="ranking-period-tabs" role="tablist" aria-label="랭킹 기간">
              {(["week", "month", "all"] as const).map((period) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={rankingPeriod === period}
                  className={rankingPeriod === period ? "active" : ""}
                  key={period}
                  onClick={() => setRankingPeriod(period)}
                >
                  {period === "week" ? "주간" : period === "month" ? "월간" : "전체"}
                </button>
              ))}
            </div>
            <div className="ranking-profile">
              <label>
                닉네임
                <input
                  value={rankingNickname}
                  maxLength={20}
                  onChange={(event) => setRankingNickname(event.target.value)}
                  placeholder="예: 데이터마스터"
                />
              </label>
              <label className="ranking-consent">
                <input
                  type="checkbox"
                  checked={rankingOptedIn}
                  onChange={(event) => setRankingOptedIn(event.target.checked)}
                />
                <span>익명 닉네임으로 주간 랭킹에 참여할게요</span>
              </label>
              <button type="button" onClick={updateRankingProfile} disabled={rankingLoading}>
                {rankingLoading ? "불러오는 중" : rankingOptedIn ? "랭킹 업데이트" : "참여 설정 저장"}
              </button>
            </div>
            {rankingError ? (
              <p className="ranking-empty">랭킹 서버에 연결할 수 없어요. 학습 기록은 안전하게 기기에 저장되어 있어요.</p>
            ) : ranking?.entries.length ? (
              <div className="ranking-list">
                {ranking.entries.slice(0, 10).map((entry) => (
                  <div className={entry.isMe ? "is-me" : ""} key={`${entry.rank}-${entry.nickname}`}>
                    <strong>{entry.rank}</strong>
                    <span>{entry.nickname}{entry.isMe ? " (나)" : ""}</span>
                    <small>{entry.score}점 · {entry.reviewCount}회 학습</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ranking-empty">참여자가 생기면 이곳에 주간 랭킹이 표시돼요.</p>
            )}
          </section>
        </section>
      )}
      {view === "settings" && (
        <section className="study-content settings-page">
          <div className="study-page-title">
            <div>
              <p>WORKSPACE</p>
              <h1>Settings</h1>
            </div>
            <button className="settings-export" type="button" onClick={exportJson}>
              Export
            </button>
          </div>
          <div className="settings-section">
            <div className="settings-section-head">
              <div>
                <strong>Projects</strong>
                <small>Each project has its own cards, photos, study history, and map.</small>
              </div>
            </div>
            <form
              className="subject-create"
              onSubmit={(event) => {
                event.preventDefault();
                addProject();
              }}
            >
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="New project name"
                aria-label="새 프로젝트"
              />
              <button className="known" type="submit">
                Create
              </button>
            </form>
            <div className="settings-project-list">
              {projects.map((project) => (
                <div key={project.id} className={project.id === currentProject.id ? "active" : ""}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentProjectId(project.id);
                      setView("home");
                    }}
                  >
                    <span
                      className="project-color"
                      style={{ background: project.color || "#3182F6" }}
                    />
                    <span>
                      <strong>{project.name}</strong>
                      <small>
                        {
                          state.words.filter(
                            (card) => (card.projectId || projects[0].id) === project.id,
                          ).length
                        }{" "}
                        cards
                      </small>
                    </span>
                  </button>
                  {projects.length > 1 && (
                    <button
                      className="settings-remove"
                      type="button"
                      onClick={() => {
                        askConfirm("이 프로젝트와 카드·맵을 삭제할까요?", () =>
                          removeProject(project.id),
                        );
                      }}
                      aria-label={`${project.name} 프로젝트 삭제`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="settings-section account-section">
            <div className="settings-section-head">
              <div>
                <strong>계정 연결</strong>
                <small>
                  {accountEmail
                    ? `${accountEmail}로 연결됨`
                    : `익명 계정 · ${accountId ? accountId.slice(-8) : "확인 중"}`}
                </small>
              </div>
            </div>
            <GoogleSignIn
              onAuthStarting={beginAccountTransition}
              onSignedIn={handleGoogleSignedIn}
              onAuthFinished={finishAccountTransition}
            />
            {accountEmail && (
              <button className="account-signout" type="button" onClick={() => askConfirm("이 기기에서 계정을 로그아웃할까요?", signOutAccount)}>
                로그아웃
              </button>
            )}
          </div>
          <div className="settings-section">
            <div className="settings-section-head">
              <div>
                <strong>Subjects</strong>
                <small>Organize your cards by exam subject.</small>
              </div>
            </div>
            <form
              className="subject-create"
              onSubmit={(event) => {
                event.preventDefault();
                addSubject();
              }}
            >
              <input
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder="Add a subject"
                aria-label="새 과목"
              />
              <button className="known" type="submit">
                Add
              </button>
            </form>
            <div className="settings-subject-list">
              {subjects
                .filter((item) => item !== "All")
                .map((item) => {
                  const custom = customSubjects.includes(item);
                  return (
                    <div key={item}>
                      <button
                        type="button"
                        onClick={() => {
                          setSubject(item);
                          setView("decks");
                        }}
                      >
                        <span className="subject-dot" />
                        <strong>{item}</strong>
                        <small>
                          {cards.filter((card) => cardSubject(card) === item).length} cards
                        </small>
                      </button>
                      {custom && (
                        <button
                          className="settings-remove"
                          type="button"
                          onClick={() => removeSubject(item)}
                          aria-label={`${item} 과목 삭제`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="settings-section settings-note">
            <strong>Local-first workspace</strong>
            <small>
              Your cards, photos, map positions, and study progress stay on this device and sync
              when the API is available.
            </small>
          </div>
          <div className="settings-section settings-note build-version-note">
            <strong>AIT version</strong>
            <small>{AIT_VERSION} · 날짜 기준 자동 빌드 버전</small>
          </div>
          <div className="settings-section settings-danger-zone">
            <strong>프로젝트 초기화</strong>
            <small>현재 프로젝트의 카드·사진·연결을 모두 삭제합니다.</small>
            <button
              type="button"
              onClick={() => askConfirm("현재 프로젝트를 초기화할까요?", resetCurrentProject)}
            >
              현재 프로젝트 비우기
            </button>
          </div>
        </section>
      )}

      {view === "graph" && (
        <div className="graph-controls">
          <select
            value={graphSubject}
            onChange={(event) => {
              setGraphSubject(event.target.value);
              focusGraphNode("all");
            }}
            aria-label="과목 필터"
          >
            {graphSubjects.map((item) => (
              <option value={item} key={item}>
                {item === "All" ? "전체 과목" : item}
              </option>
            ))}
          </select>
          <select
            value={graphFocusId}
            onChange={(event) => focusGraphNode(event.target.value)}
            aria-label="중심 개념"
          >
            <option value="all">전체 개념</option>
            {cards
              .filter((card) => graphSubject === "All" || cardSubject(card) === graphSubject)
              .map((card) => (
                <option value={card.id} key={card.id}>
                  {card.term}
                </option>
              ))}
          </select>
          <input
            className="graph-search"
            value={graphSearch}
            onChange={(event) => setGraphSearch(event.target.value)}
            placeholder="맵에서 개념 검색"
            aria-label="맵에서 개념 검색"
          />
          <svg className="graph-markers" aria-hidden="true">
            <defs>
              <marker
                id="graph-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 z" />
              </marker>
            </defs>
          </svg>
        </div>
      )}
      <header className="study-topbar">
        <button className="study-brand brand-button" type="button" onClick={() => setView("home")} aria-label="홈으로 이동">
          <img className="study-logo" src="./brand/graphflash-logo-3d.png" alt="GraphFlash" />
          <div>
            <strong>GraphFlash</strong>
          </div>
        </button>
        <label className="project-picker">
          <span>프로젝트 선택</span>
          <select
            className="project-switcher"
            value={currentProject.id}
            onChange={(event) => {
              setCurrentProjectId(event.target.value);
              setSubject("All");
              focusGraphNode("all");
              setView("home");
            }}
            aria-label="프로젝트 선택"
          >
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <div className="data-actions">
          <span
            className={`sync-status ${syncError ? "error" : syncing ? "saving" : ""}`}
            role="status"
            aria-live="polite"
          >
            {syncing ? "저장 중" : syncError ? "오프라인 저장" : "저장됨"}
          </span>
          <button className="data-button settings-button" type="button" onClick={() => setView("settings")} aria-label="설정">
            ⚙
          </button>
        </div>
      </header>

      {view === "home" && (
        <section className="study-home">
          <div className="study-greeting">
            <p>Today’s study</p>
            <h1>
              Review today.
              <br />
              <em>Remember more.</em>
            </h1>
          </div>
          <button className="hero-study" type="button" onClick={() => openStudy("due")}>
            <span>
              <small>Due today</small>
              <strong>{dueCards.length} cards</strong>
              <b>
                Start studying <Icon name="chevron" />
              </b>
            </span>
            <div className="hero-ring">
              <span>
                {cards.length
                  ? Math.round(((cards.length - dueCards.length) / cards.length) * 100)
                  : 0}
                %
              </span>
            </div>
          </button>
          <div className="quick-grid">
            <button type="button" onClick={() => setView("decks")}>
              <Icon name="deck" />
              <strong>{cards.length}</strong>
              <small>Total cards</small>
            </button>
            <button type="button" onClick={() => setView("mistakes")}>
              <Icon name="study" />
              <strong>{mistakeCards.length}</strong>
              <small>Mistakes</small>
            </button>
            <button type="button" onClick={() => setView("stats")}>
              <Icon name="chart" />
              <strong>{accuracy}%</strong>
              <small>Accuracy</small>
            </button>
          </div>
          <BannerAd />
          <div className="study-section-head">
            <div>
              <p>Subjects</p>
              <h2>Where do you want to start?</h2>
            </div>
            <button type="button" onClick={() => setView("decks")}>
              View all
            </button>
          </div>
          <div className="subject-list">
            {subjects.slice(1, 5).map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => {
                  setSubject(item);
                  setView("decks");
                }}
              >
                <span className="subject-dot" />
                <span>
                  <strong>{item}</strong>
                  <small>
                    {cards.filter((card) => cardSubject(card) === item).length} cards ·{" "}
                    {cards.filter((card) => cardSubject(card) === item && isDue(card)).length} due
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "decks" && (
        <section className="study-content">
          <div className="study-page-title">
            <div>
              <p>MY DECKS</p>
              <h1>Cards</h1>
            </div>
            <div className="deck-head-actions">
              <button
                className="select-toggle"
                type="button"
                onClick={() => {
                  setSelectionMode((mode) => !mode);
                  setSelectedCardIds([]);
                }}
              >
                {selectionMode ? "완료" : "선택"}
              </button>
              <button className="round-add" type="button" onClick={() => setSheet("add")}>
                <Icon name="plus" />
              </button>
            </div>
          </div>
          <label className="study-search">
            <span>⌕</span>
            <input
              placeholder="Search questions or concepts"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="subject-tabs">
            {subjects.map((item) => (
              <button
                className={subject === item ? "active" : ""}
                key={item}
                type="button"
                onClick={() => setSubject(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {selectionMode && (
            <div className="bulk-toolbar">
              <span>{selectedCardIds.length}장 선택</span>
              <button
                type="button"
                disabled={!selectedCardIds.length}
                onClick={() =>
                  askConfirm(`${selectedCardIds.length}장의 카드를 삭제할까요?`, deleteSelectedCards)
                }
              >
                선택 삭제
              </button>
            </div>
          )}
          <div className="card-list">
            {filteredCards.length ? (
              filteredCards.map((card) => (
                <div
                  className="study-card-row photo-card-row"
                  role="button"
                  tabIndex={0}
                  key={card.id}
                  onClick={() => {
                    if (selectionMode) {
                      setSelectedCardIds((ids) =>
                        ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id],
                      );
                    } else {
                      setSelectedId(card.id);
                      setSheet("detail");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (selectionMode) {
                        setSelectedCardIds((ids) =>
                          ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id],
                        );
                      } else {
                        setSelectedId(card.id);
                        setSheet("detail");
                      }
                    }
                  }}
                >
                  {card.photo ? (
                    <img className="row-photo" src={card.photo} alt="" />
                  ) : (
                    <span className="type-mark">
                      {card.cardType === "formula" ? "ƒ" : card.cardType === "case" ? "↗" : "?"}
                    </span>
                  )}
                  {selectionMode && (
                    <span className={`card-select-mark ${selectedCardIds.includes(card.id) ? "selected" : ""}`} aria-hidden="true">
                      {selectedCardIds.includes(card.id) ? "✓" : ""}
                    </span>
                  )}
                  <span>
                    <strong>{card.term}</strong>
                    <small>
                      {cardSubject(card)} · {cardChapter(card)}
                    </small>
                    {card.memo && <em>{card.memo}</em>}
                  </span>
                  <button
                    className={`bookmark ${card.isBookmarked ? "active" : ""}`}
                    type="button"
                    aria-label={`Bookmark ${card.term}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateBookmark(card.id);
                    }}
                  >
                    <Icon name="star" />
                  </button>
                </div>
              ))
            ) : (
              <div className="study-empty">
                <strong>No cards found</strong>
                <small>Try another search or subject.</small>
              </div>
            )}
          </div>
        </section>
      )}

      {view === "study" && (
        <section className="study-content study-session">
          <button className="back-button" type="button" onClick={() => setView("home")}>
            <Icon name="back" />
            {mode === "mistakes" ? "Mistake review" : "Today’s review"}
          </button>
          <div className="session-meta">
            <span>
              {Math.min(studyIndex + 1, studyIds.length)} / {studyIds.length}
            </span>
            <div>
              <span
                style={{
                  width: `${Math.min((studyIndex / Math.max(studyIds.length, 1)) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
          {currentCard ? (
            <>
              <div className={`flash-card ${revealed ? "revealed" : ""}`}>
                <div className="flash-top">
                  <span>{cardSubject(currentCard)}</span>
                  <button
                    type="button"
                    onClick={() => updateBookmark(currentCard.id)}
                    className={currentCard.isBookmarked ? "active" : ""}
                  >
                    <Icon name="star" />
                  </button>
                </div>
                {currentCard.photo && <img src={currentCard.photo} alt="Card visual" />}
                <p className="flash-label">
                  {revealed
                    ? "Answer"
                    : currentCard.cardType === "formula"
                      ? "Formula"
                      : currentCard.cardType === "cloze"
                        ? "Cloze"
                        : currentCard.cardType === "multiple-choice"
                          ? "Choose an answer"
                          : "Question"}
                </p>
                <h2>{revealed ? currentCard.definition : currentCard.term}</h2>
                {currentCard.memo && <p className="flash-memo photo-memory">{currentCard.memo}</p>}
                {!revealed &&
                currentCard.cardType === "multiple-choice" &&
                currentCard.choices?.length ? (
                  <div className="choice-list">
                    {currentCard.choices.map((choice) => (
                      <button
                        className={selectedChoice === choice ? "selected" : ""}
                        type="button"
                        key={choice}
                        onClick={() => chooseAnswer(choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!revealed && currentCard.cardType === "cloze" ? (
                  <div className="cloze-answer">
                    <input
                      value={clozeInput}
                      onChange={(event) => setClozeInput(event.target.value)}
                      placeholder="답을 입력하세요"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (answerMatches(clozeInput, currentCard.definition)) setRevealed(true);
                        else notify("다시 생각해 보세요");
                      }}
                    >
                      확인
                    </button>
                  </div>
                ) : null}
                <small>
                  {revealed
                    ? "Explain the idea in your own words."
                    : currentCard.cardType === "multiple-choice" || currentCard.cardType === "cloze"
                      ? "Answer before revealing."
                      : "Recall the answer before revealing the card."}
                </small>
              </div>
              {revealed ? (
                <div className="grade-actions">
                  <button className="again" type="button" onClick={() => gradeCard("again")}>
                    다시
                  </button>
                  <button className="hard" type="button" onClick={() => gradeCard("hard")}>
                    어려움
                  </button>
                  <button className="known" type="button" onClick={() => gradeCard("good")}>
                    보통
                  </button>
                  <button className="easy" type="button" onClick={() => gradeCard("easy")}>
                    쉬움
                  </button>
                </div>
              ) : currentCard.cardType !== "cloze" ? (
                <button className="flip-button" type="button" onClick={() => setRevealed(true)}>
                  Reveal answer
                </button>
              ) : null}
            </>
          ) : (
            <div className="study-empty">
              <strong>No cards are due</strong>
              <small>Add a card or come back when the next review is scheduled.</small>
            </div>
          )}
        </section>
      )}

      {view === "mistakes" && (
        <section className="study-content">
          <div className="study-page-title">
            <div>
              <p>REVIEW</p>
              <h1>Mistakes</h1>
            </div>
          </div>
          <div className="mistake-summary">
            <strong>{mistakeCards.length} cards</strong>
            <span>Cards that need another pass</span>
            <button type="button" onClick={() => openStudy("mistakes")}>
              Start review
            </button>
          </div>
          <div className="card-list">
            {mistakeCards.map((card) => (
              <button
                className="study-card-row"
                type="button"
                key={card.id}
                onClick={() => {
                  setSelectedId(card.id);
                  setSheet("detail");
                }}
              >
                <span className="type-mark wrong">!</span>
                <span>
                  <strong>{card.term}</strong>
                  <small>
                    {card.incorrectCount || 0} mistakes · {cardSubject(card)}
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "graph" && (
        <section className="study-content graph-page">
          <div className="study-page-title">
            <div>
              <p>KNOWLEDGE MAP</p>
              <h1>Connections</h1>
            </div>
            <span className="graph-count">{projectRelations.length} links</span>
          </div>
          <p className="graph-intro">Connect concepts to see how your syllabus fits together.</p>
          <div className="graph-canvas">
            <div className="graph-canvas-grid" aria-hidden="true" />
            <svg
              className="graph-map"
              viewBox="0 0 720 520"
              role="img"
              aria-label="Knowledge graph"
            >
              {projectRelations.map((relation, relationIndex) => {
                const from = graphDisplayPositions.get(relation.fromWordId);
                const to = graphDisplayPositions.get(relation.toWordId);
                if (!from || !to) return null;
                const active =
                  graphFocusId === "all" ||
                  (graphNeighbors.has(relation.fromWordId) &&
                    graphNeighbors.has(relation.toWordId));
                return (
                  <line
                    className={`${active ? "graph-edge active" : "graph-edge dim"} ${graphMotion ? "graph-edge-live" : ""}`}
                    key={relation.id}
                    style={{ animationDelay: `${relationIndex * 80}ms` }}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                );
              })}
              {graphCards.map((card) => {
                const position = graphDisplayPositions.get(card.id);
                if (!position) return null;
                const active = graphFocusId === "all" || graphNeighbors.has(card.id);
                const focused = graphFocusId === card.id;
                return (
                  <g
                    className={`graph-node ${graphColorClass(cardSubject(card))} ${active ? "active" : "dim"} ${focused ? "focused" : ""}`}
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    transform={`translate(${position.x} ${position.y})`}
                    aria-label={`${card.term} 개념 노드`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      (event.currentTarget as SVGGElement).setPointerCapture(event.pointerId);
                      graphNodeDrag.current = {
                        id: card.id,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: position.x,
                        originY: position.y,
                      };
                    }}
                    onPointerMove={(event) => {
                      const drag = graphNodeDrag.current;
                      if (!drag || drag.id !== card.id || drag.pointerId !== event.pointerId)
                        return;
                      const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                      const scale = rect ? rect.width / 720 : 1;
                      setGraphNodeOffsets((current) => ({
                        ...current,
                        [card.id]: {
                          x: drag.originX + (event.clientX - drag.startX) / scale,
                          y: drag.originY + (event.clientY - drag.startY) / scale,
                        },
                      }));
                    }}
                    onPointerUp={(event) => {
                      if (graphNodeDrag.current?.pointerId === event.pointerId)
                        graphNodeDrag.current = null;
                    }}
                    onPointerCancel={(event) => {
                      if (graphNodeDrag.current?.pointerId === event.pointerId)
                        graphNodeDrag.current = null;
                    }}
                    onClick={() => focusGraphNode(card.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focusGraphNode(card.id);
                      }
                    }}
                  >
                    <g
                      className={graphMotion ? "graph-node-motion" : undefined}
                      style={{ animationDelay: `${(graphCards.indexOf(card) % 8) * 70}ms` }}
                    >
                      <circle className="graph-node-halo" r={focused ? 15 : 10} />
                      <circle className="graph-node-dot" r={focused ? 8 : 5} />
                      {card.photo && (
                        <image
                          href={card.photo}
                          x={focused ? -6 : -4}
                          y={focused ? -6 : -4}
                          width={focused ? 12 : 8}
                          height={focused ? 12 : 8}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`circle(${focused ? 6 : 4}px at ${focused ? 6 : 4}px ${focused ? 6 : 4}px)`}
                        />
                      )}
                      <text className="graph-node-label" y="21">
                        {card.term.slice(0, 16)}
                        {card.term.length > 16 ? "…" : ""}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
            <div className="graph-canvas-tools" aria-label="맵 탐색 도구">
              <button
                type="button"
                onClick={() => navigateGraphHistory(-1)}
                disabled={graphHistoryIndex === 0}
                aria-label="이전 맵 위치"
                title="이전 맵 위치"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => navigateGraphHistory(1)}
                disabled={graphHistoryIndex >= graphHistory.length - 1}
                aria-label="다음 맵 위치"
                title="다음 맵 위치"
              >
                ›
              </button>
              <span aria-live="polite">{Math.round(graphZoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setGraphZoom((zoom) => Math.max(0.8, Number((zoom - 0.1).toFixed(1))))}
                aria-label="맵 축소"
                title="축소"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setGraphZoom((zoom) => Math.min(1.4, Number((zoom + 0.1).toFixed(1))))}
                aria-label="맵 확대"
                title="확대"
              >
                +
              </button>
            </div>
            {!cards.length && (
              <div className="graph-empty">Add cards to start your knowledge map.</div>
            )}
            {cards.length > graphCards.length && (
              <small className="graph-overflow">
                Showing first {graphCards.length} cards. All connections remain available below.
              </small>
            )}
            {graphFocusId !== "all" && (
              <button
                className="graph-focus-reset"
                type="button"
                onClick={() => focusGraphNode("all")}
              >
                전체 보기
              </button>
            )}
          </div>
          {graphPreview && (
            <article className="graph-preview">
              <div className="graph-preview-image">
                {graphPreview.photo ? <img src={graphPreview.photo} alt="" /> : <span>{graphPreview.term.slice(0, 1)}</span>}
              </div>
              <div className="graph-preview-copy">
                <small>{cardSubject(graphPreview)} · {cardChapter(graphPreview)}</small>
                <strong>{graphPreview.term}</strong>
                <p>{graphPreview.memo || graphPreview.definition}</p>
              </div>
              <button className="graph-preview-open" type="button" onClick={() => { setSelectedId(graphPreview.id); setSheet("detail"); }}>
                카드 열기
              </button>
            </article>
          )}
          <div className="graph-editor">
            <strong>Add a connection</strong>
            <div className="form-grid">
              <select
                value={relationFrom}
                onChange={(event) => setRelationFrom(event.target.value)}
              >
                <option value="">From card</option>
                {cards.map((card) => (
                  <option value={card.id} key={card.id}>
                    {card.term}
                  </option>
                ))}
              </select>
              <select value={relationTo} onChange={(event) => setRelationTo(event.target.value)}>
                <option value="">To card</option>
                {cards.map((card) => (
                  <option value={card.id} key={card.id}>
                    {card.term}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <select
                value={relationType}
                onChange={(event) => setRelationType(event.target.value as RelationType)}
              >
                {relationTypes.map((type) => (
                  <option value={type.value} key={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <button className="known" type="button" onClick={addRelation}>
                Connect
              </button>
            </div>
          </div>
          <div className="relation-list">
            {projectRelations.map((relation) => (
              <div key={relation.id}>
                <span>
                  <strong>
                    {cards.find((card) => card.id === relation.fromWordId)?.term || "Unknown"}
                  </strong>
                  <small>{relation.type.replaceAll("_", " ")}</small>
                  <strong>
                    {cards.find((card) => card.id === relation.toWordId)?.term || "Unknown"}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => removeRelation(relation.id)}
                  aria-label="Remove connection"
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="study-nav">
        <button
          className={view === "home" ? "active" : ""}
          type="button"
          onClick={() => setView("home")}
        >
          <Icon name="home" />
          <span>Home</span>
        </button>
        <button
          className={view === "decks" ? "active" : ""}
          type="button"
          onClick={() => setView("decks")}
        >
          <Icon name="deck" />
          <span>Cards</span>
        </button>
        <button className="study-add" type="button" onClick={() => setSheet("add")} aria-label="새 카드 추가">
          <Icon name="plus" />
        </button>
        <button
          className={view === "study" ? "active" : ""}
          type="button"
          onClick={() => openStudy("due")}
        >
          <Icon name="study" />
          <span>Study</span>
        </button>
        <button
          className={view === "graph" ? "active" : ""}
          type="button"
          onClick={() => setView("graph")}
        >
          <Icon name="graph" />
          <span>Map</span>
        </button>
      </nav>

      {sheet === "add" && (
        <div className="study-sheet">
          <div className="sheet-dim" onClick={() => setSheet(null)} />
          <div className="study-sheet-panel">
            <div className="sheet-grab" />
            <div className="sheet-title">
              <div>
                <p>NEW CARD</p>
                <h2>Create a study card</h2>
              </div>
              <button type="button" onClick={() => setSheet(null)}>
                <Icon name="close" />
              </button>
            </div>
            <form className="card-form" onSubmit={addCard}>
              <label>
                Front · question
                <input
                  name="question"
                  autoFocus
                  placeholder="e.g. What is the condition for 3NF?"
                  required
                />
              </label>
              <label>
                Back · answer
                <textarea
                  name="answer"
                  rows={4}
                  placeholder="Write the answer and explanation"
                  required
                />
              </label>
              <div className="photo-input">
                <span>사진 바꾸기</span>
                <div className="photo-source-row">
                  <label>
                    보관함에서 선택
                    <input name="photo-library" type="file" accept="image/*" />
                  </label>
                  <label>
                    카메라로 촬영
                    <input name="photo-camera" type="file" accept="image/*" capture="environment" />
                  </label>
                </div>
              </div>
              <label className="memory-first">
                Memory note
                <textarea
                  name="memo"
                  rows={3}
                  placeholder="What should you remember from this photo?"
                />
              </label>
              <details className="advanced-fields">
                <summary>More card options</summary>
                <div className="form-grid">
                  <label>
                    Subject
                    <input name="subject" placeholder="Database" />
                  </label>
                  <label>
                    Chapter
                    <input name="chapter" placeholder="Data Modeling" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Type
                    <select name="type">
                      <option value="concept">Concept</option>
                      <option value="formula">Formula</option>
                      <option value="case">Case</option>
                      <option value="multiple-choice">Multiple choice</option>
                      <option value="cloze">Cloze</option>
                    </select>
                  </label>
                  <label>
                    Tags
                    <input name="tags" placeholder="key, memorize" />
                  </label>
                </div>
                <label>
                  Choices · comma separated
                  <input name="choices" placeholder="Option A, Option B, Option C" />
                </label>
              </details>
              <button className="known wide" type="submit">
                Save card
              </button>
            </form>
          </div>
        </div>
      )}

      {sheet === "detail" && selected && (
        <div className="study-sheet">
          <div className="sheet-dim" onClick={() => setSheet(null)} />
          <div className="study-sheet-panel">
            <div className="sheet-grab" />
            <div className="sheet-title">
              <div>
                <p>{cardSubject(selected)}</p>
                <h2>Card details</h2>
              </div>
              <button type="button" onClick={() => setSheet(null)}>
                <Icon name="close" />
              </button>
            </div>
            {selected.photo && (
              <div className="detail-photo-wrap">
                <button
                  type="button"
                  className="detail-photo-button"
                  onClick={() => setPhotoOpen(true)}
                >
                  <img className="detail-photo" src={selected.photo} alt="Card visual" />
                </button>
                <button
                  type="button"
                  className="photo-remove"
                  onClick={() => removePhoto(selected.id)}
                >
                  사진 삭제
                </button>
              </div>
            )}
            <div className="detail-card">
              <p>Front</p>
              <h3>{selected.term}</h3>
              <hr />
              <p>Back</p>
              <strong>{selected.definition}</strong>
              {selected.memo && (
                <div className="detail-note">
                  <span>암기 메모</span>
                  <small>{selected.memo}</small>
                </div>
              )}
            </div>
            <div className="detail-stats">
              <span>Correct {selected.correctCount || 0}</span>
              <span>Mistakes {selected.incorrectCount || 0}</span>
              <span>Level {selected.reviewLevel || 0}</span>
            </div>
            <div className="detail-actions">
              <button className="secondary-action" type="button" onClick={() => editCard(selected)}>
                수정
              </button>
              <button
                className="danger-action"
                type="button"
                onClick={() => {
                  askConfirm("이 카드를 삭제할까요?", () => deleteCard(selected.id));
                }}
              >
                삭제
              </button>
            </div>
            <button
              className="known wide"
              type="button"
              onClick={() => {
                setSheet(null);
                setStudyIds([selected.id]);
                setStudyIndex(0);
                setRevealed(false);
                setClozeInput("");
                setView("study");
              }}
            >
              Study this card
            </button>
          </div>
        </div>
      )}
      {toast && <div className="study-toast">{toast}</div>}
      {confirmRequest && (
        <div className="confirm-dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <strong id="confirm-title">확인</strong>
            <p>{confirmRequest.message}</p>
            <div>
              <button type="button" onClick={() => setConfirmRequest(null)}>
                취소
              </button>
              <button
                className="confirm-danger"
                type="button"
                onClick={() => {
                  const action = confirmRequest.action;
                  setConfirmRequest(null);
                  action();
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
