import { useEffect, useMemo, useState, type FormEvent } from "react";
import { seedState } from "./data/seed";
import { buildMapLayout, getRelatedWords } from "./lib/map";
import {
  hydrateStateFromServer,
  loadLocalState,
  loadPersistedTag,
  loadPersistedView,
  loadPersistedWordId,
  saveLocalState,
  savePersistedTag,
  savePersistedView,
  savePersistedWordId,
  syncStateToServer,
} from "./lib/storage";
import { getTossAppVersionSafe } from "./platform/toss";
import { relationLabel, relationTypes, type AppState, type RelationType, type Word } from "./types";

const defaultTimeSlots = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "18:00",
  "18:30",
];

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getTodayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function createBusyMatrix(rangeStart: string, rangeEnd: string) {
  const matrix: Record<string, Record<string, boolean>> = {};
  const startDate = new Date(`${rangeStart}T00:00:00`);
  const endDate = new Date(`${rangeEnd}T00:00:00`);

  for (const date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const key = formatDate(date);
    matrix[key] = {};
    defaultTimeSlots.forEach((slot, index) => {
      matrix[key][slot] = index % 7 === 0 || index === 4;
    });
  }

  return matrix;
}

function uniqueTags(words: Word[]) {
  const tags = new Set<string>();
  words.forEach((word) => word.tags.forEach((tag) => tags.add(tag)));
  return ["all", ...Array.from(tags).sort()];
}

