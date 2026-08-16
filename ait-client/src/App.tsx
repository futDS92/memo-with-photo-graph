import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { seedState } from "./data/seed";
import { buildMapLayout, getRelatedWords } from "./lib/map";
import {
  hydrateStateFromServer,
  loadLocalState,
  loadLocalStateAsync,
  loadPersistedTag,
  loadPersistedView,
  loadPersistedWordId,
  saveLocalState,
  savePersistedTag,
  savePersistedView,
  savePersistedWordId,
  syncStateToServer,
} from "./lib/storage";
import { relationLabel, relationTypes, type AppState, type RelationType, type Word } from "./types";

type View = "home" | "library" | "map" | "review";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 1600;
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = reject;
      image.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function uniqueTags(words: Word[]) {
  return ["all", ...Array.from(new Set(words.flatMap((word) => word.tags))).sort()];
}

function matchesWord(word: Word, term: string) {
  if (!term) return true;
  return [word.term, word.definition, word.example, word.memo, word.pos, ...word.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function renderPhoto(photo: string | undefined, label: string) {
  return photo ? (
    <img src={photo} alt={label} />
  ) : (
    <div className="photo-fallback">{label.slice(0, 1)}</div>
  );
}

function Icon({
  name,
}: {
  name: "home" | "book" | "map" | "plus" | "search" | "close" | "download" | "chevron" | "image";
}) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" />
        <path d="M4 5.5v12" />
        <path d="M8 7h8M8 11h8" />
      </>
    ),
    map: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M3 7.5 8 5l8 3 5-2.5v9L16 17l-8-3-5 2.5z" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8" cy="9" r="1.5" />
        <path d="m4 17 5-5 3 3 2-2 5 5" />
      </>
    ),
  };
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
      {paths[name]}
    </svg>
  );
}

