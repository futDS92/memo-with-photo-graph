const STORAGE_KEY = "vocab-map-data";
const VIEW_KEY = "vocab-map-view";
const SELECTED_KEY = "vocab-map-selected";
const API_STATE_URL = "/api/state";

const relationTypes = [
  { value: "hypernym", label: "상위 개념" },
  { value: "hyponym", label: "하위 개념" },
  { value: "part_of", label: "부분" },
  { value: "has_part", label: "전체" },
  { value: "synonym", label: "유의어" },
  { value: "antonym", label: "반의어" },
  { value: "related", label: "관련어" },
  { value: "example", label: "예시" },
];

const seedWords = [
  {
    id: "word-orchard",
    term: "orchard",
    pos: "noun",
    definition: "과수원, 특히 사과나 배 같은 과일나무가 자라는 장소",
    example: "We walked through the orchard in spring.",
    memo: "fruit / trees / garden 이미지를 같이 기억",
    tags: ["nature", "food", "place"],
    photo: createSeedPhoto("orchard", "#425f56", "#c7a06f"),
  },
  {
    id: "word-grove",
    term: "grove",
    pos: "noun",
    definition: "작은 나무숲, 나무가 일정하게 모여 있는 곳",
    example: "A grove of olive trees stood behind the house.",
    memo: "orchard보다 더 자연적이고 작은 숲 느낌",
    tags: ["nature", "landscape"],
    photo: createSeedPhoto("grove", "#2e5b4e", "#8bb49a"),
  },
  {
    id: "word-tree",
    term: "tree",
    pos: "noun",
    definition: "나무, 줄기와 가지를 가진 식물",
    example: "The tree casts a long shadow.",
    memo: "상위 개념: orchard와 grove 모두 tree와 연결",
    tags: ["nature", "base"],
    photo: createSeedPhoto("tree", "#45574d", "#b48d5e"),
  },
  {
    id: "word-farm",
    term: "farm",
    pos: "noun",
    definition: "농장, 농작물이나 가축을 기르는 곳",
    example: "The farm grows apples and pears.",
    memo: "orchard가 farm의 하위 공간으로 느껴질 때 연결",
    tags: ["food", "place"],
    photo: createSeedPhoto("farm", "#5b6f53", "#d1a975"),
  },
  {
    id: "word-bloom",
    term: "bloom",
    pos: "verb",
    definition: "꽃이 피다, 번성하다",
    example: "The trees bloom in April.",
    memo: "사진과 연결하면 계절 기억이 잘 붙음",
    tags: ["verb", "season"],
    photo: createSeedPhoto("bloom", "#734f5c", "#d7a58a"),
  },
];

const seedRelations = [
  { id: "rel-1", fromWordId: "word-orchard", toWordId: "word-tree", type: "hyponym", label: "contains" },
  { id: "rel-2", fromWordId: "word-grove", toWordId: "word-tree", type: "hyponym", label: "made of" },
  { id: "rel-3", fromWordId: "word-orchard", toWordId: "word-farm", type: "part_of", label: "can belong to" },
  { id: "rel-4", fromWordId: "word-orchard", toWordId: "word-bloom", type: "related", label: "seasonal image" },
  { id: "rel-5", fromWordId: "word-grove", toWordId: "word-bloom", type: "related", label: "forest feeling" },
];

