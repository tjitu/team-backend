import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CreateQuestionOptionDto } from './control-center.dto';

export function insertQuestionOptions(questionId: string, options: CreateQuestionOptionDto[]) {
  const values = options.filter(option => option.content || option.isCorrect).map(option =>
    Prisma.sql`(${randomUUID()}, ${questionId}, ${option.content}, ${Boolean(option.isCorrect)}, ${option.order})`,
  );
  if (!values.length) return null;
  return Prisma.sql`
    INSERT INTO public."QuestionItem" ("id", "question_id", "content", "is_correct", "order")
    VALUES ${Prisma.join(values)}
  `;
}

export function selectQuestionRows(where: Prisma.Sql) {
  return Prisma.sql`
      WITH selected_questions AS MATERIALIZED (
        SELECT q.* FROM public."Question" q
        ${where}
        ORDER BY q."createdAt" DESC
        LIMIT 1000
      ), attempt_counts AS (
        SELECT question_id, SUM(attempts)::int AS total FROM (
          SELECT ua."question_id", COUNT(*)::int AS attempts
          FROM public."UserAnswer" ua JOIN selected_questions sq ON sq."id" = ua."question_id"
          GROUP BY ua."question_id"
          UNION ALL
          SELECT dql."questionId", COUNT(*)::int
          FROM public."DailyQuestionLog" dql JOIN selected_questions sq ON sq."id" = dql."questionId"
          GROUP BY dql."questionId"
          UNION ALL
          SELECT pat."question_id", COUNT(*)::int
          FROM public."PracticeAttempt" pat JOIN selected_questions sq ON sq."id" = pat."question_id"
          GROUP BY pat."question_id"
        ) counts GROUP BY question_id
      ), question_options AS (
        SELECT opt."question_id", json_agg(
          json_build_object('id', opt."id", 'content', opt."content", 'isCorrect', opt."is_correct", 'order', opt."order")
          ORDER BY opt."order" ASC
        ) AS options
        FROM public."QuestionItem" opt
        JOIN selected_questions sq ON sq."id" = opt."question_id"
        GROUP BY opt."question_id"
      )
      SELECT
        q."id", q."subtest", q."topic_id" AS "topicId", q."subtopic_id" AS "subtopicId", q."pattern", q."batch", q."difficulty", q."type",
        q."target", COALESCE(q."status", 'DRAFT') AS "status",
        q."revision_notes" AS "revisionNotes", q."reviewed_by" AS "reviewedBy", q."reviewed_at" AS "reviewedAt",
        COALESCE(q."tryoutId", sub."try_out_id") AS "tryoutId",
        q."package_id" AS "packageId",
        q."narration", q."content", q."imageUrl", q."points",
        q."correct_answer_short_answer" AS "correctAnswer",
        q."createdAt", q."updatedAt",
        s."title" AS "subtopicTitle",
        COALESCE(t."title", t_direct."title") AS "topicTitle",
        COALESCE(tout."title", sub_tout."title") AS "tryoutTitle",
        COALESCE(tout."code", sub_tout."code") AS "tryoutCode",
        COALESCE(tout."status"::text, sub_tout."status"::text) AS "tryoutStatus",
        (COALESCE(tout."status"::text, sub_tout."status"::text) IN ('NOT_STARTED', 'IN_PROGRESS')) AS "isLockedInTryout",
        EXISTS(SELECT 1 FROM public."PracticeAssignment" pa WHERE pa."question_id" = q."id") AS "isPracticeAssigned",
        COALESCE(ac.total, 0) AS "attemptCount",
        pkg."title" AS "packageTitle",
        qo.options AS "options",
        (
          SELECT json_build_object(
            'id', sol."id", 'steps', sol."steps", 'staticContent', sol."staticContent",
            'quickTrick', sol."quickTrick", 'keyFormula', sol."keyFormula", 'defaultView', sol."defaultView"
          )
          FROM public."QuestionSolution" sol
          WHERE sol."questionId" = q."id"
        ) AS "solution"
      FROM selected_questions q
      LEFT JOIN attempt_counts ac ON ac.question_id = q."id"
      LEFT JOIN question_options qo ON qo.question_id = q."id"
      LEFT JOIN public."Subtopic" s ON s."id" = q."subtopic_id"
      LEFT JOIN public."Topic" t ON t."id" = s."topicId"
      LEFT JOIN public."Topic" t_direct ON t_direct."id" = q."topic_id"
      LEFT JOIN public."Subtest" sub ON sub."id" = q."subtest_id"
      LEFT JOIN public."TryOut" tout ON tout."id" = q."tryoutId"
      LEFT JOIN public."TryOut" sub_tout ON sub_tout."id" = sub."try_out_id"
      LEFT JOIN public."soal_asli_packages" pkg ON pkg."id" = q."package_id"
      ORDER BY q."createdAt" DESC
    `;
}
