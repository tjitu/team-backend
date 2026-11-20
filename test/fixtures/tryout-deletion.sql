CREATE TABLE public."TryOut" ("id" text PRIMARY KEY, "title" text NOT NULL);
CREATE TABLE public."Subtest" (
  "id" text PRIMARY KEY,
  "try_out_id" text NOT NULL REFERENCES public."TryOut"("id") ON DELETE CASCADE
);
CREATE TABLE public."Question" (
  "id" text PRIMARY KEY,
  "tryoutId" text,
  "subtest_id" text REFERENCES public."Subtest"("id") ON DELETE RESTRICT,
  "status" text,
  "target" text,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."QuestionItem" (
  "id" text PRIMARY KEY,
  "question_id" text REFERENCES public."Question"("id") ON DELETE RESTRICT
);
CREATE TABLE public."TryOutAttempt" (
  "id" text PRIMARY KEY,
  "try_out_id" text REFERENCES public."TryOut"("id") ON DELETE RESTRICT
);
CREATE TABLE public."UserAnswer" (
  "id" text PRIMARY KEY,
  "question_id" text REFERENCES public."Question"("id") ON DELETE RESTRICT,
  "tryout_attempt_id" text REFERENCES public."TryOutAttempt"("id") ON DELETE RESTRICT
);
CREATE TABLE public."TryOutSubtestScore" (
  "id" text PRIMARY KEY,
  "tryout_attempt_id" text REFERENCES public."TryOutAttempt"("id") ON DELETE CASCADE,
  "subtest_id" text REFERENCES public."Subtest"("id") ON DELETE CASCADE
);
CREATE TABLE public."UnlockedSolution" (
  "id" text PRIMARY KEY,
  "tryOutId" text REFERENCES public."TryOut"("id") ON DELETE RESTRICT
);
CREATE TABLE public."QcSandboxPreviewSession" ("token_hash" text PRIMARY KEY, "tryout_id" text);
CREATE TABLE public."PracticeAssignment" (
  "id" text PRIMARY KEY,
  "question_id" text REFERENCES public."Question"("id") ON DELETE CASCADE
);
CREATE TABLE public."PracticeAttempt" (
  "id" text PRIMARY KEY,
  "question_id" text REFERENCES public."Question"("id") ON DELETE CASCADE
);

INSERT INTO public."TryOut" VALUES ('target', 'Delete me'), ('other', 'Keep me'), ('empty', 'Empty');
INSERT INTO public."Subtest" VALUES ('target-sub', 'target'), ('other-sub', 'other');
INSERT INTO public."Question" ("id", "tryoutId", "subtest_id", "status", "target") VALUES
  ('ready', 'target', 'target-sub', 'READY', 'FOR_TRYOUT'),
  ('sandbox', NULL, 'target-sub', 'QC_SANDBOX', 'FOR_TRYOUT'),
  ('draft', 'target', NULL, 'DRAFT', 'FOR_TRYOUT'),
  ('other-question', 'other', 'other-sub', 'READY', 'FOR_TRYOUT'),
  ('practice', NULL, NULL, 'READY', 'FOR_PRACTICE');
INSERT INTO public."QuestionItem" VALUES ('option', 'ready');
INSERT INTO public."TryOutAttempt" VALUES ('target-attempt', 'target'), ('other-attempt', 'other');
INSERT INTO public."UserAnswer" VALUES
  ('target-answer', 'ready', 'target-attempt'), ('other-answer', 'other-question', 'other-attempt');
INSERT INTO public."TryOutSubtestScore" VALUES
  ('target-score', 'target-attempt', 'target-sub'), ('other-score', 'other-attempt', 'other-sub');
INSERT INTO public."UnlockedSolution" VALUES ('target-unlock', 'target'), ('other-unlock', 'other');
INSERT INTO public."QcSandboxPreviewSession" VALUES ('target-session', 'target'), ('other-session', 'other');
INSERT INTO public."PracticeAssignment" VALUES ('practice-assignment', 'practice');
INSERT INTO public."PracticeAttempt" VALUES ('practice-attempt', 'practice');