const els = {
  stats: document.querySelector("#stats"),
  searchInput: document.querySelector("#searchInput"),
  quickFilters: document.querySelector("#quickFilters"),
  viewPanel: document.querySelector("#viewPanel"),
  tabs: document.querySelectorAll(".tab"),
  exportButton: document.querySelector("#exportButton"),
  seedButton: document.querySelector("#seedButton"),
  wordForm: document.querySelector("#wordForm"),
  clearButton: document.querySelector("#clearButton"),
  termInput: document.querySelector("#termInput"),
  posInput: document.querySelector("#posInput"),
  definitionInput: document.querySelector("#definitionInput"),
  exampleInput: document.querySelector("#exampleInput"),
  memoInput: document.querySelector("#memoInput"),
  tagsInput: document.querySelector("#tagsInput"),
  photoInput: document.querySelector("#photoInput"),
  detailSheet: document.querySelector("#detailSheet"),
  sheetBackdrop: document.querySelector("#sheetBackdrop"),
  closeSheetButton: document.querySelector("#closeSheetButton"),
  detailTitle: document.querySelector("#detailTitle"),
  detailPhoto: document.querySelector("#detailPhoto"),
  detailForm: document.querySelector("#detailForm"),
  detailTermInput: document.querySelector("#detailTermInput"),
  detailPosInput: document.querySelector("#detailPosInput"),
  detailDefinitionInput: document.querySelector("#detailDefinitionInput"),
  detailExampleInput: document.querySelector("#detailExampleInput"),
  detailMemoInput: document.querySelector("#detailMemoInput"),
  detailTagsInput: document.querySelector("#detailTagsInput"),
  detailPhotoInput: document.querySelector("#detailPhotoInput"),
  removePhotoButton: document.querySelector("#removePhotoButton"),
  deleteWordButton: document.querySelector("#deleteWordButton"),
  detailMeta: document.querySelector("#detailMeta"),
  relationList: document.querySelector("#relationList"),
  relationForm: document.querySelector("#relationForm"),
  relationType: document.querySelector("#relationType"),
  relationTarget: document.querySelector("#relationTarget"),
  relationLabel: document.querySelector("#relationLabel"),
  toast: document.querySelector("#toast"),
};

const state = {
  words: loadWords(),
  relations: loadRelations(),
  search: "",
  view: localStorage.getItem(VIEW_KEY) || "library",
  selectedWordId: localStorage.getItem(SELECTED_KEY) || seedWords[0].id,
  activeTag: "all",
};

let syncTimer = null;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function createSeedPhoto(label, colorA, colorB) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colorA}" />
          <stop offset="100%" stop-color="${colorB}" />
        </linearGradient>
        <linearGradient id="w" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity=".18"/>
          <stop offset="100%" stop-color="#000000" stop-opacity=".08"/>
        </linearGradient>
      </defs>
      <rect width="480" height="320" fill="url(#g)" />
      <rect width="480" height="320" fill="url(#w)" />
      <circle cx="132" cy="110" r="74" fill="#ffffff" fill-opacity=".14"/>
      <circle cx="332" cy="178" r="98" fill="#ffffff" fill-opacity=".08"/>
      <text x="36" y="274" fill="#ffffff" fill-opacity=".88" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="800">${escapeXml(label)}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function loadWords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedWords);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.words) && parsed.words.length) return parsed.words;
  } catch {
    // fall through
  }
  return structuredClone(seedWords);
}

function loadRelations() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedRelations);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.relations)) return parsed.relations;
  } catch {
    // fall through
  }
  return structuredClone(seedRelations);
}

function saveState(shouldSync = true) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ words: state.words, relations: state.relations }),
  );
  localStorage.setItem(VIEW_KEY, state.view);
  localStorage.setItem(SELECTED_KEY, state.selectedWordId);
  if (shouldSync) {
    scheduleSync();
  }
}

function scheduleSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncToServer().catch(() => {
      // keep local cache as fallback
    });
  }, 250);
}

async function syncToServer() {
  await fetch(API_STATE_URL, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      words: state.words,
      relations: state.relations,
    }),
  });
}

async function hydrateFromServer() {
  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    if (
      !Array.isArray(data.words) ||
      !Array.isArray(data.relations) ||
      (data.words.length === 0 && data.relations.length === 0)
    ) {
      return false;
    }
    state.words = data.words;
    state.relations = data.relations;
    return true;
  } catch {
    return false;
  }
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function pulseButton(button) {
  if (!button) return;
  button.classList.add("is-pressed");
  window.setTimeout(() => button.classList.remove("is-pressed"), 140);
}