function matchesWord(word: Word, term: string) {
  if (!term) return true;
  const haystack = [word.term, word.definition, word.example, word.memo, word.pos, ...word.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function profileForRoute(routeName: string) {
  if (routeName === "멘토링") {
    return {
      label: "멘토링",
      duration: 30,
      subtitle: "조언과 방향 점검이 필요한 만남입니다.",
      agenda: ["상대가 기대하는 도움의 범위", "가장 필요한 조언 1~2개", "후속 자료 또는 추천"],
    };
  }
  if (routeName === "소개 미팅") {
    return {
      label: "소개 미팅",
      duration: 30,
      subtitle: "짧게 인사하고 적합성을 확인합니다.",
      agenda: ["만남 목적", "후속 미팅 필요 여부", "다음 연락 방식"],
    };
  }
  if (routeName === "심화 논의") {
    return {
      label: "심화 논의",
      duration: 30,
      subtitle: "기술과 사업을 깊게 보는 만남입니다.",
      agenda: ["문제 정의와 배경", "현재 접근 방식과 병목", "구체적 협업 또는 검토 포인트"],
    };
  }
  return {
    label: "커피챗",
    duration: 30,
    subtitle: "가볍게 대화할 수 있는 시간만 공개합니다.",
    agenda: ["서로의 배경과 연결 지점", "현재 관심 주제 1개", "다음 액션 또는 후속 연락"],
  };
}

function renderPhoto(photo: string | undefined, label: string) {
  if (photo) {
    return <img src={photo} alt={label} />;
  }
  return <div className="photo-fallback">{label}</div>;
}

export function App() {
  const [state, setState] = useState<AppState>(() => loadLocalState());
  const [view, setView] = useState(() => loadPersistedView());
  const [selectedWordId, setSelectedWordId] = useState(() =>
    loadPersistedWordId(seedState.words[0].id),
  );
  const [activeTag, setActiveTag] = useState(() => loadPersistedTag());
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(formatDate(getTodayPlus(5)));
  const [rangeEnd, setRangeEnd] = useState(formatDate(getTodayPlus(9)));
  const [busyMatrix] = useState(() => createBusyMatrix(rangeStart, rangeEnd));

  const selectedWord = state.words.find((word) => word.id === selectedWordId) || state.words[0];
  const routeProfile = useMemo(() => profileForRoute("커피챗"), []);
  const tags = useMemo(() => uniqueTags(state.words), [state.words]);
  const filteredWords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return state.words.filter((word) => {
      const tagOk = activeTag === "all" || word.tags.includes(activeTag);
      return tagOk && matchesWord(word, term);
    });
  }, [activeTag, search, state.words]);
  const relatedWords = useMemo(
    () => getRelatedWords(state.words, state.relations, selectedWord?.id || ""),
    [state.relations, state.words, selectedWord?.id],
  );
  const mapLayout = useMemo(
    () => (selectedWord ? buildMapLayout(selectedWord, relatedWords) : { nodes: [], edges: [] }),
    [relatedWords, selectedWord],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveLocalState(state);
      syncStateToServer(state).catch(() => {
        // keep local state if the API is offline
      });
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
    let mounted = true;
    hydrateStateFromServer().then((serverState) => {
      if (!mounted || !serverState) return;
      setState(serverState);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!state.words.length) return;
    if (!state.words.some((word) => word.id === selectedWordId)) {
      setSelectedWordId(state.words[0].id);
    }
  }, [selectedWordId, state.words]);

  const stats = [
    { label: "words", value: state.words.length },
    { label: "relations", value: state.relations.length },
    { label: "photos", value: state.words.filter((word) => word.photo).length },
  ];

  const openToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2000);
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
    const formData = new FormData(form);
    const term = String(formData.get("term") || "").trim();
    const definition = String(formData.get("definition") || "").trim();
    if (!term || !definition) return;
    const photoFile = formData.get("photo");
    const photo =
      photoFile instanceof File && photoFile.size > 0 ? await fileToDataUrl(photoFile) : "";
    const tagsValue = String(formData.get("tags") || "");
    const word: Word = {
      id: `word-${crypto.randomUUID()}`,
      term,
      pos: String(formData.get("pos") || "").trim(),
      definition,
      example: String(formData.get("example") || "").trim(),
      memo: String(formData.get("memo") || "").trim(),
      tags: tagsValue
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      photo,
    };

    setState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      words: [word, ...current.words],
    }));
    setSelectedWordId(word.id);
    setDrawerOpen(true);
    form.reset();
    openToast("단어를 저장했습니다.");
  };

  const saveDetail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const photoFile = formData.get("photo");
    let photo = selectedWord?.photo || "";
    if (photoFile instanceof File && photoFile.size > 0) {
      photo = await fileToDataUrl(photoFile);
    }

    updateWord({
      term: String(formData.get("term") || "").trim(),
      pos: String(formData.get("pos") || "").trim(),
      definition: String(formData.get("definition") || "").trim(),
      example: String(formData.get("example") || "").trim(),
      memo: String(formData.get("memo") || "").trim(),
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      photo,
    });
    openToast("단어를 수정했습니다.");
  };

  const addRelation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const toWordId = String(formData.get("target") || "");
    const type = String(formData.get("type") || "related") as RelationType;
    const label = String(formData.get("label") || "").trim();
    if (!toWordId || !selectedWord) return;

    setState((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      relations: [
        {
          id: `rel-${crypto.randomUUID()}`,
          fromWordId: selectedWord.id,
          toWordId,
          type,
          label,
        },
        ...current.relations,
      ],
    }));
    form.reset();
    openToast("관계를 연결했습니다.");
  };

  const removeSelectedWord = () => {
    if (!selectedWord) return;
    const confirmDelete = window.confirm(`"${selectedWord.term}" 단어를 삭제할까요?`);
    if (!confirmDelete) return;

    setState((current) => {
      const remainingWords = current.words.filter((word) => word.id !== selectedWord.id);
      const remainingRelations = current.relations.filter(
        (relation) =>
          relation.fromWordId !== selectedWord.id && relation.toWordId !== selectedWord.id,
      );
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        words: remainingWords,
        relations: remainingRelations,
      };
    });

    const nextWord = state.words.find((word) => word.id !== selectedWord.id);
    if (nextWord) {
      setSelectedWordId(nextWord.id);
    }
    setDrawerOpen(false);
    openToast("단어를 삭제했습니다.");
  };

  const seedData = () => {
    setState(structuredClone(seedState));
    setSelectedWordId(seedState.words[0].id);
    setActiveTag("all");
    setSearch("");
    setDrawerOpen(true);
    openToast("샘플 데이터를 복원했습니다.");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "memo-with-photo-graph-export.json";
    link.click();
    URL.revokeObjectURL(url);
    openToast("JSON을 내보냈습니다.");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">m</div>
          <div>
            <strong>memo with photo graph</strong>
            <small>
              {getTossAppVersionSafe() ? `Toss ${getTossAppVersionSafe()}` : "AI T client scaffold"}
            </small>
          </div>
        </div>
        <button className="ghost" type="button" onClick={exportJson}>
          내보내기
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AIT client scaffold</p>
          <h1>단어를 사진과 관계로 기억하는 앱</h1>
          <p className="lead">
            App in Toss용으로 옮기기 쉬운 구조를 먼저 만들고, 상태는 로컬 저장과 API 동기화를 같이
            둡니다.
          </p>
          <div className="route-banner">
            <span>{routeProfile.label}</span>
            <strong>{routeProfile.subtitle}</strong>
          </div>
        </div>
        <div className="hero-stats">
          {stats.map((item) => (
            <div className="stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="search-card">
        <label className="search">
          <span>검색</span>
          <input
            type="search"
            placeholder="단어, 뜻, 메모, 태그 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="quick-filters">
          {tags.map((tag) => (
            <button
              key={tag}
              className={`chip ${tag === activeTag ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTag(tag)}
            >
              {tag === "all" ? "전체" : `#${tag}`}
            </button>
          ))}
        </div>
      </section>

      <section className="tabs" aria-label="보기 전환">
        {[
          { value: "library", label: "단어장" },
          { value: "map", label: "맵" },
          { value: "relations", label: "관계" },
        ].map((tab) => (
          <button
            key={tab.value}
            className={`tab ${view === tab.value ? "active" : ""}`}
            type="button"
            onClick={() => setView(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      <section className="panel">
        {view === "library" ? (
          filteredWords.length ? (
            <>
              <div className="section-head">
                <div>
                  <p className="eyebrow">Library</p>
                  <h2>{filteredWords.length}개 단어</h2>
                </div>
              </div>
              <div className="word-list">
                {filteredWords.map((word) => (
                  <article
                    className={`word-card ${word.id === selectedWordId ? "selected" : ""}`}
                    key={word.id}
                  >
                    <div className="word-photo">{renderPhoto(word.photo, word.term)}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWordId(word.id);
                        setDrawerOpen(true);
                      }}
                    >
                      <div className="word-copy">
                        <strong>{word.term}</strong>
                        <p>{word.definition}</p>
                        <div className="word-tags">
                          {word.tags.slice(0, 3).map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="panel-empty">
              <strong>검색 결과가 없습니다.</strong>
              <span>단어, 뜻, 메모, 태그를 바꿔보세요.</span>
            </div>
          )
        ) : view === "map" ? (
          selectedWord ? (
            <>
              <div className="section-head">
                <div>
                  <p className="eyebrow">Map</p>
                  <h2>{selectedWord.term}</h2>
                </div>
                <div className="map-toolbar">
                  <button className="ghost" type="button" onClick={() => setDrawerOpen(true)}>
                    중심
                  </button>
                  <button className="ghost" type="button" onClick={seedData}>
                    재배치
                  </button>
                </div>
              </div>
              <div className="map-wrap">
                <div className="map-canvas">
                  <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <marker
                        id="arrow"
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="3.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0 L0,7 L8,3.5 z" fill="rgba(46,107,91,0.22)" />
                      </marker>
                    </defs>
                    {mapLayout.edges.map((edge, index) => (
                      <g key={`${edge.x1}-${edge.y1}-${index}`}>
                        <line
                          x1={edge.x1}
                          y1={edge.y1}
                          x2={edge.x2}
                          y2={edge.y2}
                          stroke="rgba(46,107,91,0.18)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          markerEnd="url(#arrow)"
                        />
                        <text
                          x={(edge.x1 + edge.x2) / 2}
                          y={(edge.y1 + edge.y2) / 2 - 8}
                          fill="rgba(21,24,21,0.52)"
                          fontSize="16"
                          fontFamily="Inter, Arial, sans-serif"
                        >
                          {edge.label}
                        </text>
                      </g>
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
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWordId(node.word.id);
                          setDrawerOpen(true);
                        }}
                      >
                        <div className="node-card">
                          <div className="node-photo">
                            {renderPhoto(node.word.photo, node.word.term)}
                          </div>
                          <div className="node-copy">
                            <strong>{node.word.term}</strong>
                            <span>{node.word.pos || "word"}</span>
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="panel-empty">
              <strong>중심 단어가 없습니다.</strong>
              <span>단어를 먼저 추가하세요.</span>
            </div>
          )
        ) : selectedWord ? (
          <>
            <div className="section-head">
              <div>
                <p className="eyebrow">Relations</p>
                <h2>{selectedWord.term}</h2>
              </div>
            </div>
            <div className="relation-list">
              {relatedWords.length ? (
                relatedWords.map((item) => (
                  <div className="relation-item" key={item.relation.id}>
                    <strong>{item.word.term}</strong>
                    <p>
                      {relationLabel(item.displayType)}
                      {item.relation.label ? ` · ${item.relation.label}` : ""}
                    </p>
                    <div className="word-tags" style={{ marginTop: 8 }}>
                      <button
                        className="chip"
                        type="button"
                        onClick={() => {
                          setSelectedWordId(item.word.id);
                          setDrawerOpen(true);
                        }}
                      >
                        열기
                      </button>
                      <span className="tag">{item.word.pos || "word"}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="panel-empty">
                  <strong>아직 연결된 단어가 없습니다.</strong>
                  <span>맵 탭에서 중심 단어를 골라 연결하세요.</span>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>

      <section className="composer-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Add Word</p>
            <h2>새 단어 추가</h2>
          </div>
          <button className="ghost" type="button" onClick={seedData}>
            샘플 복원
          </button>
        </div>

        <form className="word-form" onSubmit={addWord}>
          <div className="grid-two">
            <label>
              단어
              <input name="term" type="text" placeholder="예: orchard" required />
            </label>
            <label>
              품사
              <input name="pos" type="text" placeholder="noun" />
            </label>
          </div>
          <label>
            뜻
            <textarea name="definition" rows={3} placeholder="사과나무 과수원" required />
          </label>
          <label>
            예문
            <textarea
              name="example"
              rows={2}
              placeholder="We walked through the orchard in spring."
            />
          </label>
          <label>
            메모
            <textarea name="memo" rows={2} placeholder="연상 포인트나 암기 팁" />
          </label>
          <div className="grid-two">
            <label>
              태그
              <input name="tags" type="text" placeholder="nature, food" />
            </label>
            <label>
              사진
              <input name="photo" type="file" accept="image/*" />
            </label>
          </div>
          <div className="inline-actions">
            <button className="primary" type="submit">
              저장
            </button>
            <button className="ghost" type="reset">
              초기화
            </button>
          </div>
        </form>
      </section>

      <div className={`sheet ${drawerOpen ? "open" : ""}`} hidden={!drawerOpen}>
        <div className="sheet-backdrop" onClick={() => setDrawerOpen(false)} />
        <div className="sheet-panel">
          <div className="sheet-handle" />
          <div className="sheet-head">
            <div>
              <p className="eyebrow">Word Detail</p>
              <h2>{selectedWord?.term || "단어"}</h2>
            </div>
            <button className="ghost" type="button" onClick={() => setDrawerOpen(false)}>
              닫기
            </button>
          </div>

          {selectedWord ? (
            <>
              <div className="detail-photo">
                {renderPhoto(selectedWord.photo, selectedWord.term)}
              </div>
              <form className="detail-form" onSubmit={saveDetail}>
                <div className="grid-two">
                  <label>
                    단어
                    <input name="term" type="text" defaultValue={selectedWord.term} />
                  </label>
                  <label>
                    품사
                    <input name="pos" type="text" defaultValue={selectedWord.pos || ""} />
                  </label>
                </div>
                <label>
                  뜻
                  <textarea name="definition" rows={3} defaultValue={selectedWord.definition} />
                </label>
                <label>
                  예문
                  <textarea name="example" rows={2} defaultValue={selectedWord.example || ""} />
                </label>
                <label>
                  메모
                  <textarea name="memo" rows={2} defaultValue={selectedWord.memo || ""} />
                </label>
                <div className="grid-two">
                  <label>
                    태그
                    <input name="tags" type="text" defaultValue={selectedWord.tags.join(", ")} />
                  </label>
                  <label>
                    사진 교체
                    <input name="photo" type="file" accept="image/*" />
                  </label>
                </div>
                <div className="inline-actions">
                  <button className="primary" type="submit">
                    변경 저장
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      updateWord({
                        photo: "",
                      })
                    }
                  >
                    사진 제거
                  </button>
                </div>
                <button className="danger" type="button" onClick={removeSelectedWord}>
                  단어 삭제
                </button>
              </form>

              <div className="detail-section">
                <p className="detail-meta">
                  {[selectedWord.pos, selectedWord.example, selectedWord.memo]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="detail-section">
                <h3>관계 연결</h3>
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
                      연결할 단어
                    </option>
                    {state.words
                      .filter((word) => word.id !== selectedWord.id)
                      .map((word) => (
                        <option value={word.id} key={word.id}>
                          {word.term}
                        </option>
                      ))}
                  </select>
                  <input name="label" type="text" placeholder="라벨(선택)" />
                  <button className="primary" type="submit">
                    연결
                  </button>
                </form>
              </div>

              <div className="detail-section">
                <h3>연결된 단어</h3>
                <div className="relation-list">
                  {relatedWords.length ? (
                    relatedWords.map((item) => (
                      <div className="relation-item" key={item.relation.id}>
                        <strong>{item.word.term}</strong>
                        <p>
                          {relationLabel(item.displayType)}
                          {item.relation.label ? ` · ${item.relation.label}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty">
                      <strong>연결이 없습니다.</strong>
                      <span>아래에서 관계를 추가하세요.</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <section className="composer-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>예약/시트 흐름 샘플</h2>
          </div>
        </div>
        <div className="detail-section">
          <p className="detail-meta">
            {routeProfile.subtitle} {rangeStart} - {rangeEnd}
          </p>
        </div>
        <div className="detail-section">
          <div className="word-tags">
            {Object.keys(busyMatrix)
              .slice(0, 3)
              .map((date) => (
                <span className="tag" key={date}>
                  {date}
                </span>
              ))}
          </div>
        </div>
      </section>

      <div className="toast" hidden={!toast}>
        {toast}
      </div>
      <div className="footer-note">
        <span>Version</span>
        <strong>{getTossAppVersionSafe() || "local"}</strong>
      </div>
    </main>
  );
}
