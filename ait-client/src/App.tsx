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
function cardSubject(card: Word) { return card.pos || card.tags[0] || "Other"; }
function cardChapter(card: Word) { return card.example || "Core Concepts"; }

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
  const toastTimer = useRef<number | null>(null);

  const cards = state.words;
  const selected = cards.find((card) => card.id === selectedId);
  const subjects = useMemo(() => ["All", ...Array.from(new Set(cards.map(cardSubject)))], [cards]);
  const dueCards = useMemo(() => cards.filter(isDue), [cards]);
  const mistakeCards = useMemo(() => cards.filter((card) => (card.incorrectCount || 0) > (card.correctCount || 0)), [cards]);
  const filteredCards = useMemo(() => cards.filter((card) => (subject === "All" || cardSubject(card) === subject) && [card.term, card.definition, ...card.tags].join(" ").toLowerCase().includes(search.toLowerCase())), [cards, search, subject]);
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
    if (studyIndex + 1 >= studyIds.length) { setView("home"); notify("Study session complete"); } else { setStudyIndex((index) => index + 1); setRevealed(false); }
  };
  const addCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get("question") || "").trim();
    const answer = String(data.get("answer") || "").trim();
    if (!question || !answer) return;
    if (cards.some((card) => card.term.trim().toLowerCase() === question.toLowerCase())) { notify("A card with the same question already exists"); return; }
    const file = data.get("photo");
    const photo = file instanceof File && file.size ? await photoUrl(file) : "";
    const newCard: Word = { id: `card-${crypto.randomUUID()}`, term: question, definition: answer, pos: String(data.get("subject") || "Other"), example: String(data.get("chapter") || "Core Concepts"), memo: String(data.get("memo") || ""), tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean), photo, cardType: String(data.get("type") || "concept") as Word["cardType"], reviewLevel: 0, correctCount: 0, incorrectCount: 0 };
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: [newCard, ...current.words] }));
    event.currentTarget.reset(); setSheet(null); notify("Card added");
  };
  const updateBookmark = (id: string) => setState((current) => ({ ...current, updatedAt: new Date().toISOString(), words: current.words.map((card) => card.id === id ? { ...card, isBookmarked: !card.isBookmarked } : card) }));

  return <main className="study-app">
    <header className="study-topbar"><div className="study-brand"><div className="study-logo">q</div><div><strong>study deck</strong><small>Turn your syllabus into cards</small></div></div><span className={`sync-pill ${syncError ? "error" : ""}`}>{syncing ? "Saving" : syncError ? "Saved on device" : "Saved"}</span></header>

    {view === "home" && <section className="study-home"><div className="study-greeting"><p>Today’s study</p><h1>Review today.<br /><em>Remember more.</em></h1></div><button className="hero-study" type="button" onClick={() => openStudy("due")}><span><small>Due today</small><strong>{dueCards.length} cards</strong><b>Start studying <Icon name="chevron" /></b></span><div className="hero-ring"><span>{cards.length ? Math.round(((cards.length - dueCards.length) / cards.length) * 100) : 0}%</span></div></button><div className="quick-grid"><button type="button" onClick={() => setView("decks")}><Icon name="deck" /><strong>{cards.length}</strong><small>Total cards</small></button><button type="button" onClick={() => openStudy("mistakes")}><Icon name="study" /><strong>{mistakeCards.length}</strong><small>Mistakes</small></button><button type="button" onClick={() => setView("decks")}><Icon name="chart" /><strong>{cards.length ? Math.round(cards.reduce((sum, card) => sum + (card.correctCount || 0), 0) / Math.max(cards.reduce((sum, card) => sum + (card.correctCount || 0) + (card.incorrectCount || 0), 0), 1) * 100) : 0}%</strong><small>Accuracy</small></button></div><div className="study-section-head"><div><p>Subjects</p><h2>Where do you want to start?</h2></div><button type="button" onClick={() => setView("decks")}>View all</button></div><div className="subject-list">{subjects.slice(1, 5).map((item) => <button type="button" key={item} onClick={() => { setSubject(item); setView("decks"); }}><span className="subject-dot" /><span><strong>{item}</strong><small>{cards.filter((card) => cardSubject(card) === item).length} cards · {cards.filter((card) => cardSubject(card) === item && isDue(card)).length} due</small></span><Icon name="chevron" /></button>)}</div></section>}

    {view === "decks" && <section className="study-content"><div className="study-page-title"><div><p>MY DECKS</p><h1>Cards</h1></div><button className="round-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button></div><label className="study-search"><span>⌕</span><input placeholder="Search questions or concepts" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="subject-tabs">{subjects.map((item) => <button className={subject === item ? "active" : ""} key={item} type="button" onClick={() => setSubject(item)}>{item}</button>)}</div><div className="card-list">{filteredCards.length ? filteredCards.map((card) => <button className="study-card-row" type="button" key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><span className="type-mark">{card.cardType === "formula" ? "ƒ" : card.cardType === "case" ? "↗" : "?"}</span><span><strong>{card.term}</strong><small>{cardSubject(card)} · {cardChapter(card)}</small></span><button className={`bookmark ${card.isBookmarked ? "active" : ""}`} type="button" onClick={(event) => { event.stopPropagation(); updateBookmark(card.id); }}><Icon name="star" /></button></button>) : <div className="study-empty"><strong>No cards found</strong><small>Try another search or subject.</small></div>}</div></section>}

    {view === "study" && <section className="study-content study-session"><button className="back-button" type="button" onClick={() => setView("home")}><Icon name="back" />{mode === "mistakes" ? "Mistake review" : "Today’s review"}</button><div className="session-meta"><span>{Math.min(studyIndex + 1, studyIds.length)} / {studyIds.length}</span><div><span style={{ width: `${Math.min((studyIndex / Math.max(studyIds.length, 1)) * 100, 100)}%` }} /></div></div>{currentCard ? <><div className={`flash-card ${revealed ? "revealed" : ""}`}><div className="flash-top"><span>{cardSubject(currentCard)}</span><button type="button" onClick={() => updateBookmark(currentCard.id)} className={currentCard.isBookmarked ? "active" : ""}><Icon name="star" /></button></div>{currentCard.photo && <img src={currentCard.photo} alt="Card visual" />}<p className="flash-label">{revealed ? "Answer" : currentCard.cardType === "formula" ? "Formula" : "Question"}</p><h2>{revealed ? currentCard.definition : currentCard.term}</h2>{revealed && currentCard.memo && <p className="flash-memo">{currentCard.memo}</p>}<small>{revealed ? "Explain the idea in your own words." : "Recall the answer before revealing the card."}</small></div>{revealed ? <div className="grade-actions"><button className="hard" type="button" onClick={() => gradeCard(true)}>Still difficult</button><button className="known" type="button" onClick={() => gradeCard(false)}>I remembered</button></div> : <button className="flip-button" type="button" onClick={() => setRevealed(true)}>Reveal answer</button>}</> : <div className="study-empty"><strong>No cards are due</strong><small>Add a card or come back when the next review is scheduled.</small></div>}</section>}

    {view === "mistakes" && <section className="study-content"><div className="study-page-title"><div><p>REVIEW</p><h1>Mistakes</h1></div></div><div className="mistake-summary"><strong>{mistakeCards.length} cards</strong><span>Cards that need another pass</span><button type="button" onClick={() => openStudy("mistakes")}>Start review</button></div><div className="card-list">{mistakeCards.map((card) => <button className="study-card-row" type="button" key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><span className="type-mark wrong">!</span><span><strong>{card.term}</strong><small>{card.incorrectCount || 0} mistakes · {cardSubject(card)}</small></span><Icon name="chevron" /></button>)}</div></section>}

    <nav className="study-nav"><button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}><Icon name="home" /><span>Home</span></button><button className={view === "decks" ? "active" : ""} type="button" onClick={() => setView("decks")}><Icon name="deck" /><span>Cards</span></button><button className="study-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button><button className={view === "study" ? "active" : ""} type="button" onClick={() => openStudy("due")}><Icon name="study" /><span>Study</span></button><button className={view === "mistakes" ? "active" : ""} type="button" onClick={() => setView("mistakes")}><Icon name="chart" /><span>Mistakes</span></button></nav>

    {sheet === "add" && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>NEW CARD</p><h2>Create a study card</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><form className="card-form" onSubmit={addCard}><label>Front · question<input name="question" autoFocus placeholder="e.g. What is the condition for 3NF?" required /></label><label>Back · answer<textarea name="answer" rows={4} placeholder="Write the answer and explanation" required /></label><div className="form-grid"><label>Subject<input name="subject" placeholder="Database" /></label><label>Chapter<input name="chapter" placeholder="Data Modeling" /></label></div><div className="form-grid"><label>Type<select name="type"><option value="concept">Concept</option><option value="formula">Formula</option><option value="case">Case</option><option value="multiple-choice">Multiple choice</option><option value="cloze">Cloze</option></select></label><label>Tags<input name="tags" placeholder="key, memorize" /></label></div><label>Memory note<textarea name="memo" rows={2} placeholder="Your own memory cue" /></label><button className="known wide" type="submit">Save card</button></form></div></div>}

    {sheet === "detail" && selected && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>{cardSubject(selected)}</p><h2>Card details</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><div className="detail-card"><p>Front</p><h3>{selected.term}</h3><hr /><p>Back</p><strong>{selected.definition}</strong><small>{selected.memo}</small></div><div className="detail-stats"><span>Correct {selected.correctCount || 0}</span><span>Mistakes {selected.incorrectCount || 0}</span><span>Level {selected.reviewLevel || 0}</span></div><button className="known wide" type="button" onClick={() => { setSheet(null); setStudyIds([selected.id]); setStudyIndex(0); setRevealed(false); setView("study"); }}>Study this card</button></div></div>}
    {toast && <div className="study-toast">{toast}</div>}
  </main>;
}
