import type { AppState, Relation, Word } from "../types";

function card(id: string, term: string, definition: string, subject: string, chapter: string, cardType: Word["cardType"] = "concept", tags: string[] = []): Word {
  return {
    id,
    term,
    definition,
    pos: subject,
    example: chapter,
    memo: "답을 보기 전에 핵심을 먼저 떠올려 보세요.",
    tags: [subject, chapter, ...tags],
    cardType,
    reviewLevel: 0,
    correctCount: 0,
    incorrectCount: 0,
  };
}

export const seedWords: Word[] = [
  card("card-1", "지도학습과 비지도학습의 차이는?", "지도학습은 입력과 정답의 관계를 학습합니다. 비지도학습은 정답 없이 데이터의 구조와 패턴을 찾습니다.", "머신러닝", "기초", "concept", ["기초"]),
  card("card-2", "정밀도(Precision) 공식은?", "정밀도 = TP / (TP + FP). 양성으로 예측한 것 중 실제 양성의 비율입니다.", "통계", "평가지표", "formula", ["계산"]),
  card("card-3", "재현율(Recall) 공식은?", "재현율 = TP / (TP + FN). 실제 양성 중 올바르게 찾은 비율입니다.", "통계", "평가지표", "formula", ["계산"]),
  card("card-4", "결측값을 처리하는 방법 3가지는?", "삭제, 평균·중앙값 등을 이용한 대치, 모델 기반 대치가 대표적인 방법입니다.", "전처리", "데이터 정제", "case", ["전처리"]),
  card("card-5", "특성 스케일링이 필요한 이유는?", "변수의 범위를 맞춰 거리 기반 알고리즘과 경사하강법의 안정성을 높이기 위해서입니다.", "전처리", "스케일링", "concept", ["전처리"]),
  card("card-6", "제3정규형(3NF)의 조건은?", "제2정규형을 만족하고, 기본키가 아닌 속성이 기본키에 이행적으로 종속되지 않아야 합니다.", "데이터베이스", "데이터 모델링", "concept", ["정규화"]),
  card("card-7", "표준편차가 작다는 의미는?", "관측값이 평균 근처에 모여 있어 데이터의 산포가 작다는 뜻입니다.", "통계", "기술통계", "concept", ["기초"]),
  card("card-8", "과적합(Overfitting)이란?", "학습 데이터의 잡음까지 외워 학습 성능은 높지만 새로운 데이터의 일반화 성능이 낮은 상태입니다.", "머신러닝", "모델 평가", "concept", ["모델링"]),
];

export const seedRelations: Relation[] = [];

export const seedState: AppState = {
  words: seedWords,
  relations: seedRelations,
  updatedAt: new Date().toISOString(),
  schemaVersion: 2,
};
