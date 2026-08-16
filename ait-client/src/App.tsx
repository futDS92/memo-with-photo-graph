import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { seedState } from "./data/seed";
import { hydrateStateFromServer, loadLocalStateAsync, saveLocalState, syncStateToServer } from "./lib/storage";
import { relationTypes, type AppState, type RelationType, type Word } from "./types";

type View = "home" | "decks" | "study" | "mistakes" | "graph";
type StudyMode = "due" | "mistakes";

function today() { return new Date().toISOString().slice(0, 10); }
function newId(prefix: string) { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
function nextDue(level: number, hard: boolean) {
  const days = hard ? 1 : [1, 3, 7, 14, 30][Math.min(level, 4)];
  return new Date(Date.now() + days * 86400000).toISOString();
}
function photoUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
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
function Icon({ name }: { name: "home" | "deck" | "plus" | "study" | "chart" | "graph" | "close" | "chevron" | "back" | "star" }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6" /></>,
    deck: <><rect x="4" y="4" width="15" height="16" rx="2" /><path d="M8 8h7M8 12h7M8 16h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    study: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 5.5v12" /></>,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /></>,
    graph: <><circle cx="6" cy="7" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="15" cy="18" r="2" /><path d="m7.7 7 8.5-1M7 8.6l6.5 7.8M16.8 6.8l-1.2 9.3" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  }[name];
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
}

function isDue(card: Word) { if (!card.reviewDueAt) return true; const dueAt = new Date(card.reviewDueAt).getTime(); return !Number.isFinite(dueAt) || dueAt <= Date.now(); }
function cardSubject(card: Word) { return card.pos || card.tags[0] || "Other"; }
function cardChapter(card: Word) { return card.example || "Core Concepts"; }
function isValidImportedState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  if (candidate.schemaVersion !== 2 || !Array.isArray(candidate.words) || !Array.isArray(candidate.relations)) return false;
  const ids = new Set<string>();
  const relationIds = new Set<string>();
  for (const card of candidate.words) {
    if (!card || typeof card.id !== "string" || typeof card.term !== "string" || typeof card.definition !== "string" || !Array.isArray(card.tags) || ids.has(card.id)) return false;
    ids.add(card.id);
  }
  return candidate.relations.every((relation) => Boolean(relation && typeof relation.id === "string" && !relationIds.has(relation.id) && typeof relation.fromWordId === "string" && typeof relation.toWordId === "string" && ids.has(relation.fromWordId) && ids.has(relation.toWordId) && relationIds.add(relation.id)));
}

