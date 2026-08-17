import type { Word } from "../types";

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export function isDue(card: Word) {
  if (!card.reviewDueAt) return true;
  const dueAt = new Date(card.reviewDueAt).getTime();
  return !Number.isFinite(dueAt) || dueAt <= Date.now();
}

export function cardSubject(card: Word) {
  return card.pos || card.tags[0] || "Other";
}

export function cardChapter(card: Word) {
  return card.example || "Core Concepts";
}

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s\u200b.,!?()[\]{}:;/%]+/g, "")
    .trim();
}

export function answerMatches(input: string, answer: string) {
  const normalized = normalizeAnswer(input);
  return answer.split(/[|/]/).some((item) => normalizeAnswer(item) === normalized);
}

export function nextDue(level: number, grade: ReviewGrade) {
  const intervals = [1, 2, 4, 7, 14, 30, 60, 90];
  const index = Math.min(
    level + (grade === "easy" ? 2 : grade === "good" ? 1 : 0),
    intervals.length - 1,
  );
  const days =
    grade === "again"
      ? 1
      : grade === "hard"
        ? Math.max(1, intervals[Math.min(level, 7)] / 2)
        : intervals[index];
  return new Date(Date.now() + days * 86400000).toISOString();
}
