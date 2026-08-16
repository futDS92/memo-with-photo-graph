export type Word = {
  id: string;
  term: string;
  pos?: string;
  definition: string;
  example?: string;
  memo?: string;
  tags: string[];
  photo?: string;
  reviewDueAt?: string;
  reviewLevel?: number;
  lastReviewedAt?: string;
  correctCount?: number;
  incorrectCount?: number;
  isBookmarked?: boolean;
  cardType?: "concept" | "definition" | "formula" | "case" | "multiple-choice" | "cloze";
  choices?: string[];
};

export type RelationType =
  | "hypernym"
  | "hyponym"
  | "part_of"
  | "has_part"
  | "synonym"
  | "antonym"
  | "related"
  | "example";

export type Relation = {
  id: string;
  fromWordId: string;
  toWordId: string;
  type: RelationType;
  label?: string;
};

export type AppState = {
  words: Word[];
  relations: Relation[];
  updatedAt: string;
  schemaVersion?: number;
};

export const relationTypes: Array<{ value: RelationType; label: string }> = [
  { value: "hypernym", label: "Hypernym" },
  { value: "hyponym", label: "Hyponym" },
  { value: "part_of", label: "Part of" },
  { value: "has_part", label: "Has part" },
  { value: "synonym", label: "Synonym" },
  { value: "antonym", label: "Antonym" },
  { value: "related", label: "Related" },
  { value: "example", label: "Example" },
];

export const storageKeys = {
  state: "memo-with-photo-graph.ait.state",
  view: "memo-with-photo-graph.ait.view",
  selectedWordId: "memo-with-photo-graph.ait.selectedWordId",
  activeTag: "memo-with-photo-graph.ait.activeTag",
} as const;

export function relationOpposite(type: RelationType): RelationType {
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

export function relationLabel(type: RelationType): string {
  return relationTypes.find((item) => item.value === type)?.label || type;
}
