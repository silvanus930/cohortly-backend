import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateQuizTables1788430000000 implements MigrationInterface {
  name = 'CreateQuizTables1788430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "quizzes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "lesson_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "questions" jsonb NOT NULL,
        "passing_score" int NOT NULL DEFAULT 70,
        "max_attempts" int NOT NULL DEFAULT 3,
        "time_limit_minutes" int,
        "shuffle_questions" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_quizzes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_quizzes_lesson" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_quizzes_passing_score" CHECK ("passing_score" BETWEEN 0 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "quizzes_lesson_id_unique" ON "quizzes" ("lesson_id")`,
    );
    await queryRunner.query(`CREATE INDEX "quizzes_course_id_idx" ON "quizzes" ("course_id")`);
    await queryRunner.query(`
      CREATE TABLE "quiz_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "quiz_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "enrollment_id" uuid NOT NULL,
        "attempt_number" int NOT NULL,
        "answers" jsonb NOT NULL,
        "points_earned" int NOT NULL,
        "points_total" int NOT NULL,
        "score_percent" int NOT NULL,
        "passed" boolean NOT NULL,
        "submitted_at" timestamptz NOT NULL,
        CONSTRAINT "pk_quiz_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_quiz_attempts_quiz" FOREIGN KEY ("quiz_id")
          REFERENCES "quizzes" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_quiz_attempts_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "quiz_attempts_quiz_user_idx" ON "quiz_attempts" ("quiz_id", "user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "quiz_attempts"`);
    await queryRunner.query(`DROP TABLE "quizzes"`);
  }
}
