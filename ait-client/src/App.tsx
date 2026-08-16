import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { seedState } from "./data/seed";
import { hydrateStateFromServer, loadLocalStateAsync, saveLocalState, syncStateToServer } from "./lib/storage";
import { relationTypes, type AppState, type RelationType, type Word } from "./types";

type View = "home" | "decks" | "study" | "mistakes" | "graph";
type StudyMode = "due" | "mistakes";

function today() { return new Date().toISOString().slice(0, 10); }
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

function isDue(card: Word) { return !card.reviewDueAt || new Date(card.reviewDueAt).getTime() <= Date.now(); }
function cardSubject(card: Word) { return card.pos || card.tags[0] || "Other"; }
function cardChapter(card: Word) { return card.example || "Core Concepts"; }
function isValidImportedState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return candidate.schemaVersion === 2 && Array.isArray(candidate.words) && Array.isArray(candidate.relations) && candidate.words.every((card) => Boolean(card && typeof card.id === "string" && typeof card.term === "string" && typeof card.definition === "string" && Array.isArray(card.tags)));
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
  const stateReady = useRef(false);
  const toastTimer = useRef<number | null>(null);

  const cards = state.words;
  const selected = cards.find((card) => card.id === selectedId);
  const subjects = useMemo(() => ["All", ...Array.from(new Set(cards.map(cardSubject)))], [cards]);
  const dueCards = useMemo(() => cards.filter(isDue), [cards, nowTick]);
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
      stateReady.current = true;
      setState(local);
      return hydrateStateFromServer(local);
    }).then((remote) => { if (mounted && remote) setState(remote); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!stateReady.current) return;
    setSyncing(true);
    saveLocalState(state);
    const timer = window.setTimeout(() => syncStateToServer(state).then(() => { setSyncing(false); setSyncError(false); }).catch(() => { setSyncing(false); setSyncError(true); }), 300);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((tick) => tick + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const openStudy = (studyMode: StudyMode) => {
    const source = studyMode === "mistakes" ? mistakeCards : dueCards;
    setMode(studyMode); setStudyIds(source.map((card) => card.id)); setStudyIndex(0); setRevealed(false); setSelectedChoice(null); setView("study");
  };
  const gradeCard = (hard: boolean) => {
    if (!currentCard) return;
    const level = hard ? Math.max((currentCard.reviewLevel || 0) - 1, 0) : (currentCard.reviewLevel || 0) + 1;
    const now = new Date().toISOString();
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: now, words: current.words.map((card) => card.id === currentCard.id ? { ...card, reviewLevel: level, reviewDueAt: nextDue(level, hard), lastReviewedAt: now, correctCount: (card.correctCount || 0) + (hard ? 0 : 1), incorrectCount: (card.incorrectCount || 0) + (hard ? 1 : 0) } : card) }));
    if (studyIndex + 1 >= studyIds.length) { setView("home"); notify("Study session complete"); } else { setStudyIndex((index) => index + 1); setRevealed(false); setSelectedChoice(null); }
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
    const choices = String(data.get("choices") || "").split(",").map((choice) => choice.trim()).filter(Boolean);
    const newCard: Word = { id: `card-${crypto.randomUUID()}`, term: question, definition: answer, pos: String(data.get("subject") || "Other"), example: String(data.get("chapter") || "Core Concepts"), memo: String(data.get("memo") || ""), tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean), photo, cardType: String(data.get("type") || "concept") as Word["cardType"], choices, reviewLevel: 0, correctCount: 0, incorrectCount: 0 };
    setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), words: [newCard, ...current.words] }));
    event.currentTarget.reset(); setSheet(null); notify("Card added");
  };
  const updateBookmark = (id: string) => setState((current) => ({ ...current, updatedAt: new Date().toISOString(), words: current.words.map((card) => card.id === id ? { ...card, isBookmarked: !card.isBookmarked } : card) }));
  const exportJson = () => { const blob = new Blob([JSON.stringify({ ...state, schemaVersion: 2 }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "study-deck.json"; link.click(); URL.revokeObjectURL(url); notify("Deck exported"); };
  const importJson = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { const parsed: unknown = JSON.parse(await file.text()); if (!isValidImportedState(parsed)) throw new Error("Invalid deck"); setState({ ...parsed, updatedAt: new Date().toISOString(), schemaVersion: 2 }); notify("Deck imported"); } catch { notify("Could not import this deck"); } };
  const chooseAnswer = (choice: string) => { if (!currentCard) return; if (choice === currentCard.definition) { setSelectedChoice(choice); setRevealed(true); } else { setSelectedChoice(choice); notify("Not quite — try again"); } };
  const addRelation = () => { if (!relationFrom || !relationTo || relationFrom === relationTo) { notify("Choose two different cards"); return; } if (state.relations.some((relation) => relation.fromWordId === relationFrom && relation.toWordId === relationTo && relation.type === relationType)) { notify("That connection already exists"); return; } setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), relations: [...current.relations, { id: `relation-${crypto.randomUUID()}`, fromWordId: relationFrom, toWordId: relationTo, type: relationType }] })); notify("Connection added"); };
  const removeRelation = (id: string) => setState((current) => ({ ...current, schemaVersion: 2, updatedAt: new Date().toISOString(), relations: current.relations.filter((relation) => relation.id !== id) }));

  return <main className="study-app">
    <header className="study-topbar"><div className="study-brand"><div className="study-logo">q</div><div><strong>study deck</strong><small>Turn your syllabus into cards</small></div></div><div className="data-actions"><label className="data-button">Import<input type="file" accept="application/json,.json" onChange={importJson} /></label><button className="data-button" type="button" onClick={exportJson}>Export</button><span className={`sync-pill ${syncError ? "error" : ""}`}>{syncing ? "Saving" : syncError ? "Saved on device" : "Saved"}</span></div></header>

    {view === "home" && <section className="study-home"><div className="study-greeting"><p>Today’s study</p><h1>Review today.<br /><em>Remember more.</em></h1></div><button className="hero-study" type="button" onClick={() => openStudy("due")}><span><small>Due today</small><strong>{dueCards.length} cards</strong><b>Start studying <Icon name="chevron" /></b></span><div className="hero-ring"><span>{cards.length ? Math.round(((cards.length - dueCards.length) / cards.length) * 100) : 0}%</span></div></button><div className="quick-grid"><button type="button" onClick={() => setView("decks")}><Icon name="deck" /><strong>{cards.length}</strong><small>Total cards</small></button><button type="button" onClick={() => setView("mistakes")}><Icon name="study" /><strong>{mistakeCards.length}</strong><small>Mistakes</small></button><button type="button" onClick={() => setView("graph")}><Icon name="graph" /><strong>{state.relations.length}</strong><small>Connections</small></button></div><div className="study-section-head"><div><p>Subjects</p><h2>Where do you want to start?</h2></div><button type="button" onClick={() => setView("decks")}>View all</button></div><div className="subject-list">{subjects.slice(1, 5).map((item) => <button type="button" key={item} onClick={() => { setSubject(item); setView("decks"); }}><span className="subject-dot" /><span><strong>{item}</strong><small>{cards.filter((card) => cardSubject(card) === item).length} cards · {cards.filter((card) => cardSubject(card) === item && isDue(card)).length} due</small></span><Icon name="chevron" /></button>)}</div></section>}

    {view === "decks" && <section className="study-content"><div className="study-page-title"><div><p>MY DECKS</p><h1>Cards</h1></div><button className="round-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button></div><label className="study-search"><span>⌕</span><input placeholder="Search questions or concepts" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="subject-tabs">{subjects.map((item) => <button className={subject === item ? "active" : ""} key={item} type="button" onClick={() => setSubject(item)}>{item}</button>)}</div><div className="card-list">{filteredCards.length ? filteredCards.map((card) => <div className="study-card-row" role="button" tabIndex={0} key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(card.id); setSheet("detail"); } }}><span className="type-mark">{card.cardType === "formula" ? "ƒ" : card.cardType === "case" ? "↗" : "?"}</span><span><strong>{card.term}</strong><small>{cardSubject(card)} · {cardChapter(card)}</small></span><button className={`bookmark ${card.isBookmarked ? "active" : ""}`} type="button" aria-label={`Bookmark ${card.term}`} onClick={(event) => { event.stopPropagation(); updateBookmark(card.id); }}><Icon name="star" /></button></div>) : <div className="study-empty"><strong>No cards found</strong><small>Try another search or subject.</small></div>}</div></section>}

    {view === "study" && <section className="study-content study-session"><button className="back-button" type="button" onClick={() => setView("home")}><Icon name="back" />{mode === "mistakes" ? "Mistake review" : "Today’s review"}</button><div className="session-meta"><span>{Math.min(studyIndex + 1, studyIds.length)} / {studyIds.length}</span><div><span style={{ width: `${Math.min((studyIndex / Math.max(studyIds.length, 1)) * 100, 100)}%` }} /></div></div>{currentCard ? <><div className={`flash-card ${revealed ? "revealed" : ""}`}><div className="flash-top"><span>{cardSubject(currentCard)}</span><button type="button" onClick={() => updateBookmark(currentCard.id)} className={currentCard.isBookmarked ? "active" : ""}><Icon name="star" /></button></div>{currentCard.photo && <img src={currentCard.photo} alt="Card visual" />}<p className="flash-label">{revealed ? "Answer" : currentCard.cardType === "formula" ? "Formula" : currentCard.cardType === "cloze" ? "Cloze" : currentCard.cardType === "multiple-choice" ? "Choose an answer" : "Question"}</p><h2>{revealed ? currentCard.definition : currentCard.term}</h2>{!revealed && currentCard.cardType === "multiple-choice" && currentCard.choices?.length ? <div className="choice-list">{currentCard.choices.map((choice) => <button className={selectedChoice === choice ? "selected" : ""} type="button" key={choice} onClick={() => chooseAnswer(choice)}>{choice}</button>)}</div> : null}{revealed && currentCard.memo && <p className="flash-memo">{currentCard.memo}</p>}<small>{revealed ? "Explain the idea in your own words." : currentCard.cardType === "multiple-choice" ? "Choose the best answer." : "Recall the answer before revealing the card."}</small></div>{revealed ? <div className="grade-actions"><button className="hard" type="button" onClick={() => gradeCard(true)}>Still difficult</button><button className="known" type="button" onClick={() => gradeCard(false)}>I remembered</button></div> : <button className="flip-button" type="button" onClick={() => setRevealed(true)}>Reveal answer</button>}</> : <div className="study-empty"><strong>No cards are due</strong><small>Add a card or come back when the next review is scheduled.</small></div>}</section>}

    {view === "mistakes" && <section className="study-content"><div className="study-page-title"><div><p>REVIEW</p><h1>Mistakes</h1></div></div><div className="mistake-summary"><strong>{mistakeCards.length} cards</strong><span>Cards that need another pass</span><button type="button" onClick={() => openStudy("mistakes")}>Start review</button></div><div className="card-list">{mistakeCards.map((card) => <button className="study-card-row" type="button" key={card.id} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><span className="type-mark wrong">!</span><span><strong>{card.term}</strong><small>{card.incorrectCount || 0} mistakes · {cardSubject(card)}</small></span><Icon name="chevron" /></button>)}</div></section>}

    {view === "graph" && <section className="study-content graph-page"><div className="study-page-title"><div><p>KNOWLEDGE MAP</p><h1>Connections</h1></div><span className="graph-count">{state.relations.length} links</span></div><p className="graph-intro">Connect concepts to see how your syllabus fits together.</p><div className="graph-canvas"><svg viewBox="0 0 360 260" role="img" aria-label="Knowledge graph">{state.relations.map((relation) => { const fromIndex = cards.findIndex((card) => card.id === relation.fromWordId); const toIndex = cards.findIndex((card) => card.id === relation.toWordId); if (fromIndex < 0 || toIndex < 0) return null; const fromAngle = (fromIndex / Math.max(cards.length, 1)) * Math.PI * 2 - Math.PI / 2; const toAngle = (toIndex / Math.max(cards.length, 1)) * Math.PI * 2 - Math.PI / 2; const fx = 180 + Math.cos(fromAngle) * 102; const fy = 130 + Math.sin(fromAngle) * 78; const tx = 180 + Math.cos(toAngle) * 102; const ty = 130 + Math.sin(toAngle) * 78; return <line key={relation.id} x1={fx} y1={fy} x2={tx} y2={ty} />; })}{cards.slice(0, 12).map((card, index) => { const angle = (index / Math.max(Math.min(cards.length, 12), 1)) * Math.PI * 2 - Math.PI / 2; const x = 180 + Math.cos(angle) * 102; const y = 130 + Math.sin(angle) * 78; return <g key={card.id} transform={`translate(${x} ${y})`} onClick={() => { setSelectedId(card.id); setSheet("detail"); }}><circle r="23" /><text y="4">{card.term.slice(0, 10)}{card.term.length > 10 ? "…" : ""}</text></g>; })}</svg>{!cards.length && <div className="graph-empty">Add cards to start your knowledge map.</div>}</div><div className="graph-editor"><strong>Add a connection</strong><div className="form-grid"><select value={relationFrom} onChange={(event) => setRelationFrom(event.target.value)}><option value="">From card</option>{cards.map((card) => <option value={card.id} key={card.id}>{card.term}</option>)}</select><select value={relationTo} onChange={(event) => setRelationTo(event.target.value)}><option value="">To card</option>{cards.map((card) => <option value={card.id} key={card.id}>{card.term}</option>)}</select></div><div className="form-grid"><select value={relationType} onChange={(event) => setRelationType(event.target.value as RelationType)}>{relationTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select><button className="known" type="button" onClick={addRelation}>Connect</button></div></div><div className="relation-list">{state.relations.map((relation) => <div key={relation.id}><span><strong>{cards.find((card) => card.id === relation.fromWordId)?.term || "Unknown"}</strong><small>{relation.type.replaceAll("_", " ")}</small><strong>{cards.find((card) => card.id === relation.toWordId)?.term || "Unknown"}</strong></span><button type="button" onClick={() => removeRelation(relation.id)} aria-label="Remove connection"><Icon name="close" /></button></div>)}</div></section>}

    <nav className="study-nav"><button className={view === "home" ? "active" : ""} type="button" onClick={() => setView("home")}><Icon name="home" /><span>Home</span></button><button className={view === "decks" ? "active" : ""} type="button" onClick={() => setView("decks")}><Icon name="deck" /><span>Cards</span></button><button className="study-add" type="button" onClick={() => setSheet("add")}><Icon name="plus" /></button><button className={view === "study" ? "active" : ""} type="button" onClick={() => openStudy("due")}><Icon name="study" /><span>Study</span></button><button className={view === "graph" ? "active" : ""} type="button" onClick={() => setView("graph")}><Icon name="graph" /><span>Map</span></button></nav>

    {sheet === "add" && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>NEW CARD</p><h2>Create a study card</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><form className="card-form" onSubmit={addCard}><label>Front · question<input name="question" autoFocus placeholder="e.g. What is the condition for 3NF?" required /></label><label>Back · answer<textarea name="answer" rows={4} placeholder="Write the answer and explanation" required /></label><div className="form-grid"><label>Subject<input name="subject" placeholder="Database" /></label><label>Chapter<input name="chapter" placeholder="Data Modeling" /></label></div><div className="form-grid"><label>Type<select name="type"><option value="concept">Concept</option><option value="formula">Formula</option><option value="case">Case</option><option value="multiple-choice">Multiple choice</option><option value="cloze">Cloze</option></select></label><label>Tags<input name="tags" placeholder="key, memorize" /></label></div><label>Choices · comma separated<input name="choices" placeholder="Option A, Option B, Option C" /></label><label>Memory note<textarea name="memo" rows={2} placeholder="Your own memory cue" /></label><button className="known wide" type="submit">Save card</button></form></div></div>}

    {sheet === "detail" && selected && <div className="study-sheet"><div className="sheet-dim" onClick={() => setSheet(null)} /><div className="study-sheet-panel"><div className="sheet-grab" /><div className="sheet-title"><div><p>{cardSubject(selected)}</p><h2>Card details</h2></div><button type="button" onClick={() => setSheet(null)}><Icon name="close" /></button></div><div className="detail-card"><p>Front</p><h3>{selected.term}</h3><hr /><p>Back</p><strong>{selected.definition}</strong><small>{selected.memo}</small></div><div className="detail-stats"><span>Correct {selected.correctCount || 0}</span><span>Mistakes {selected.incorrectCount || 0}</span><span>Level {selected.reviewLevel || 0}</span></div><button className="known wide" type="button" onClick={() => { setSheet(null); setStudyIds([selected.id]); setStudyIndex(0); setRevealed(false); setView("study"); }}>Study this card</button></div></div>}
    {toast && <div className="study-toast">{toast}</div>}
  </main>;
}
