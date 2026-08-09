import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAssignmentTables1788432000000 implements MigrationInterface {
  name = 'CreateAssignmentTables1788432000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "submission_type" AS ENUM ('TEXT', 'FILE', 'TEXT_OR_FILE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "submission_status" AS ENUM ('SUBMITTED', 'GRADED', 'RETURNED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "lesson_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "instructions" text NOT NULL,
        "submission_type" "submission_type" NOT NULL DEFAULT 'TEXT_OR_FILE',
        "max_points" int NOT NULL DEFAULT 100,
        "passing_points" int NOT NULL DEFAULT 60,
        "rubric" jsonb NOT NULL DEFAULT '[]',
        "allow_resubmission" boolean NOT NULL DEFAULT true,
        "max_submissions" int NOT NULL DEFAULT 3,
        CONSTRAINT "pk_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_assignments_lesson" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_assignments_points" CHECK ("passing_points" <= "max_points")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "assignments_lesson_id_unique" ON "assignments" ("lesson_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "assignments_course_id_idx" ON "assignments" ("course_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "assignment_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "enrollment_id" uuid NOT NULL,
        "attempt_number" int NOT NULL,
        "text" text,
        "file_key" varchar(512),
        "file_url" varchar(2048),
        "status" "submission_status" NOT NULL DEFAULT 'SUBMITTED',
        "score" int,
        "rubric_scores" jsonb NOT NULL DEFAULT '[]',
        "feedback" text,
        "graded_by_id" uuid,
        "graded_at" timestamptz,
        "submitted_at" timestamptz NOT NULL,
        CONSTRAINT "pk_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_submissions_assignment" FOREIGN KEY ("assignment_id")
          REFERENCES "assignments" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_submissions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "submissions_assignment_user_idx" ON "submissions" ("assignment_id", "user_id")`,
    );
    await queryRunner.query(`CREATE INDEX "submissions_user_id_idx" ON "submissions" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "submissions_status_idx" ON "submissions" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "submissions"`);
    await queryRunner.query(`DROP TABLE "assignments"`);
    await queryRunner.query(`DROP TYPE "submission_status"`);
    await queryRunner.query(`DROP TYPE "submission_type"`);
  }
}