export function App() {
  const [state, setState] = useState<AppState>(() => loadLocalState());
  const [view, setView] = useState<View>(() => (loadPersistedView() as View) || "home");
  const [selectedWordId, setSelectedWordId] = useState(() =>
    loadPersistedWordId(seedState.words[0].id),
  );
  const [activeTag, setActiveTag] = useState(() => loadPersistedTag());
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<"detail" | "add" | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [newPhotoPreview, setNewPhotoPreview] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const stateReady = useRef(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewFinished, setReviewFinished] = useState(false);
  const [reviewStats, setReviewStats] = useState({ known: 0, hard: 0 });
  const [mapScale, setMapScale] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [mapDragStart, setMapDragStart] = useState<{ x: number; y: number } | null>(null);
  const [reviewedToday, setReviewedToday] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("memo-with-photo-graph.reviewed-today");
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed?.date === new Date().toISOString().slice(0, 10) ? parsed.ids : [];
    } catch {
      return [];
    }
  });

  const selectedWord = state.words.find((word) => word.id === selectedWordId) || state.words[0];
  const reviewWords = useMemo(
    () => state.words
      .filter((word) => !word.reviewDueAt || new Date(word.reviewDueAt).getTime() <= Date.now())
      .sort((a, b) => (a.reviewLevel || 0) - (b.reviewLevel || 0)),
    [state.words],
  );
  const reviewWord = reviewWords[reviewIndex];
  const tags = useMemo(() => uniqueTags(state.words), [state.words]);
  const filteredWords = useMemo(
    () =>
      state.words.filter((word) => {
        return (
          (activeTag === "all" || word.tags.includes(activeTag)) &&
          matchesWord(word, search.trim().toLowerCase())
        );
      }),
    [activeTag, search, state.words],
  );
  const relatedWords = useMemo(
    () => getRelatedWords(state.words, state.relations, selectedWord?.id || ""),
    [state.relations, state.words, selectedWord?.id],
  );
  const mapLayout = useMemo(
    () => (selectedWord ? buildMapLayout(selectedWord, relatedWords) : { nodes: [], edges: [] }),
    [relatedWords, selectedWord],
  );

  useEffect(() => {
    if (!stateReady.current) return;
    const timer = window.setTimeout(() => {
      setSyncStatus("saving");
      saveLocalState(state);
      syncStateToServer(state)
        .then(() => setSyncStatus("saved"))
        .catch(() => setSyncStatus("error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    savePersistedView(view);
  }, [view]);
  useEffect(() => {
    savePersistedWordId(selectedWordId);
  }, [selectedWordId]);
  useEffect(() => {
    savePersistedTag(activeTag);
  }, [activeTag]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "memo-with-photo-graph.reviewed-today",
        JSON.stringify({ date: new Date().toISOString().slice(0, 10), ids: reviewedToday }),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [reviewedToday]);
  useEffect(() => {
    if (state.words.length && !state.words.some((word) => word.id === selectedWordId)) {
      setSelectedWordId(state.words[0].id);
    }
  }, [selectedWordId, state.words]);
  useEffect(() => {
    if (!sheet && !deleteConfirmOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteConfirmOpen(false);
        setSheet(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [deleteConfirmOpen, sheet]);
  useEffect(() => {
    let mounted = true;
    loadLocalStateAsync()
      .then((localState) => {
        if (!mounted) return null;
        stateReady.current = true;
        setState(localState);
        return hydrateStateFromServer(localState);
      })
      .then((serverState) => {
        if (mounted && serverState) setState(serverState);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };
  const chooseWord = (id: string) => {
    setSelectedWordId(id);
    setDetailEditing(false);
    setSheet("detail");
  };
  const resetMap = () => {
    setMapScale(1);
    setMapOffset({ x: 0, y: 0 });
  };
  const beginMapDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setMapDragStart({ x: event.clientX - mapOffset.x, y: event.clientY - mapOffset.y });
  };
  const moveMap = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!mapDragStart) return;
    setMapOffset({ x: event.clientX - mapDragStart.x, y: event.clientY - mapDragStart.y });
  };
  const startReview = () => {
    const firstPending = reviewWords.findIndex((word) => !reviewedToday.includes(word.id));
    setReviewIndex(firstPending >= 0 ? firstPending : 0);
    setReviewRevealed(false);
    setReviewFinished(false);
    setReviewStats({ known: 0, hard: 0 });
    setView("review");
  };
  const markReviewed = (result: "known" | "hard" = "known") => {
    if (!reviewWord) return;
    const now = new Date();
    const nextLevel = result === "hard" ? Math.max((reviewWord.reviewLevel || 0) - 1, 0) : (reviewWord.reviewLevel || 0) + 1;
    const intervals = [1, 3, 7, 14, 30];
    const dueAt = new Date(now.getTime() + (result === "hard" ? 1 : intervals[Math.min(nextLevel, intervals.length - 1)]) * 86400000).toISOString();
    setReviewStats((current) => ({ ...current, [result]: current[result] + 1 }));
    setState((current) => ({
      ...current,
      updatedAt: now.toISOString(),
      words: current.words.map((word) => word.id === reviewWord.id ? { ...word, reviewLevel: nextLevel, reviewDueAt: dueAt, lastReviewedAt: now.toISOString() } : word),
    }));
    setReviewedToday((current) =>
      current.includes(reviewWord.id) ? current : [...current, reviewWord.id],
    );
    if (reviewIndex + 1 >= reviewWords.length) {
      setReviewFinished(true);
      setReviewRevealed(false);
      notify("오늘 복습을 끝냈어요");
    } else {
      setReviewIndex((current) => current + 1);
      setReviewRevealed(false);
    }
  };
  const updateWord = (patch: Partial<Word>) => {
    if (!selectedWord) return;
    setState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      words: current.words.map((word) =>
        word.id === selectedWord.id ? { ...word, ...patch } : word,
      ),
    }));
  };
  const addWord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const term = String(data.get("term") || "").trim();
    const definition = String(data.get("definition") || "").trim();
    if (!term || !definition) return;
    const file = data.get("photo");
    const photo = file instanceof File && file.size ? await fileToDataUrl(file) : "";
    const word: Word = {
      id: `word-${crypto.randomUUID()}`,
      term,
      definition,
      photo,
      pos: String(data.get("pos") || "").trim(),
      example: String(data.get("example") || "").trim(),
      memo: String(data.get("memo") || "").trim(),
      tags: String(data.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    setState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      words: [word, ...current.words],
    }));
    setSelectedWordId(word.id);
    setDetailEditing(false);
    setNewPhotoPreview("");
    form.reset();
    setSheet("detail");
    notify("단어를 저장했어요");
  };
  const saveDetail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("photo");
    const photo =
      file instanceof File && file.size ? await fileToDataUrl(file) : selectedWord?.photo || "";
    updateWord({
      term: String(data.get("term") || "").trim(),
      pos: String(data.get("pos") || "").trim(),
      definition: String(data.get("definition") || "").trim(),
      example: String(data.get("example") || "").trim(),
      memo: String(data.get("memo") || "").trim(),
      tags: String(data.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      photo,
    });
    setDetailEditing(false);
    notify("변경사항을 저장했어요");
  };
  const addRelation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const toWordId = String(data.get("target") || "");
    if (!selectedWord || !toWordId) return;
    const type = String(data.get("type") || "related") as RelationType;
    const label = String(data.get("label") || "").trim();
    const alreadyExists = state.relations.some(
      (relation) =>
        relation.fromWordId === selectedWord.id &&
        relation.toWordId === toWordId &&
        relation.type === type,
    );
    if (alreadyExists) {
      notify("이미 연결된 관계예요");
      return;
    }
    setState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      relations: [
        { id: `rel-${crypto.randomUUID()}`, fromWordId: selectedWord.id, toWordId, type, label },
        ...current.relations,
      ],
    }));
    event.currentTarget.reset();
    notify("관계를 연결했어요");
  };
  const removeWord = () => {
    if (!selectedWord) return;
    setState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      words: current.words.filter((word) => word.id !== selectedWord.id),
      relations: current.relations.filter(
        (relation) =>
          relation.fromWordId !== selectedWord.id && relation.toWordId !== selectedWord.id,
      ),
    }));
    setSheet(null);
    setDeleteConfirmOpen(false);
    notify("단어를 삭제했어요");
  };
  const exportJson = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "memo-with-photo-graph.json";
    link.click();
    URL.revokeObjectURL(url);
    notify("파일을 내보냈어요");
  };
  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.words) || !Array.isArray(parsed?.relations)) throw new Error("invalid");
      setState({ words: parsed.words, relations: parsed.relations, updatedAt: new Date().toISOString() });
      setSheet(null);
      notify("데이터를 가져왔어요");
    } catch {
      notify("올바른 JSON 파일이 아니에요");
    }
    event.currentTarget.value = "";
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">m</div>
          <div>
            <strong>photo graph</strong>
            <small>나만의 단어 지도</small>
          </div>
        </div>
        {syncStatus !== "idle" && (
          <span className={`save-status ${syncStatus}`} aria-live="polite">
            {syncStatus === "saving" ? "저장 중" : syncStatus === "saved" ? "저장됨" : "저장 실패"}
          </span>
        )}
        <label className="import-button">가져오기<input type="file" accept="application/json,.json" onChange={importJson} /></label>
        <button className="icon-button" type="button" onClick={exportJson} aria-label="내보내기">
          <Icon name="download" />
        </button>
      </header>

      {view === "home" && (
        <>
          <section className="welcome">
            <p className="eyebrow">오늘의 기억</p>
            <h1>무엇을 기억해둘까요?</h1>
            <p>사진과 단어를 연결하면 오래 남아요.</p>
            <button className="primary wide" type="button" onClick={() => setSheet("add")}>
              <Icon name="plus" />새 단어 기록하기
            </button>
          </section>
          <section className="summary-grid">
            <div className="summary-card">
              <span>전체 단어</span>
              <strong>{state.words.length}</strong>
              <button type="button" onClick={() => setView("library")}>
                단어장 보기 <Icon name="chevron" />
              </button>
            </div>
            <div className="summary-card accent">
              <span>연결된 관계</span>
              <strong>{state.relations.length}</strong>
              <button type="button" onClick={() => setView("map")}>
                맵 둘러보기 <Icon name="chevron" />
              </button>
            </div>
          </section>
          <button className="review-banner" type="button" onClick={startReview}>
            <span className="review-icon">↗</span>
            <span>
              <strong>오늘의 복습</strong>
              <small>
                {reviewedToday.length >= state.words.length
                  ? "오늘 복습을 모두 완료했어요"
                  : `${Math.max(state.words.length - reviewedToday.length, 0)}개 단어가 기다리고 있어요`}
              </small>
            </span>
            <Icon name="chevron" />
          </button>
          <section className="section-block">
            <div className="section-title">
              <div>
                <p className="eyebrow">최근 기록</p>
                <h2>최근 추가한 단어</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setView("library")}>
                전체보기
              </button>
            </div>
            <div className="compact-list">
              {state.words.slice(0, 3).map((word) => (
                <button
                  className="compact-item"
                  key={word.id}
                  type="button"
                  onClick={() => chooseWord(word.id)}
                >
                  <span className="mini-photo">{renderPhoto(word.photo, word.term)}</span>
                  <span>
                    <strong>{word.term}</strong>
                    <small>{word.definition}</small>
                  </span>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {view === "library" && (
        <section className="content-view">
          <div className="page-title">
            <div>
              <p className="eyebrow">나의 단어</p>
              <h1>단어장</h1>
            </div>
            <button
              className="circle-add"
              type="button"
              onClick={() => setSheet("add")}
              aria-label="단어 추가"
            >
              <Icon name="plus" />
            </button>
          </div>
          <label className="search-box">
            <Icon name="search" />
            <input
              type="search"
              placeholder="단어, 뜻, 메모 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="chips">
            {tags.map((tag) => (
              <button
                className={tag === activeTag ? "active" : ""}
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
              >
                {tag === "all" ? "전체" : `#${tag}`}
              </button>
            ))}
          </div>
          <p className="result-count">{filteredWords.length}개의 단어</p>
          <div className="word-list">
            {filteredWords.map((word) => (
              <button
                className={`word-row ${word.id === selectedWordId ? "selected" : ""}`}
                key={word.id}
                type="button"
                onClick={() => chooseWord(word.id)}
              >
                <span className="row-photo">{renderPhoto(word.photo, word.term)}</span>
                <span className="row-copy">
                  <strong>
                    {word.term}
                    <em>{word.pos}</em>
                  </strong>
                  <small>{word.definition}</small>
                  <span className="row-tags">
                    {word.tags.slice(0, 2).map((tag) => (
                      <i key={tag}>#{tag}</i>
                    ))}
                  </span>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "map" && (
        <section className="content-view">
          <div className="page-title">
            <div>
              <p className="eyebrow">탐색</p>
              <h1>단어 지도</h1>
            </div>
            <span className="map-count">{state.relations.length} connections</span>
          </div>
          {selectedWord ? (
            <>
              <div className="map-focus">
                <span>현재 중심 단어</span>
                <strong>{selectedWord.term}</strong>
                <small>{relatedWords.length}개의 단어와 연결됨</small>
              </div>
              <div className="map-wrap">
                <div className="map-controls">
                  <button
                    type="button"
                    onClick={() => setMapScale((scale) => Math.min(1.8, scale + 0.15))}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapScale((scale) => Math.max(0.7, scale - 0.15))}
                  >
                    −
                  </button>
                  <button type="button" onClick={resetMap}>
                    초기화
                  </button>
                </div>
                <div
                  className="map-canvas"
                  onPointerDown={beginMapDrag}
                  onPointerMove={moveMap}
                  onPointerUp={() => setMapDragStart(null)}
                  onPointerCancel={() => setMapDragStart(null)}
                >
                  <div
                    className="map-world"
                    style={{
                      transform: `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${mapScale})`,
                    }}
                  >
                    <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
                      {mapLayout.edges.map((edge, index) => (
                        <line
                          key={index}
                          x1={edge.x1}
                          y1={edge.y1}
                          x2={edge.x2}
                          y2={edge.y2}
                          stroke="rgba(49,130,246,.18)"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      ))}
                    </svg>
                    {mapLayout.nodes.map((node) => (
                      <div
                        className={`node ${node.center ? "center" : ""}`}
                        key={node.word.id}
                        style={{
                          left: `${(node.x / 10).toFixed(2)}%`,
                          top: `${(node.y / 7).toFixed(2)}%`,
                        }}
                      >
                        <button type="button" onClick={() => chooseWord(node.word.id)}>
                          <div className="node-card">
                            <div className="node-photo">
                              {renderPhoto(node.word.photo, node.word.term)}
                            </div>
                            <strong>{node.word.term}</strong>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="map-hint">노드를 눌러 단어를 중심으로 바꿔보세요</div>
            </>
          ) : (
            <EmptyState text="단어를 먼저 추가해보세요" />
          )}
        </section>
      )}
      {view === "review" && (
        <section className="content-view review-view">
          <div className="page-title">
            <div>
              <p className="eyebrow">오늘의 복습</p>
              <h1>오늘의 복습</h1>
            </div>
            <span className="map-count">
              {reviewFinished ? reviewWords.length : Math.min(reviewIndex, reviewWords.length)} /{" "}
              {reviewWords.length}
            </span>
          </div>
          {reviewFinished ? (
            <div className="review-complete">
              <div className="complete-mark">✓</div>
              <h2>오늘 복습 완료</h2>
              <p>
                {reviewWords.length}개 단어를 모두 확인했어요.
                <br />
                기억함 {reviewStats.known}개 · 어려웠음 {reviewStats.hard}개
              </p>
              <button className="secondary wide" type="button" onClick={startReview}>
                다시 복습하기
              </button>
              <button className="skip-button" type="button" onClick={() => setView("home")}>
                홈으로 돌아가기
              </button>
            </div>
          ) : reviewWord ? (
            <>
              <div className="review-progress">
                <span
                  style={{
                    width: `${Math.min(((reviewIndex + (reviewRevealed ? 1 : 0)) / Math.max(reviewWords.length, 1)) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className="review-card">
                <div className="review-photo">{renderPhoto(reviewWord.photo, reviewWord.term)}</div>
                <p className="review-label">이 단어를 기억해보세요</p>
                <h2>{reviewWord.term}</h2>
                {reviewRevealed ? (
                  <div className="review-answer">
                    <strong>{reviewWord.definition}</strong>
                    {reviewWord.example && <p>{reviewWord.example}</p>}
                    {reviewWord.memo && <small>{reviewWord.memo}</small>}
                  </div>
                ) : (
                  <p className="review-placeholder">
                    뜻을 떠올린 다음
                    <br />
                    정답을 확인해보세요
                  </p>
                )}
              </div>
              {reviewRevealed ? (
                <div className="review-actions">
                  <button className="review-hard" type="button" onClick={() => markReviewed("hard")}>어려웠어요</button>
                  <button className="primary" type="button" onClick={markReviewed}>
                    {reviewIndex + 1 >= reviewWords.length ? "복습 끝내기" : "기억했어요"}
                  </button>
                </div>
              ) : (
                <button
                  className="primary wide"
                  type="button"
                  onClick={() => setReviewRevealed(true)}
                >
                  정답 보기
                </button>
              )}
              <button className="skip-button" type="button" onClick={markReviewed}>
                다음 단어
              </button>
            </>
          ) : (
            <EmptyState text="복습할 단어가 없어요" />
          )}
        </section>
      )}

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button
          className={view === "home" ? "active" : ""}
          type="button"
          onClick={() => setView("home")}
        >
          <Icon name="home" />
          <span>홈</span>
        </button>
        <button
          className={view === "library" ? "active" : ""}
          type="button"
          onClick={() => setView("library")}
        >
          <Icon name="book" />
          <span>단어장</span>
        </button>
        <button className="nav-add" type="button" onClick={() => setSheet("add")}>
          <Icon name="plus" />
        </button>
        <button
          className={view === "map" ? "active" : ""}
          type="button"
          onClick={() => setView("map")}
        >
          <Icon name="map" />
          <span>지도</span>
        </button>
        <button className={view === "review" ? "active" : ""} type="button" onClick={startReview}>
          <Icon name="book" />
          <span>복습</span>
        </button>
      </nav>

      {sheet && (
        <div className="sheet open">
          <div className="sheet-backdrop" onClick={() => setSheet(null)} />
          <div className="sheet-panel">
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <p className="eyebrow">{sheet === "add" ? "새 단어" : "단어 상세"}</p>
                <h2>{sheet === "add" ? "새 단어 기록" : selectedWord?.term}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setSheet(null)}
                aria-label="닫기"
              >
                <Icon name="close" />
              </button>
              {sheet === "detail" && (
                <button className="sheet-edit-button" type="button" onClick={() => setDetailEditing((editing) => !editing)}>
                  {detailEditing ? "보기" : "편집"}
                </button>
              )}
            </div>
            {sheet === "add" ? (
              <form className="detail-form" onSubmit={addWord}>
                <label>
                  단어
                  <input name="term" autoFocus placeholder="예: serendipity" required />
                </label>
                <label>
                  뜻<textarea name="definition" rows={2} placeholder="뜻을 적어주세요" required />
                </label>
                <div className="grid-two">
                  <label>
                    품사
                    <input name="pos" placeholder="noun" />
                  </label>
                  <label>
                    태그
                    <input name="tags" placeholder="mindset, feeling" />
                  </label>
                </div>
                <label>
                  예문
                  <textarea name="example" rows={2} placeholder="기억하고 싶은 예문" />
                </label>
                <label>
                  메모
                  <textarea name="memo" rows={2} placeholder="나만의 연상 메모" />
                </label>
                  {newPhotoPreview && <img className="new-photo-preview" src={newPhotoPreview} alt="추가할 사진 미리보기" />}
                  <label className="file-field">
                  <span>
                    <Icon name="image" />
                    사진 추가
                  </span>
                    <input name="photo" type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setNewPhotoPreview(await fileToDataUrl(file)); }} />
                </label>
                <button className="primary wide" type="submit">
                  저장하기
                </button>
              </form>
            ) : (
              selectedWord && (
                <div key={selectedWord.id}>
                  <div className="detail-photo">
                    {renderPhoto(selectedWord.photo, selectedWord.term)}
                  </div>
                  <form className={`detail-form ${detailEditing ? "editing" : "view-only"}`} onSubmit={saveDetail}>
                    <label>
                      단어
                      <input name="term" defaultValue={selectedWord.term} readOnly={!detailEditing} />
                    </label>
                    <label>
                      뜻
                      <textarea name="definition" rows={2} defaultValue={selectedWord.definition} readOnly={!detailEditing} />
                    </label>
                    <div className="grid-two">
                      <label>
                        품사
                        <input name="pos" defaultValue={selectedWord.pos || ""} readOnly={!detailEditing} />
                      </label>
                      <label>
                        태그
                        <input name="tags" defaultValue={selectedWord.tags.join(", ")} readOnly={!detailEditing} />
                      </label>
                    </div>
                    <label>
                      예문
                      <textarea name="example" rows={2} defaultValue={selectedWord.example || ""} readOnly={!detailEditing} />
                    </label>
                    <label>
                      메모
                      <textarea name="memo" rows={2} defaultValue={selectedWord.memo || ""} readOnly={!detailEditing} />
                    </label>
                    <label className="file-field">
                      <span>
                        <Icon name="image" />
                        사진 교체
                      </span>
                      <input name="photo" type="file" accept="image/*" disabled={!detailEditing} />
                    </label>
                    {detailEditing && selectedWord.photo && (
                      <button
                        className="secondary wide"
                        type="button"
                        onClick={() => {
                          updateWord({ photo: "" });
                          notify("사진을 삭제했어요");
                        }}
                      >
                        사진 삭제
                      </button>
                    )}
                    {detailEditing && <button className="primary wide" type="submit">변경 저장</button>}
                  </form>
                  <div className="detail-section">
                    <h3>
                      연결된 단어 <small>{relatedWords.length}</small>
                    </h3>
                    {relatedWords.length ? (
                      <div className="relation-list">
                        {relatedWords.map((item) => (
                          <div className="relation-item" key={item.relation.id}>
                            <button type="button" onClick={() => setSelectedWordId(item.word.id)}>
                              <span>
                                <strong>{item.word.term}</strong>
                                <small>
                                  {relationLabel(item.displayType)}
                                  {item.relation.label ? ` · ${item.relation.label}` : ""}
                                </small>
                              </span>
                              <Icon name="chevron" />
                            </button>
                            <button
                              className="relation-delete"
                              type="button"
                              onClick={() => {
                                setState((current) => ({
                                  ...current,
                                  updatedAt: new Date().toISOString(),
                                  relations: current.relations.filter(
                                    (relation) => relation.id !== item.relation.id,
                                  ),
                                }));
                                notify("관계를 삭제했어요");
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">아직 연결된 단어가 없어요.</p>
                    )}
                  </div>
                  <div className="detail-section">
                    <h3>새 관계 연결</h3>
                    <form className="relation-form" onSubmit={addRelation}>
                      <select name="type" defaultValue="related">
                        {relationTypes.map((relation) => (
                          <option value={relation.value} key={relation.value}>
                            {relation.label}
                          </option>
                        ))}
                      </select>
                      <select name="target" defaultValue="">
                        <option value="" disabled>
                          연결할 단어 선택
                        </option>
                        {state.words
                          .filter((word) => word.id !== selectedWord.id)
                          .map((word) => (
                            <option value={word.id} key={word.id}>
                              {word.term}
                            </option>
                          ))}
                      </select>
                      <input name="label" placeholder="관계 설명 (선택)" />
                      <button className="secondary" type="submit">
                        연결하기
                      </button>
                    </form>
                  </div>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    단어 삭제
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
      {deleteConfirmOpen && selectedWord && (
        <div className="confirm-layer">
          <div className="confirm-backdrop" onClick={() => setDeleteConfirmOpen(false)} />
          <div className="confirm-card">
            <div className="confirm-mark">!</div>
            <h2>단어를 삭제할까요?</h2>
            <p>
              “{selectedWord.term}”와 연결된 관계도
              <br />
              함께 삭제됩니다.
            </p>
            <div className="confirm-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                취소
              </button>
              <button className="danger-solid" type="button" onClick={removeWord}>
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      <div className="footer-space" aria-hidden="true" />
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <strong>{text}</strong>
      <span>+ 버튼을 눌러 첫 단어를 기록해보세요.</span>
    </div>
  );
}