const koreanUi: Record<string, string> = {
  Home: "홈",
  Study: "학습",
  Map: "맵",
  All: "전체",
  Other: "기타",
  concept: "개념",
  case: "사례",
  "multiple-choice": "객관식",
  "related": "관련",
  "part of": "부분",
  "has part": "구성",
  "hypernym": "상위",
  "hyponym": "하위",
  "synonym": "유의어",
  "antonym": "반의어",
  "example": "예시",
  "study deck": "스터디 덱",
  "Turn your syllabus into cards": "시험 내용을 카드로",
  Import: "가져오기",
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
  Cards: "카드",
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
  "Add a card or come back when the next review is scheduled.": "카드를 추가하거나 다음 복습일에 다시 오세요.",
  REVIEW: "복습",
  "Cards that need another pass": "다시 볼 카드",
  "Start review": "복습 시작",
  "KNOWLEDGE MAP": "개념 지도",
  links: "연결",
  "Connect concepts to see how your syllabus fits together.": "개념을 연결해 전체 흐름을 확인하세요.",
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

function localizeSeedCards(state: AppState): AppState {
  const seedById = new Map(seedState.words.map((card) => [card.id, card]));
  return {
    ...state,
    words: state.words.map((card) => {
      const seed = seedById.get(card.id);
      return seed ? { ...card, term: seed.term, definition: seed.definition, pos: seed.pos, example: seed.example, memo: seed.memo, tags: seed.tags, cardType: seed.cardType } : card;
    }),
  };
}
const studySessionKey = "memo-with-photo-graph.study-session";
function saveStudySession(session: { mode: StudyMode; ids: string[]; index: number } | null) {
  try { if (session) localStorage.setItem(studySessionKey, JSON.stringify(session)); else localStorage.removeItem(studySessionKey); } catch { /* storage is optional */ }
}
function readStudySession(): { mode: StudyMode; ids: string[]; index: number } | null {
  try { const parsed = JSON.parse(localStorage.getItem(studySessionKey) || "null"); return parsed?.mode && (parsed.mode === "due" || parsed.mode === "mistakes") && Array.isArray(parsed.ids) && typeof parsed.index === "number" ? parsed : null; } catch { return null; }
}

export function App() {
  const [state, setState] = useState<AppState>(() => seedState);
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<StudyMode>("due");
  const [subject, setSubject] = useState("All");
  const [studyIds, setStudyIds] = useState<string[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState<"add" | "detail" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [relationFrom, setRelationFrom] = useState("");
  const [relationTo, setRelationTo] = useState("");
  const [relationType, setRelationType] = useState<RelationType>("related");
  const [clozeInput, setClozeInput] = useState("");
  const stateReady = useRef(false);
  const syncVersion = useRef(0);
  const syncQueue = useRef(Promise.resolve());
  const toastTimer = useRef<number | null>(null);

  const cards = state.words;
  const selected = cards.find((card) => card.id === selectedId);
  const subjects = useMemo(() => ["All", ...Array.from(new Set(cards.map(cardSubject)))], [cards]);
  const dueCards = useMemo(() => cards.filter(isDue), [cards, nowTick]);
  const mistakeCards = useMemo(() => cards.filter((card) => (card.incorrectCount || 0) > (card.correctCount || 0)), [cards]);
  const filteredCards = useMemo(() => cards.filter((card) => (subject === "All" || cardSubject(card) === subject) && [card.term, card.definition, ...card.tags].join(" ").toLowerCase().includes(search.toLowerCase())), [cards, search, subject]);
  const graphCards = useMemo(() => cards.slice(0, 12), [cards]);
  const currentCard = cards.find((card) => card.id === studyIds[studyIndex]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  };

  useEffect(() => {
    let mounted = true;
    loadLocalStateAsync().then((local) => {
      if (!mounted) return null;
      return hydrateStateFromServer(local).then((remote) => {
        if (!mounted) return null;
        const hydrated = localizeSeedCards(remote || local);
        setState(hydrated);
        const savedSession = readStudySession();
        if (savedSession) {
          const availableIds = savedSession.ids.filter((id) => hydrated.words.some((card) => card.id === id));
          if (availableIds.length) { setMode(savedSession.mode); setStudyIds(availableIds); setStudyIndex(Math.min(savedSession.index, availableIds.length - 1)); setView("study"); }
          else saveStudySession(null);
        }
        stateReady.current = true;
        return null;
      });
    });
    return () => { mounted = false; };
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
      if (koreanUi[value]) text.nodeValue = text.nodeValue?.replace(value, koreanUi[value]) || koreanUi[value];
      else if (/^\d+ cards$/.test(value)) text.nodeValue = value.replace("cards", "장");
      else if (/^\d+ mistakes/.test(value)) text.nodeValue = value.replace("mistakes", "회 오답");
      else if (/^\d+ links$/.test(value)) text.nodeValue = value.replace("links", "개 연결");
      else if (/^Correct \d+/.test(value)) text.nodeValue = value.replace("Correct", "정답");
      else if (/^Mistakes \d+/.test(value)) text.nodeValue = value.replace("Mistakes", "오답");
      else if (/^Level \d+/.test(value)) text.nodeValue = value.replace("Level", "레벨");
    });
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((field) => {
      if (koreanUi[field.placeholder]) field.placeholder = koreanUi[field.placeholder];
    });
    root.querySelectorAll<HTMLElement>("[aria-label]").forEach((element) => {
      if (element.getAttribute("aria-label") === "Remove connection") element.setAttribute("aria-label", koreanUi["Remove connection"]);
    });
  }, [view, state.words.length, state.relations.length, sheet, revealed]);
  useEffect(() => {
    if (!stateReady.current) return;
    const version = ++syncVersion.current;
    setSyncing(true);
    saveLocalState(state);
    const timer = window.setTimeout(() => {
      syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
        if (version !== syncVersion.current) return;
        try {
          await syncStateToServer(state);
          if (version === syncVersion.current) { setSyncing(false); setSyncError(false); }
        } catch {
          if (version === syncVersion.current) { setSyncing(false); setSyncError(true); }
        }
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((tick) => tick + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const openStudy = (studyMode: StudyMode) => {
    const source = studyMode === "mistakes" ? mistakeCards : dueCards;
    const ids = source.map((card) => card.id);
    setMode(studyMode); setStudyIds(ids); setStudyIndex(0); setRevealed(false); setSelectedChoice(null); setClozeInput(""); setView("study"); saveStudySession({ mode: studyMode, ids, index: 0 });
  };
  const gradeCard = (hard: boolean) => {
    if (!currentCard) return;
    const level = hard ? Math.max((currentCard.reviewLevel || 0) - 1, 0) : (currentCard.reviewLevel || 0) + 1;
    const now = new Date().toISOString();
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: now, words: current.words.map((card) => card.id === currentCard.id ? { ...card, reviewLevel: level, reviewDueAt: nextDue(level, hard), lastReviewedAt: now, correctCount: (card.correctCount || 0) + (hard ? 0 : 1), incorrectCount: (card.incorrectCount || 0) + (hard ? 1 : 0) } : card) }));
    if (studyIndex + 1 >= studyIds.length) { setView("home"); saveStudySession(null); notify("Study session complete"); } else { const nextIndex = studyIndex + 1; setStudyIndex(nextIndex); saveStudySession({ mode, ids: studyIds, index: nextIndex }); setRevealed(false); setSelectedChoice(null); setClozeInput(""); }
  };
  const addCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get("question") || "").trim();
    const answer = String(data.get("answer") || "").trim();
    if (!question || !answer) return;
    if (cards.some((card) => card.term.trim().toLowerCase() === question.toLowerCase())) { notify("A card with the same question already exists"); return; }
    const file = data.get("photo");
    let photo = "";
    if (file instanceof File && file.size) {
      try { photo = await photoUrl(file); } catch { notify("The image could not be processed"); return; }
    }
    const choices = String(data.get("choices") || "").split(",").map((choice) => choice.trim()).filter(Boolean);
    const newCard: Word = { id: newId("card"), term: question, definition: answer, pos: String(data.get("subject") || "Other"), example: String(data.get("chapter") || "Core Concepts"), memo: String(data.get("memo") || ""), tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean), photo, cardType: String(data.get("type") || "concept") as Word["cardType"], choices, reviewLevel: 0, correctCount: 0, incorrectCount: 0 };
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: [newCard, ...current.words] }));
    event.currentTarget.reset(); setSheet(null); notify("Card added");
  };
  const updateBookmark = (id: string) => setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: current.words.map((card) => card.id === id ? { ...card, isBookmarked: !card.isBookmarked } : card) }));
  const deleteCard = (id: string) => { setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: current.words.filter((card) => card.id !== id), relations: current.relations.filter((relation) => relation.fromWordId !== id && relation.toWordId !== id) })); setSelectedId(null); setSheet(null); notify("카드를 삭제했어요"); };
  const editCard = (card: Word) => { const term = window.prompt("문제", card.term)?.trim(); if (!term) return; const definition = window.prompt("정답", card.definition)?.trim(); if (!definition) return; setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: current.words.map((item) => item.id === card.id ? { ...item, term, definition } : item) })); notify("카드를 수정했어요"); };
  const exportJson = () => { const blob = new Blob([JSON.stringify({ ...state, schemaVersion: 2 }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "study-deck.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); notify("Deck exported"); };
  const importJson = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { const parsed: unknown = JSON.parse(await file.text()); if (!isValidImportedState(parsed)) throw new Error("Invalid deck"); setState({ ...parsed, updatedAt: new Date().toISOString(), schemaVersion: 2 }); notify("Deck imported"); } catch { notify("Could not import this deck"); } };
  const chooseAnswer = (choice: string) => { if (!currentCard) return; if (choice === currentCard.definition) { setSelectedChoice(choice); setRevealed(true); } else { setSelectedChoice(choice); notify("Not quite — try again"); } };
  const addRelation = () => { if (!relationFrom || !relationTo || relationFrom === relationTo) { notify("Choose two different cards"); return; } if (state.relations.some((relation) => relation.fromWordId === relationFrom && relation.toWordId === relationTo && relation.type === relationType)) { notify("That connection already exists"); return; } setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), relations: [...current.relations, { id: newId("relation"), fromWordId: relationFrom, toWordId: relationTo, type: relationType }] })); notify("Connection added"); };
  const removeRelation = (id: string) => setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), relations: current.relations.filter((relation) => relation.id !== id) }));

  return <main className="study-app">
    <header className="study-topbar"><div className="study-brand"><div className="study-logo">q</div><div><strong>study deck</strong><small>Turn your syllabus into cards</small></div></div><div className="data-actions"><label className="data-button">Import<input type="file" accept="application/json,.json" onChange={importJson} /></label><button className="data-button" type="button" onClick={exportJson}>Export</button><span className={`sync-pill ${syncError ? "error" : ""}`}>{syncing ? "Saving" : syncError ? "Saved on device" : "Saved"}</span></div></header>

    {view === "home" && <section className="study-home"><div className="study-greeting"><p>Today’s study</p><h1>Review today.<br /><em>Remember more.</em></h1></div><button className="hero-study" type="button" onClick={() => openStudy("due")}><span><small>Due today</small><strong>{dueCards.length} cards</strong><b>Start studying <Icon name="chevron" /></b></span><div className="hero-ring"><span>{cards.length ? Math.round(((cards.length - dueCards.length) / cards.length) * 100) : 0}%</span></div></button><div className="quick-grid"><button type="button" onClick={() => setView("decks")}><Icon name="deck" /><strong>{cards.length}</strong><small>Total cards</small></button><button type="button" onClick={() => setView("mistakes")}><Icon name="study" /><strong>{mistakeCards.length}</strong><small>Mistakes</small></button><button type="button" onClick={() => setView("graph")}><Icon name="graph" /><strong>{state.relations.length}</strong><small>Connections</small></button></div><div className="study-section-head"><div><p>Subjects</p><h2>Where do you want to start?</h2></div><button type="button" onClick={() => setView("decks")}>View all</button></div><div className="subject-list">{subjects.slice(1, 5).map((item) => <button type="button" key={item} onClick={() => { setSubject(item); setView("decks"); }}><span className="subject-dot" /><span><strong>{item}</strong><small>{cards.filter((card) => cardSubject(card) === item).length} cards · {cards.filter((card) => cardSubject(card) === item && isDue(card)).length} due</small></span><Icon name="chevron" /></button>)}</div></section>}

    {view === "decks" && <section className="study-content"><div className="study-page-title"><div><p>MY DECKS</p><h1>Cards</h1></div><button className="round-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button></div><label className="study-search"><span>⌕</span><input placeholder="Search questions or concepts" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="subject-tabs">{subjects.map((item) => <button className={subject === item ? "active" : ""} key={item} type="button" onClick={() => setSubject(item)}>{item}</button>)}</div><div className="card-list">{filteredCards.length ? filteredCards.map((card) => <div className="study-card-row" role="button" tabIndex={0} key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(card.id); setSheet("detail"); } }}><span className="type-mark">{card.cardType === "formula" ? "ƒ" : card.cardType === "case" ? "↗" : "?"}</span><span><strong>{card.term}</strong><small>{cardSubject(card)} · {cardChapter(card)}</small></span><button className={`bookmark ${card.isBookmarked ? "active" : ""}`} type="button" aria-label={`Bookmark ${card.term}`} onClick={(event) => { event.stopPropagation(); updateBookmark(card.id); }}><Icon name="star" /></button></div>) : <div className="study-empty"><strong>No cards found</strong><small>Try another search or subject.</small></div>}</div></section>}

    {view === "study" && <section className="study-content study-session"><button className="back-button" type="button" onClick={() => setView("home")}><Icon name="back" />{mode === "mistakes" ? "Mistake review" : "Today’s review"}</button><div className="session-meta"><span>{Math.min(studyIndex + 1, studyIds.length)} / {studyIds.length}</span><div><span style={{ width: `${Math.min((studyIndex / Math.max(studyIds.length, 1)) * 100, 100)}%` }} /></div></div>{currentCard ? <><div className={`flash-card ${revealed ? "revealed" : ""}`}><div className="flash-top"><span>{cardSubject(currentCard)}</span><button type="button" onClick={() => updateBookmark(currentCard.id)} className={currentCard.isBookmarked ? "active" : ""}><Icon name="star" /></button></div>{currentCard.photo && <img src={currentCard.photo} alt="Card visual" />}<p className="flash-label">{revealed ? "Answer" : currentCard.cardType === "formula" ? "Formula" : currentCard.cardType === "cloze" ? "Cloze" : currentCard.cardType === "multiple-choice" ? "Choose an answer" : "Question"}</p><h2>{revealed ? currentCard.definition : currentCard.term}</h2>{!revealed && currentCard.cardType === "multiple-choice" && currentCard.choices?.length ? <div className="choice-list">{currentCard.choices.map((choice) => <button className={selectedChoice === choice ? "selected" : ""} type="button" key={choice} onClick={() => chooseAnswer(choice)}>{choice}</button>)}</div> : null}{!revealed && currentCard.cardType === "cloze" ? <div className="cloze-answer"><input value={clozeInput} onChange={(event) => setClozeInput(event.target.value)} placeholder="답을 입력하세요" /><button type="button" onClick={() => { if (clozeInput.trim().toLowerCase() === currentCard.definition.trim().toLowerCase()) setRevealed(true); else notify("다시 생각해 보세요"); }}>확인</button></div> : null}{revealed && currentCard.memo && <p className="flash-memo">{currentCard.memo}</p>}<small>{revealed ? "Explain the idea in your own words." : currentCard.cardType === "multiple-choice" || currentCard.cardType === "cloze" ? "Answer before revealing." : "Recall the answer before revealing the card."}</small></div>{revealed ? <div className="grade-actions"><button className="hard" type="button" onClick={() => gradeCard(true)}>Still difficult</button><button className="known" type="button" onClick={() => gradeCard(false)}>I remembered</button></div> : currentCard.cardType !== "cloze" ? <button className="flip-button" type="button" onClick={() => setRevealed(true)}>Reveal answer</button> : null}</> : <div className="study-empty"><strong>No cards are due</strong><small>Add a card or come back when the next review is scheduled.</small></div>}</section>}

    {view === "mistakes" && <section className="study-content"><div className="study-page-title"><div><p>REVIEW</p><h1>Mistakes</h1></div></div><div className="mistake-summary"><strong>{mistakeCards.length} cards</strong><span>Cards that need another pass</span><button type="button" onClick={() => openStudy("mistakes")}>Start review</button></div><div className="card-list">{mistakeCards.map((card) => <button className="study-card-row" type="button" key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><span className="type-mark wrong">!</span><span><strong>{card.term}</strong><small>{card.incorrectCount || 0} mistakes · {cardSubject(card)}</small></span><Icon name="chevron" /></button>)}</div></section>}

    {view === "graph" && <section className="study-content graph-page"><div className="study-page-title"><div><p>KNOWLEDGE MAP</p><h1>Connections</h1></div><span className="graph-count">{state.relations.length} links</span></div><p className="graph-intro">Connect concepts to see how your syllabus fits together.</p><div className="graph-canvas"><svg viewBox="0 0 360 260" role="img" aria-label="Knowledge graph">{state.relations.map((relation) => { const fromIndex = graphCards.findIndex((card) => card.id === relation.fromWordId); const toIndex = graphCards.findIndex((card) => card.id === relation.toWordId); if (fromIndex < 0 || toIndex < 0) return null; const fromAngle = (fromIndex / Math.max(graphCards.length, 1)) * Math.PI * 2 - Math.PI / 2; const toAngle = (toIndex / Math.max(graphCards.length, 1)) * Math.PI * 2 - Math.PI / 2; const fx = 180 + Math.cos(fromAngle) * 102; const fy = 130 + Math.sin(fromAngle) * 78; const tx = 180 + Math.cos(toAngle) * 102; const ty = 130 + Math.sin(toAngle) * 78; return <line key={relation.id} x1={fx} y1={fy} x2={tx} y2={ty} />; })}{graphCards.map((card, index) => { const angle = (index / Math.max(graphCards.length, 1)) * Math.PI * 2 - Math.PI / 2; const x = 180 + Math.cos(angle) * 102; const y = 130 + Math.sin(angle) * 78; return <g key={card.id} role="button" tabIndex={0} transform={`translate(${x} ${y})`} onClick={() => { setSelectedId(card.id); setSheet("detail"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(card.id); setSheet("detail"); } }}><circle r="23" /><text y="4">{card.term.slice(0, 10)}{card.term.length > 10 ? "…" : ""}</text></g>; })}</svg>{!cards.length && <div className="graph-empty">Add cards to start your knowledge map.</div>}{cards.length > graphCards.length && <small className="graph-overflow">Showing first {graphCards.length} cards. All connections remain available below.</small>}</div><div className="graph-editor"><strong>Add a connection</strong><div className="form-grid"><select value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}><option value="">From card</option>{cards.map((card) => <option value={card.id} key={card.id}>{card.term}</option>)}</select><select value={relationTo} onChange={(event) => setRelationTo(event.target.value)}><option value="">To card</option>{cards.map((card) => <option value={card.id} key={card.id}>{card.term}</option>)}</select></div><div className="form-grid"><select value={relationType} onChange={(event) => setRelationType(event.target.value as RelationType)}>{relationTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select><button className="known" type="button" onClick={addRelation}>Connect</button></div></div><div className="relation-list">{state.relations.map((relation) => <div key={relation.id}><span><strong>{cards.find((card) => card.id === relation.fromWordId)?.term || "Unknown"}</strong><small>{relation.type.replaceAll("_", " ")}</small><strong>{cards.find((card) => card.id === relation.toWordId)?.term || "Unknown"}</strong></span><button type="button" onClick={() => removeRelation(relation.id)} aria-label="Remove connection"><Icon name="close" /></button></div>)}</div></section>}

    <nav className="study-nav"><button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}><Icon name="home" /><span>Home</span></button><button className={view === "decks" ? "active" : ""} type="button" onClick={() => setView("decks")}><Icon name="deck" /><span>Cards</span></button><button className="study-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button><button className={view === "study" ? "active" : ""} type="button" onClick={() => openStudy("due")}><Icon name="study" /><span>Study</span></button><button className={view === "graph" ? "active" : ""} type="button" onClick={() => setView("graph")}><Icon name="graph" /><span>Map</span></button></nav>

    {sheet === "add" && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>NEW CARD</p><h2>Create a study card</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><form className="card-form" onSubmit={addCard}><label>Front · question<input name="question" autoFocus placeholder="e.g. What is the condition for 3NF?" required /></label><label>Back · answer<textarea name="answer" rows={4} placeholder="Write the answer and explanation" required /></label><div className="form-grid"><label>Subject<input name="subject" placeholder="Database" /></label><label>Chapter<input name="chapter" placeholder="Data Modeling" /></label></div><div className="form-grid"><label>Type<select name="type"><option value="concept">Concept</option><option value="formula">Formula</option><option value="case">Case</option><option value="multiple-choice">Multiple choice</option><option value="cloze">Cloze</option></select></label><label>Tags<input name="tags" placeholder="key, memorize" /></label></div><label>Choices · comma separated<input name="choices" placeholder="Option A, Option B, Option C" /></label><label>Memory note<textarea name="memo" rows={2} placeholder="Your own memory cue" /></label><button className="known wide" type="submit">Save card</button></form></div></div>}

    {sheet === "detail" && selected && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>{cardSubject(selected)}</p><h2>Card details</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><div className="detail-card"><p>Front</p><h3>{selected.term}</h3><hr /><p>Back</p><strong>{selected.definition}</strong><small>{selected.memo}</small></div><div className="detail-stats"><span>Correct {selected.correctCount || 0}</span><span>Mistakes {selected.incorrectCount || 0}</span><span>Level {selected.reviewLevel || 0}</span></div><div className="detail-actions"><button className="secondary-action" type="button" onClick={() => editCard(selected)}>수정</button><button className="danger-action" type="button" onClick={() => { if (window.confirm("이 카드를 삭제할까요?")) deleteCard(selected.id); }}>삭제</button></div><button className="known wide" type="button" onClick={() => { setSheet(null); setStudyIds([selected.id]); setStudyIndex(0); setRevealed(false); setClozeInput(""); setView("study"); }}>Study this card</button></div></div>}
    {toast && <div className="study-toast">{toast}</div>}
  </main>;
}
