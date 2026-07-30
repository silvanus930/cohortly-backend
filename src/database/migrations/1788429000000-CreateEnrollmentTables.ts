import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateEnrollmentTables1788429000000 implements MigrationInterface {
  name = 'CreateEnrollmentTables1788429000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "enrollment_source" AS ENUM ('FREE', 'PAID', 'SEAT')`);
    await queryRunner.query(
      `CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "lesson_progress_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "enrollments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "cohort_id" uuid,
        "source" "enrollment_source" NOT NULL,
        "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
        "purchase_id" uuid,
        "seat_assignment_id" uuid,
        "progress_percent" int NOT NULL DEFAULT 0,
        "completed_lessons" int NOT NULL DEFAULT 0,
        "total_lessons" int NOT NULL DEFAULT 0,
        "last_activity_at" timestamptz,
        "completed_at" timestamptz,
        "cancelled_at" timestamptz,
        CONSTRAINT "pk_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_enrollments_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_enrollments_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_enrollments_cohort" FOREIGN KEY ("cohort_id")
          REFERENCES "cohorts" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "enrollments_user_course_unique" ON "enrollments" ("user_id", "course_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "enrollments_course_id_idx" ON "enrollments" ("course_id")`,
    );
    await queryRunner.query(`CREATE INDEX "enrollments_status_idx" ON "enrollments" ("status")`);
    await queryRunner.query(`
      CREATE TABLE "lesson_progress" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "enrollment_id" uuid NOT NULL,
        "lesson_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "status" "lesson_progress_status" NOT NULL DEFAULT 'NOT_STARTED',
        "position_seconds" int NOT NULL DEFAULT 0,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        CONSTRAINT "pk_lesson_progress" PRIMARY KEY ("id"),
        CONSTRAINT "fk_lesson_progress_enrollment" FOREIGN KEY ("enrollment_id")
          REFERENCES "enrollments" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_lesson_progress_lesson" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "lesson_progress_enrollment_lesson_unique" ON "lesson_progress" ("enrollment_id", "lesson_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress" ("lesson_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "lesson_progress_user_id_idx" ON "lesson_progress" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "learning_activity_days" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "activity_date" date NOT NULL,
        "lessons_completed" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_learning_activity_days" PRIMARY KEY ("id"),
        CONSTRAINT "fk_learning_activity_days_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "learning_activity_days_user_day_unique" ON "learning_activity_days" ("user_id", "activity_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "learning_activity_days"`);
    await queryRunner.query(`DROP TABLE "lesson_progress"`);
    await queryRunner.query(`DROP TABLE "enrollments"`);
    await queryRunner.query(`DROP TYPE "lesson_progress_status"`);
    await queryRunner.query(`DROP TYPE "enrollment_status"`);
    await queryRunner.query(`DROP TYPE "enrollment_source"`);
  }
}
