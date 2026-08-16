import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { seedState } from "./data/seed";
import { hydrateStateFromServer, loadLocalStateAsync, saveLocalState, syncStateToServer } from "./lib/storage";
import type { AppState, Word } from "./types";

type View = "home" | "decks" | "study" | "mistakes";
type StudyMode = "due" | "mistakes";

function today() { return new Date().toISOString().slice(0, 10); }
function nextDue(level: number, hard: boolean) {
  const days = hard ? 1 : [1, 3, 7, 14, 30][Math.min(level, 4)];
  return new Date(Date.now() + days * 86400000).toISOString();
}
function photoUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function Icon({ name }: { name: "home" | "deck" | "plus" | "study" | "chart" | "close" | "chevron" | "back" | "star" }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6" /></>,
    deck: <><rect x="4" y="4" width="15" height="16" rx="2" /><path d="M8 8h7M8 12h7M8 16h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    study: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 5.5v12" /></>,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  }[name];
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
}

function isDue(card: Word) { return !card.reviewDueAt || new Date(card.reviewDueAt).getTime() <= Date.now(); }
function cardSubject(card: Word) { return card.pos || card.tags[0] || "기타"; }
function cardChapter(card: Word) { return card.example || "기본 개념"; }

export function App() {
  const [state, setState] = useState<AppState>(() => seedState);
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<StudyMode>("due");
  const [subject, setSubject] = useState("전체");
  const [studyIds, setStudyIds] = useState<string[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState<"add" | "detail" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const cards = state.words;
  const selected = cards.find((card) => card.id === selectedId);
  const subjects = useMemo(() => ["전체", ...Array.from(new Set(cards.map(cardSubject)))], [cards]);
  const dueCards = useMemo(() => cards.filter(isDue), [cards]);
  const mistakeCards = useMemo(() => cards.filter((card) => (card.incorrectCount || 0) > (card.correctCount || 0)), [cards]);
  const filteredCards = useMemo(() => cards.filter((card) => (subject === "전체" || cardSubject(card) === subject) && [card.term, card.definition, ...card.tags].join(" ").toLowerCase().includes(search.toLowerCase())), [cards, search, subject]);
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
      setState(local);
      return hydrateStateFromServer(local);
    }).then((remote) => { if (mounted && remote) setState(remote); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    setSyncing(true);
    saveLocalState(state);
    const timer = window.setTimeout(() => syncStateToServer(state).then(() => { setSyncing(false); setSyncError(false); }).catch(() => { setSyncing(false); setSyncError(true); }), 300);
    return () => window.clearTimeout(timer);
  }, [state]);

  const openStudy = (studyMode: StudyMode) => {
    const source = studyMode === "mistakes" ? mistakeCards : dueCards;
    setMode(studyMode); setStudyIds(source.map((card) => card.id)); setStudyIndex(0); setRevealed(false); setView("study");
  };
  const gradeCard = (hard: boolean) => {
    if (!currentCard) return;
    const level = hard ? Math.max((currentCard.reviewLevel || 0) - 1, 0) : (currentCard.reviewLevel || 0) + 1;
    const now = new Date().toISOString();
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: now, words: current.words.map((card) => card.id === currentCard.id ? { ...card, reviewLevel: level, reviewDueAt: nextDue(level, hard), lastReviewedAt: now, correctCount: (card.correctCount || 0) + (hard ? 0 : 1), incorrectCount: (card.incorrectCount || 0) + (hard ? 1 : 0) } : card) }));
    if (studyIndex + 1 >= studyIds.length) { setView("home"); notify("학습을 완료했어요"); } else { setStudyIndex((index) => index + 1); setRevealed(false); }
  };
  const addCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get("question") || "").trim();
    const answer = String(data.get("answer") || "").trim();
    if (!question || !answer) return;
    if (cards.some((card) => card.term.trim().toLowerCase() === question.toLowerCase())) { notify("같은 질문이 이미 있어요"); return; }
    const file = data.get("photo");
    const photo = file instanceof File && file.size ? await photoUrl(file) : "";
    const newCard: Word = { id: `card-${crypto.randomUUID()}`, term: question, definition: answer, pos: String(data.get("subject") || "기타"), example: String(data.get("chapter") || "기본 개념"), memo: String(data.get("memo") || ""), tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean), photo, cardType: String(data.get("type") || "concept") as Word["cardType"], reviewLevel: 0, correctCount: 0, incorrectCount: 0 };
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: [newCard, ...current.words] }));
    event.currentTarget.reset(); setSheet(null); notify("카드를 추가했어요");
  };
  const updateBookmark = (id: string) => setState((current) => ({ ...current, updatedAt: new Date().toISOString(), words: current.words.map((card) => card.id === id ? { ...card, isBookmarked: !card.isBookmarked } : card) }));

  return <main className="study-app">
    <header className="study-topbar"><div className="study-brand"><div className="study-logo">q</div><div><strong>study deck</strong><small>시험을 카드로 정리하세요</small></div></div><span className={`sync-pill ${syncError ? "error" : ""}`}>{syncing ? "저장 중" : syncError ? "기기에 저장됨" : "저장됨"}</span></header>

    {view === "home" && <section className="study-home"><div className="study-greeting"><p>오늘의 학습</p><h1>다시 보면<br /><em>기억이 됩니다.</em></h1></div><button className="hero-study" type="button" onClick={() => openStudy("due")}><span><small>오늘 복습</small><strong>{dueCards.length}장</strong><b>바로 학습하기 <Icon name="chevron" /></b></span><div className="hero-ring"><span>{cards.length ? Math.round(((cards.length - dueCards.length) / cards.length) * 100) : 0}%</span></div></button><div className="quick-grid"><button type="button" onClick={() => setView("decks")}><Icon name="deck" /><strong>{cards.length}</strong><small>전체 카드</small></button><button type="button" onClick={() => openStudy("mistakes")}><Icon name="study" /><strong>{mistakeCards.length}</strong><small>오답 복습</small></button><button type="button" onClick={() => setView("decks")}><Icon name="chart" /><strong>{cards.length ? Math.round(cards.reduce((sum, card) => sum + (card.correctCount || 0), 0) / Math.max(cards.reduce((sum, card) => sum + (card.correctCount || 0) + (card.incorrectCount || 0), 0), 1) * 100) : 0}%</strong><small>정답률</small></button></div><div className="study-section-head"><div><p>과목별 카드</p><h2>어디부터 볼까요?</h2></div><button type="button" onClick={() => setView("decks")}>전체 보기</button></div><div className="subject-list">{subjects.slice(1, 5).map((item) => <button type="button" key={item} onClick={() => { setSubject(item); setView("decks"); }}><span className="subject-dot" /><span><strong>{item}</strong><small>{cards.filter((card) => cardSubject(card) === item).length}장 · {cards.filter((card) => cardSubject(card) === item && isDue(card)).length}장 복습</small></span><Icon name="chevron" /></button>)}</div></section>}

    {view === "decks" && <section className="study-content"><div className="study-page-title"><div><p>MY DECKS</p><h1>카드 모음</h1></div><button className="round-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button></div><label className="study-search"><span>⌕</span><input placeholder="문제나 개념 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="subject-tabs">{subjects.map((item) => <button className={subject === item ? "active" : ""} key={item} type="button" onClick={() => setSubject(item)}>{item}</button>)}</div><div className="card-list">{filteredCards.length ? filteredCards.map((card) => <button className="study-card-row" type="button" key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><span className="type-mark">{card.cardType === "formula" ? "ƒ" : card.cardType === "case" ? "↗" : "?"}</span><span><strong>{card.term}</strong><small>{cardSubject(card)} · {cardChapter(card)}</small></span><button className={`bookmark ${card.isBookmarked ? "active" : ""}`} type="button" onClick={(event) => { event.stopPropagation(); updateBookmark(card.id); }}><Icon name="star" /></button></button>) : <div className="study-empty"><strong>검색 결과가 없어요</strong><small>다른 키워드나 과목을 선택해보세요.</small></div>}</div></section>}

    {view === "study" && <section className="study-content study-session"><button className="back-button" type="button" onClick={() => setView("home")}><Icon name="back" />{mode === "mistakes" ? "오답 복습" : "오늘의 복습"}</button><div className="session-meta"><span>{Math.min(studyIndex + 1, studyIds.length)} / {studyIds.length}</span><div><span style={{ width: `${Math.min((studyIndex / Math.max(studyIds.length, 1)) * 100, 100)}%` }} /></div></div>{currentCard ? <><div className={`flash-card ${revealed ? "revealed" : ""}`}><div className="flash-top"><span>{cardSubject(currentCard)}</span><button type="button" onClick={() => updateBookmark(currentCard.id)} className={currentCard.isBookmarked ? "active" : ""}><Icon name="star" /></button></div>{currentCard.photo && <img src={currentCard.photo} alt="카드 이미지" />}<p className="flash-label">{revealed ? "정답" : currentCard.cardType === "formula" ? "공식" : "질문"}</p><h2>{revealed ? currentCard.definition : currentCard.term}</h2>{revealed && currentCard.memo && <p className="flash-memo">{currentCard.memo}</p>}<small>{revealed ? "이해한 내용을 말로 설명해보세요." : "답을 떠올린 다음 카드를 뒤집어보세요."}</small></div>{revealed ? <div className="grade-actions"><button className="hard" type="button" onClick={() => gradeCard(true)}>어려웠어요</button><button className="known" type="button" onClick={() => gradeCard(false)}>기억했어요</button></div> : <button className="flip-button" type="button" onClick={() => setRevealed(true)}>정답 보기</button>}</> : <div className="study-empty"><strong>복습할 카드가 없어요</strong><small>새 카드를 추가하거나 내일 다시 와보세요.</small></div>}</section>}

    {view === "mistakes" && <section className="study-content"><div className="study-page-title"><div><p>REVIEW</p><h1>오답 노트</h1></div></div><div className="mistake-summary"><strong>{mistakeCards.length}장</strong><span>아직 익숙하지 않은 카드</span><button type="button" onClick={() => openStudy("mistakes")}>복습 시작</button></div><div className="card-list">{mistakeCards.map((card) => <button className="study-card-row" type="button" key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><span className="type-mark wrong">!</span><span><strong>{card.term}</strong><small>오답 {card.incorrectCount || 0}회 · {cardSubject(card)}</small></span><Icon name="chevron" /></button>)}</div></section>}

    <nav className="study-nav"><button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}><Icon name="home" /><span>홈</span></button><button className={view === "decks" ? "active" : ""} type="button" onClick={() => setView("decks")}><Icon name="deck" /><span>카드</span></button><button className="study-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button><button className={view === "study" ? "active" : ""} type="button" onClick={() => openStudy("due")}><Icon name="study" /><span>학습</span></button><button className={view === "mistakes" ? "active" : ""} type="button" onClick={() => setView("mistakes")}><Icon name="chart" /><span>오답</span></button></nav>

    {sheet === "add" && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>NEW CARD</p><h2>새 카드 만들기</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><form className="card-form" onSubmit={addCard}><label>앞면 · 질문<input name="question" autoFocus placeholder="예: 정규화 3정규형의 조건은?" required /></label><label>뒷면 · 정답<textarea name="answer" rows={4} placeholder="정답과 해설을 적어주세요" required /></label><div className="form-grid"><label>과목<input name="subject" placeholder="데이터베이스" /></label><label>챕터<input name="chapter" placeholder="데이터 모델링" /></label></div><div className="form-grid"><label>유형<select name="type"><option value="concept">개념</option><option value="formula">공식</option><option value="case">사례</option></select></label><label>태그<input name="tags" placeholder="핵심, 암기" /></label></div><label>암기 메모<textarea name="memo" rows={2} placeholder="나만의 기억법" /></label><button className="known wide" type="submit">카드 저장하기</button></form></div></div>}

    {sheet === "detail" && selected && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>{cardSubject(selected)}</p><h2>카드 상세</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><div className="detail-card"><p>앞면</p><h3>{selected.term}</h3><hr /><p>뒷면</p><strong>{selected.definition}</strong><small>{selected.memo}</small></div><div className="detail-stats"><span>정답 {selected.correctCount || 0}회</span><span>오답 {selected.incorrectCount || 0}회</span><span>레벨 {selected.reviewLevel || 0}</span></div><button className="known wide" type="button" onClick={() => { setSheet(null); setStudyIds([selected.id]); setStudyIndex(0); setRevealed(false); setView("study"); }}>이 카드 학습하기</button></div></div>}
    {toast && <div className="study-toast">{toast}</div>}
  </main>;
}
