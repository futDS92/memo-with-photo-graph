import type { AppState, Relation, Word } from "../types";

function card(id: string, term: string, definition: string, subject: string, chapter: string, cardType: Word["cardType"] = "concept", tags: string[] = []): Word {
  return {
    id,
    term,
    definition,
    pos: subject,
    example: chapter,
    memo: "핵심 키워드를 떠올린 뒤 정답을 확인하세요.",
    tags: [subject, chapter, ...tags],
    cardType,
    reviewLevel: 0,
    correctCount: 0,
    incorrectCount: 0,
  };
}

export const seedWords: Word[] = [
  card("card-1", "지도학습과 비지도학습의 차이는?", "지도학습은 정답이 있는 학습 데이터로 입력과 목표값의 관계를 학습하고, 비지도학습은 정답 없이 데이터의 구조나 패턴을 찾는다.", "머신러닝", "머신러닝 기초", "concept", ["기초"]),
  card("card-2", "정밀도(Precision)의 공식은?", "정밀도 = TP / (TP + FP). 모델이 양성이라고 예측한 것 중 실제 양성의 비율이다.", "통계", "평가 지표", "formula", ["계산"]),
  card("card-3", "재현율(Recall)의 공식은?", "재현율 = TP / (TP + FN). 실제 양성 중 모델이 양성으로 찾아낸 비율이다.", "통계", "평가 지표", "formula", ["계산"]),
  card("card-4", "결측치 처리 방법 3가지를 말해보자.", "삭제, 대표값 대체(평균·중앙값·최빈값), 예측 모델을 이용한 대체 등이 있다.", "데이터 전처리", "데이터 정제", "case", ["전처리"]),
  card("card-5", "정규화가 필요한 이유는?", "서로 다른 단위와 범위의 변수를 일정한 범위로 조정해 거리 기반 알고리즘과 경사하강법의 학습을 안정화하기 위해서다.", "데이터 전처리", "스케일링", "concept", ["전처리"]),
  card("card-6", "3정규형(3NF)의 핵심 조건은?", "제2정규형을 만족하면서 기본키가 아닌 모든 속성이 기본키에 이행적으로 종속되지 않아야 한다.", "데이터베이스", "데이터 모델링", "concept", ["정규화"]),
  card("card-7", "표준편차가 작다는 것은 무엇을 의미하는가?", "관측값들이 평균 주변에 모여 있어 데이터의 산포가 작다는 의미다.", "통계", "기술통계", "concept", ["기초"]),
  card("card-8", "과적합(Overfitting)이란?", "훈련 데이터의 잡음까지 지나치게 학습해 훈련 성능은 높지만 새로운 데이터의 일반화 성능이 낮아지는 현상이다.", "머신러닝", "모델 평가", "concept", ["모델링"]),
];

export const seedRelations: Relation[] = [];

export const seedState: AppState = {
  words: seedWords,
  relations: seedRelations,
  updatedAt: new Date().toISOString(),
  schemaVersion: 2,
};