function getWord(id) {
  return state.words.find((word) => word.id === id);
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function matchesWord(word, term) {
  if (!term) return true;
  const haystack = [word.term, word.definition, word.example, word.memo, word.pos, ...word.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function filteredWords() {
  const term = normalize(state.search);
  const tagFilter = state.activeTag;
  return state.words.filter((word) => {
    const tagOk = tagFilter === "all" || word.tags.includes(tagFilter);
    return tagOk && matchesWord(word, term);
  });
}

function stats() {
  const wordCount = state.words.length;
  const relationCount = state.relations.length;
  const photoCount = state.words.filter((word) => word.photo).length;
  return [
    { label: "words", value: wordCount },
    { label: "relations", value: relationCount },
    { label: "photos", value: photoCount },
  ];
}

function uniqueTags() {
  const tags = new Set();
  state.words.forEach((word) => word.tags.forEach((tag) => tags.add(tag)));
  return ["all", ...Array.from(tags).sort()];
}

function relationLabel(type) {
  return relationTypes.find((item) => item.value === type)?.label || type;
}

function relationOpposite(type) {
  switch (type) {
    case "hypernym":
      return "hyponym";
    case "hyponym":
      return "hypernym";
    case "part_of":
      return "has_part";
    case "has_part":
      return "part_of";
    default:
      return type;
  }
}

function selectedWord() {
  return getWord(state.selectedWordId) || state.words[0];
}

function renderStats() {
  els.stats.innerHTML = stats()
    .map(
      (item) => `
      <div class="stat">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>`,
    )
    .join("");
}

function renderQuickFilters() {
  els.quickFilters.innerHTML = uniqueTags()
    .map(
      (tag) => `
      <button class="chip ${tag === state.activeTag ? "active" : ""}" type="button" data-tag="${tag}">
        ${tag === "all" ? "전체" : `#${tag}`}
      </button>`,
    )
    .join("");
}

function renderTabs() {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.view);
  });
}

function renderPanel() {
  if (state.view === "map") {
    renderMap();
    return;
  }
  if (state.view === "relations") {
    renderRelationsOverview();
    return;
  }
  renderLibrary();
}

function renderLibrary() {
  const words = filteredWords();
  if (!words.length) {
    els.viewPanel.innerHTML = `
      <div class="panel-empty">
        <strong>검색 결과가 없습니다.</strong>
        <span>단어, 뜻, 메모, 태그를 바꿔보세요.</span>
      </div>`;
    return;
  }

  els.viewPanel.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">Library</p>
        <h2>${words.length}개 단어</h2>
      </div>
    </div>
    <div class="word-list">
      ${words.map(renderWordCard).join("")}
    </div>`;

  els.viewPanel.querySelectorAll("[data-word-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.wordId));
  });
}

function renderWordCard(word) {
  const selected = word.id === state.selectedWordId ? "selected" : "";
  return `
    <article class="word-card ${selected}">
      <div class="word-photo">${renderPhoto(word.photo, word.term)}</div>
      <button type="button" data-word-id="${word.id}">
        <div class="word-copy">
          <strong>${escapeHtml(word.term)}</strong>
          <p>${escapeHtml(word.definition)}</p>
          <div class="word-tags">
            ${word.tags.slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </button>
    </article>`;
}

function renderPhoto(photo, fallbackLabel) {
  if (photo) return `<img src="${photo}" alt="${escapeHtml(fallbackLabel)}" />`;
  return `<div class="photo-fallback">${escapeHtml(fallbackLabel)}</div>`;
}

function renderMap() {
  const focus = selectedWord();
  const related = getRelatedWords(focus.id);
  const layout = buildMapLayout(focus, related);

  els.viewPanel.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">Map</p>
        <h2>${escapeHtml(focus.term)}</h2>
      </div>
      <div class="map-toolbar">
        <button class="ghost" type="button" data-focus-center>중심</button>
        <button class="ghost" type="button" data-reset-map>재배치</button>
      </div>
    </div>
    <div class="map-wrap">
      <div class="map-canvas" id="mapCanvas">
        <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,7 L8,3.5 z" fill="rgba(46,107,91,0.22)"></path>
            </marker>
          </defs>
          ${layout.edges.map(renderEdge).join("")}
        </svg>
        ${layout.nodes.map(renderNode).join("")}
      </div>
    </div>`;

  els.viewPanel.querySelector("[data-focus-center]")?.addEventListener("click", () => {
    state.selectedWordId = focus.id;
    renderAll();
    showToast("중심 단어를 맞췄습니다.");
  });

  els.viewPanel.querySelector("[data-reset-map]")?.addEventListener("click", () => {
    renderAll();
    showToast("맵 배치를 새로 그렸습니다.");
  });

  els.viewPanel.querySelectorAll("[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.nodeId));
  });
}

function buildMapLayout(centerWord, relatedWords) {
  const nodes = [];
  const edges = [];
  const center = { x: 500, y: 350 };
  nodes.push({ word: centerWord, x: center.x, y: center.y, center: true });

  const ringConfigs = [
    { types: ["hypernym"], radius: 205, count: 2, spread: 110 },
    { types: ["hyponym", "part_of", "has_part"], radius: 245, count: 3, spread: 150 },
    { types: ["related", "synonym", "antonym", "example"], radius: 290, count: 4, spread: 185 },
  ];

  const grouped = ringConfigs.map((ring) =>
    relatedWords.filter((item) => ring.types.includes(item.displayType)),
  );

  ringConfigs.forEach((ring, ringIndex) => {
    const items = grouped[ringIndex];
    const count = Math.min(items.length, ring.count);
    items.slice(0, count).forEach((item, index) => {
      const angle = (-90 + ((index + 1) / (count + 1)) * ring.spread) * (Math.PI / 180);
      const x = center.x + Math.cos(angle + ringIndex * 0.2) * ring.radius;
      const y = center.y + Math.sin(angle + ringIndex * 0.12) * ring.radius;
      nodes.push({ word: item.word, x, y, center: false });
      edges.push(buildEdge(center, { x, y }, item.displayType, item.relation.label));
    });
  });

  relatedWords
    .filter((item) => !["hypernym", "hyponym", "part_of", "has_part", "related", "synonym", "antonym", "example"].includes(item.displayType))
    .forEach((item, index) => {
      const angle = ((index + 1) / Math.max(relatedWords.length, 1)) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * 260;
      const y = center.y + Math.sin(angle) * 260;
      nodes.push({ word: item.word, x, y, center: false });
      edges.push(buildEdge(center, { x, y }, item.displayType, item.relation.label));
    });

  return { nodes, edges };
}

function renderNode(node) {
  return `
    <div class="node ${node.center ? "center" : ""}" style="left:${(node.x / 10).toFixed(2)}%; top:${(node.y / 7).toFixed(2)}%;">
      <button type="button" data-node-id="${node.word.id}">
        <div class="node-card">
          <div class="node-photo">${renderPhoto(node.word.photo, node.word.term)}</div>
          <div class="node-copy">
            <strong>${escapeHtml(node.word.term)}</strong>
            <span>${escapeHtml(node.word.pos || "word")}</span>
          </div>
        </div>
      </button>
    </div>`;
}

function buildEdge(from, to, type, label) {
  const typeLabel = label || relationLabel(type);
  return {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    typeLabel,
  };
}

function renderEdge(edge) {
  return `
    <line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="rgba(46,107,91,0.18)" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow)" />
    <text x="${(edge.x1 + edge.x2) / 2}" y="${(edge.y1 + edge.y2) / 2 - 8}" fill="rgba(21,24,21,0.52)" font-size="16" font-family="Inter, Arial, sans-serif">${escapeHtml(edge.typeLabel)}</text>`;
}

function getRelatedWords(wordId) {
  const direct = state.relations
    .filter((relation) => relation.fromWordId === wordId || relation.toWordId === wordId)
    .map((relation) => {
      const otherId = relation.fromWordId === wordId ? relation.toWordId : relation.fromWordId;
      const displayType =
        relation.fromWordId === wordId ? relation.type : relationOpposite(relation.type);
      return { relation, word: getWord(otherId), displayType };
    })
    .filter((item) => item.word);
  return direct;
}

function renderRelationsOverview() {
  const focus = selectedWord();
  const related = getRelatedWords(focus.id);
  els.viewPanel.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">Relations</p>
        <h2>${escapeHtml(focus.term)}</h2>
      </div>
    </div>
    <div class="relation-list">
      ${related.length ? related.map((item) => renderRelationItem(item)).join("") : `<div class="panel-empty"><strong>아직 연결된 단어가 없습니다.</strong><span>맵 탭에서 중심 단어를 골라 연결하세요.</span></div>`}
    </div>`;

  els.viewPanel.querySelectorAll("[data-go-word]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.goWord));
  });
}

function renderRelationItem(item) {
  return `
    <div class="relation-item">
      <strong>${escapeHtml(item.word.term)}</strong>
      <p>${escapeHtml(relationLabel(item.displayType))}${item.relation.label ? ` · ${escapeHtml(item.relation.label)}` : ""}</p>
      <div class="word-tags" style="margin-top:8px">
        <button class="chip" type="button" data-go-word="${item.word.id}">열기</button>
        <span class="tag">${escapeHtml(item.word.pos || "word")}</span>
      </div>
    </div>`;
}

function openDetail(wordId) {
  const word = getWord(wordId);
  if (!word) return;
  state.selectedWordId = wordId;
  saveState(false);
  els.detailTitle.textContent = word.term;
  els.detailPhoto.innerHTML = renderPhoto(word.photo, word.term);
  fillDetailForm(word);
  els.detailMeta.textContent = [word.pos, word.example, word.memo].filter(Boolean).join(" · ");

  els.relationType.innerHTML = relationTypes
    .map((relation) => `<option value="${relation.value}">${relation.label}</option>`)
    .join("");
  els.relationTarget.innerHTML = state.words
    .filter((item) => item.id !== word.id)
    .map((item) => `<option value="${item.id}">${escapeHtml(item.term)}</option>`)
    .join("");

  renderDetailRelations();
  els.detailSheet.hidden = false;
  document.body.style.overflow = "hidden";
}

function fillDetailForm(word) {
  els.detailTermInput.value = word.term || "";
  els.detailPosInput.value = word.pos || "";
  els.detailDefinitionInput.value = word.definition || "";
  els.detailExampleInput.value = word.example || "";
  els.detailMemoInput.value = word.memo || "";
  els.detailTagsInput.value = Array.isArray(word.tags) ? word.tags.join(", ") : "";
  els.detailPhotoInput.value = "";
}

function renderDetailRelations() {
  const word = selectedWord();
  const relations = getRelatedWords(word.id);
  els.relationList.innerHTML = relations.length
    ? relations
        .map(
          (item) => `
          <div class="relation-item">
            <strong>${escapeHtml(item.word.term)}</strong>
            <p>${escapeHtml(relationLabel(item.displayType))}${item.relation.label ? ` · ${escapeHtml(item.relation.label)}` : ""}</p>
            <button class="ghost" type="button" data-go-word="${item.word.id}">이 단어 열기</button>
          </div>`,
        )
        .join("")
    : `<div class="panel-empty"><strong>연결이 없습니다.</strong><span>아래에서 관계를 추가하세요.</span></div>`;

  els.relationList.querySelectorAll("[data-go-word]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.goWord));
  });
}

