import type { AppState, Relation, Word } from "../types";

function escapeXml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createSeedPhoto(label: string, colorA: string, colorB: string): string {
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

export const seedWords: Word[] = [
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

export const seedRelations: Relation[] = [
  {
    id: "rel-1",
    fromWordId: "word-orchard",
    toWordId: "word-tree",
    type: "hyponym",
    label: "contains",
  },
  {
    id: "rel-2",
    fromWordId: "word-grove",
    toWordId: "word-tree",
    type: "hyponym",
    label: "made of",
  },
  {
    id: "rel-3",
    fromWordId: "word-orchard",
    toWordId: "word-farm",
    type: "part_of",
    label: "can belong to",
  },
  {
    id: "rel-4",
    fromWordId: "word-orchard",
    toWordId: "word-bloom",
    type: "related",
    label: "seasonal image",
  },
  {
    id: "rel-5",
    fromWordId: "word-grove",
    toWordId: "word-bloom",
    type: "related",
    label: "forest feeling",
  },
];

export const seedState: AppState = {
  words: seedWords,
  relations: seedRelations,
  updatedAt: new Date().toISOString(),
};
