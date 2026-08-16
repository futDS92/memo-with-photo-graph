import type { Relation, RelationType, Word } from "../types";
import { relationOpposite } from "../types";

type LayoutNode = {
  word: Word;
  x: number;
  y: number;
  center: boolean;
};

type LayoutEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
};

type RelatedWord = {
  relation: Relation;
  word: Word;
  displayType: RelationType;
};

export function getRelatedWords(
  words: Word[],
  relations: Relation[],
  wordId: string,
): RelatedWord[] {
  const byId = new Map(words.map((word) => [word.id, word]));
  return relations
    .filter((relation) => relation.fromWordId === wordId || relation.toWordId === wordId)
    .map((relation) => {
      const otherId = relation.fromWordId === wordId ? relation.toWordId : relation.fromWordId;
      const displayType =
        relation.fromWordId === wordId ? relation.type : relationOpposite(relation.type);
      const word = byId.get(otherId);
      if (!word) return null;
      return { relation, word, displayType };
    })
    .filter((item): item is RelatedWord => Boolean(item));
}

export function buildMapLayout(centerWord: Word, relatedWords: RelatedWord[]) {
  const center = { x: 500, y: 350 };
  const nodes: LayoutNode[] = [{ word: centerWord, x: center.x, y: center.y, center: true }];
  const edges: LayoutEdge[] = [];

  const ringConfigs = [
    { types: ["hypernym"], radius: 205, spread: 240 },
    { types: ["hyponym", "part_of", "has_part"], radius: 265, spread: 280 },
    { types: ["related", "synonym", "antonym", "example"], radius: 325, spread: 320 },
  ] as const;

  const grouped = ringConfigs.map((ring) =>
    relatedWords.filter((item) => ring.types.includes(item.displayType)),
  );

  ringConfigs.forEach((ring, ringIndex) => {
    const items = grouped[ringIndex];
    const count = items.length;
    items.forEach((item, index) => {
      const position = count === 1 ? 0.5 : index / (count - 1);
      const angle = (-90 - ring.spread / 2 + position * ring.spread) * (Math.PI / 180);
      const x = center.x + Math.cos(angle + ringIndex * 0.2) * ring.radius;
      const y = center.y + Math.sin(angle + ringIndex * 0.12) * ring.radius;
      nodes.push({ word: item.word, x, y, center: false });
      edges.push({
        x1: center.x,
        y1: center.y,
        x2: x,
        y2: y,
        label: item.relation.label || item.displayType,
      });
    });
  });

  relatedWords
    .filter(
      (item) =>
        ![
          "hypernym",
          "hyponym",
          "part_of",
          "has_part",
          "related",
          "synonym",
          "antonym",
          "example",
        ].includes(item.displayType),
    )
    .forEach((item, index) => {
      const angle = ((index + 1) / Math.max(relatedWords.length, 1)) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * 260;
      const y = center.y + Math.sin(angle) * 260;
      nodes.push({ word: item.word, x, y, center: false });
      edges.push({
        x1: center.x,
        y1: center.y,
        x2: x,
        y2: y,
        label: item.relation.label || item.displayType,
      });
    });

  return { nodes, edges };
}