function updateWordFromDetailForm() {
  const word = getWord(state.selectedWordId);
  if (!word) return;

  word.term = els.detailTermInput.value.trim();
  word.pos = els.detailPosInput.value.trim();
  word.definition = els.detailDefinitionInput.value.trim();
  word.example = els.detailExampleInput.value.trim();
  word.memo = els.detailMemoInput.value.trim();
  word.tags = els.detailTagsInput.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  saveState();
  renderAll();
  els.detailTitle.textContent = word.term || "단어";
  els.detailMeta.textContent = [word.pos, word.example, word.memo].filter(Boolean).join(" · ");
  showToast("단어를 수정했습니다.");
}

async function replaceDetailPhoto(file) {
  const word = getWord(state.selectedWordId);
  if (!word || !file) return;
  word.photo = await fileToDataUrl(file);
  saveState();
  els.detailPhoto.innerHTML = renderPhoto(word.photo, word.term);
  renderPanel();
  showToast("사진을 교체했습니다.");
}

function removeDetailPhoto() {
  const word = getWord(state.selectedWordId);
  if (!word) return;
  word.photo = "";
  saveState();
  els.detailPhoto.innerHTML = renderPhoto("", word.term);
  renderPanel();
  showToast("사진을 제거했습니다.");
}

function deleteSelectedWord() {
  const wordId = state.selectedWordId;
  const index = state.words.findIndex((word) => word.id === wordId);
  if (index === -1) return;
  const nextWord = state.words[index + 1] || state.words[index - 1] || state.words[0];
  state.words = state.words.filter((word) => word.id !== wordId);
  state.relations = state.relations.filter(
    (relation) => relation.fromWordId !== wordId && relation.toWordId !== wordId,
  );
  state.selectedWordId = nextWord?.id || state.words[0]?.id || "";
  saveState();
  renderAll();
  if (state.selectedWordId) {
    openDetail(state.selectedWordId);
  } else {
    closeDetailSheet();
  }
  showToast("단어를 삭제했습니다.");
}

