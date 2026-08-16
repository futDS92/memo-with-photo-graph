import type { AppState, Relation, Word } from "../types";

function card(id: string, term: string, definition: string, subject: string, chapter: string, cardType: Word["cardType"] = "concept", tags: string[] = []): Word {
  return {
    id,
    term,
    definition,
    pos: subject,
    example: chapter,
    memo: "Recall the key idea before revealing the answer.",
    tags: [subject, chapter, ...tags],
    cardType,
    reviewLevel: 0,
    correctCount: 0,
    incorrectCount: 0,
  };
}

export const seedWords: Word[] = [
  card("card-1", "What is the difference between supervised and unsupervised learning?", "Supervised learning learns the relationship between inputs and labeled targets. Unsupervised learning finds structure or patterns without labeled answers.", "Machine Learning", "ML Fundamentals", "concept", ["fundamentals"]),
  card("card-2", "What is the formula for precision?", "Precision = TP / (TP + FP). It is the proportion of predicted positives that are actually positive.", "Statistics", "Evaluation Metrics", "formula", ["calculation"]),
  card("card-3", "What is the formula for recall?", "Recall = TP / (TP + FN). It is the proportion of actual positives correctly identified by the model.", "Statistics", "Evaluation Metrics", "formula", ["calculation"]),
  card("card-4", "Name three ways to handle missing values.", "Deletion, imputation with a representative value such as mean or median, and model-based imputation are common approaches.", "Data Preprocessing", "Data Cleaning", "case", ["preprocessing"]),
  card("card-5", "Why is feature scaling necessary?", "Scaling puts variables on comparable ranges, improving the stability of distance-based algorithms and gradient descent.", "Data Preprocessing", "Feature Scaling", "concept", ["preprocessing"]),
  card("card-6", "What is the key condition of Third Normal Form (3NF)?", "A relation must satisfy 2NF and no non-key attribute may depend transitively on the primary key.", "Database", "Data Modeling", "concept", ["normalization"]),
  card("card-7", "What does a small standard deviation mean?", "The observations are clustered close to the mean, which means the data has low dispersion.", "Statistics", "Descriptive Statistics", "concept", ["fundamentals"]),
  card("card-8", "What is overfitting?", "Overfitting occurs when a model learns noise in the training data, achieving high training performance but poor generalization.", "Machine Learning", "Model Evaluation", "concept", ["modeling"]),
];

export const seedRelations: Relation[] = [];

export const seedState: AppState = {
  words: seedWords,
  relations: seedRelations,
  updatedAt: new Date().toISOString(),
  schemaVersion: 2,
};
