import { defaultProject, seedState } from "../data/seed";
import type { AppState } from "../types";

export function localizeSeedCards(state: AppState): AppState {
  const seedById = new Map(seedState.words.map((card) => [card.id, card]));
  return {
    ...state,
    words: state.words.map((card) => {
      const seed = seedById.get(card.id);
      return seed
        ? {
            ...card,
            term: seed.term,
            definition: seed.definition,
            pos: seed.pos,
            example: seed.example,
            memo: seed.memo,
            tags: seed.tags,
            cardType: seed.cardType,
          }
        : card;
    }),
  };
}

export function normalizeWorkspace(state: AppState): AppState {
  const projects = state.projects?.length ? state.projects : [defaultProject];
  const fallbackProjectId = projects[0].id;
  const projectIds = new Set(projects.map((project) => project.id));
  return {
    ...state,
    projects,
    words: state.words.map((word) => ({
      ...word,
      projectId:
        word.projectId && projectIds.has(word.projectId) ? word.projectId : fallbackProjectId,
    })),
    reviewLog: Array.isArray(state.reviewLog)
      ? state.reviewLog.filter((event) =>
          projectIds.has(
            state.words.find((word) => word.id === event.cardId)?.projectId || fallbackProjectId,
          ),
        )
      : [],
    schemaVersion: 2,
  };
}