function closeDetailSheet() {
  els.detailSheet.hidden = true;
  document.body.style.overflow = "";
}

function renderAll() {
  renderStats();
  renderQuickFilters();
  renderTabs();
  renderPanel();
  saveState(false);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resetComposer() {
  els.wordForm.reset();
}

function setSeedData() {
  state.words = structuredClone(seedWords);
  state.relations = structuredClone(seedRelations);
  state.selectedWordId = seedWords[0].id;
  state.activeTag = "all";
  state.search = "";
  els.searchInput.value = "";
  renderAll();
  showToast("샘플 데이터를 복원했습니다.");
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    pulseButton(tab);
    renderAll();
  });
});

els.quickFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  pulseButton(button);
  state.activeTag = button.dataset.tag;
  renderAll();
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderPanel();
});

els.exportButton.addEventListener("click", () => {
  pulseButton(els.exportButton);
  const blob = new Blob([JSON.stringify({ words: state.words, relations: state.relations }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vocab-map-export.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("JSON을 내보냈습니다.");
});

els.seedButton.addEventListener("click", setSeedData);

els.clearButton.addEventListener("click", () => {
  resetComposer();
  showToast("입력값을 지웠습니다.");
});

els.closeSheetButton.addEventListener("click", closeDetailSheet);
els.sheetBackdrop.addEventListener("click", closeDetailSheet);

els.detailForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateWordFromDetailForm();
});

els.detailPhotoInput.addEventListener("change", async () => {
  const file = els.detailPhotoInput.files?.[0];
  if (file) {
    await replaceDetailPhoto(file);
  }
});

els.removePhotoButton.addEventListener("click", () => {
  removeDetailPhoto();
});

els.deleteWordButton.addEventListener("click", () => {
  const word = selectedWord();
  if (!word) return;
  const confirmDelete = window.confirm(`"${word.term}" 단어를 삭제할까요?`);
  if (confirmDelete) deleteSelectedWord();
});

els.wordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const term = els.termInput.value.trim();
  const pos = els.posInput.value.trim();
  const definition = els.definitionInput.value.trim();
  const example = els.exampleInput.value.trim();
  const memo = els.memoInput.value.trim();
  const tags = els.tagsInput.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const photoFile = els.photoInput.files?.[0];
  const photo = photoFile ? await fileToDataUrl(photoFile) : "";

  if (!term || !definition) return;

  const word = {
    id: `word-${crypto.randomUUID()}`,
    term,
    pos,
    definition,
    example,
    memo,
    tags,
    photo,
  };

  state.words.unshift(word);
  state.selectedWordId = word.id;
  saveState();
  resetComposer();
  renderAll();
  openDetail(word.id);
  showToast("단어를 저장했습니다.");
});

els.relationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const fromWordId = state.selectedWordId;
  const toWordId = els.relationTarget.value;
  const type = els.relationType.value;
  const label = els.relationLabel.value.trim();

  if (!toWordId) return;

  state.relations.unshift({
    id: `rel-${crypto.randomUUID()}`,
    fromWordId,
    toWordId,
    type,
    label,
  });

  els.relationLabel.value = "";
  saveState();
  renderDetailRelations();
  renderAll();
  showToast("관계를 연결했습니다.");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.detailSheet.hidden) {
    closeDetailSheet();
  }
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 },
  );

  document.querySelectorAll("[data-reveal]").forEach((item) => observer.observe(item));
} else {
  document.querySelectorAll("[data-reveal]").forEach((item) => item.classList.add("is-visible"));
}

async function bootstrap() {
  const hydrated = await hydrateFromServer();
  if (!hydrated) {
    saveState();
  }
  renderAll();
  openDetail(state.selectedWordId);
}

bootstrap();
