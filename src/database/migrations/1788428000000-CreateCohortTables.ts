import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCohortTables1788428000000 implements MigrationInterface {
  name = 'CreateCohortTables1788428000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "cohort_status" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "cohort_member_status" AS ENUM ('ENROLLED', 'WAITLISTED', 'DROPPED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "cohorts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "course_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "timezone" varchar(64) NOT NULL DEFAULT 'UTC',
        "capacity" int NOT NULL,
        "status" "cohort_status" NOT NULL DEFAULT 'SCHEDULED',
        "instructor_id" uuid NOT NULL,
        "enrolled_count" int NOT NULL DEFAULT 0,
        "waitlist_count" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_cohorts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cohorts_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cohorts_instructor" FOREIGN KEY ("instructor_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_cohorts_capacity" CHECK ("capacity" > 0),
        CONSTRAINT "chk_cohorts_dates" CHECK ("ends_at" > "starts_at")
      )
    `);
    await queryRunner.query(`CREATE INDEX "cohorts_course_id_idx" ON "cohorts" ("course_id")`);
    await queryRunner.query(`CREATE INDEX "cohorts_status_idx" ON "cohorts" ("status")`);
    await queryRunner.query(`
      CREATE TABLE "cohort_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "cohort_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "meeting_url" varchar(2048),
        "recording_url" varchar(2048),
        CONSTRAINT "pk_cohort_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cohort_sessions_cohort" FOREIGN KEY ("cohort_id")
          REFERENCES "cohorts" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_cohort_sessions_dates" CHECK ("ends_at" > "starts_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "cohort_sessions_cohort_id_idx" ON "cohort_sessions" ("cohort_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "cohort_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "cohort_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" "cohort_member_status" NOT NULL DEFAULT 'ENROLLED',
        "waitlist_position" int,
        "joined_at" timestamptz,
        "dropped_at" timestamptz,
        CONSTRAINT "pk_cohort_members" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cohort_members_cohort" FOREIGN KEY ("cohort_id")
          REFERENCES "cohorts" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cohort_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "cohort_members_cohort_user_unique" ON "cohort_members" ("cohort_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "cohort_members_user_id_idx" ON "cohort_members" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "session_attendance" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "session_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" "attendance_status" NOT NULL,
        "note" varchar(500),
        "marked_by_id" uuid NOT NULL,
        CONSTRAINT "pk_session_attendance" PRIMARY KEY ("id"),
        CONSTRAINT "fk_session_attendance_session" FOREIGN KEY ("session_id")
          REFERENCES "cohort_sessions" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_session_attendance_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "session_attendance_session_user_unique" ON "session_attendance" ("session_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "session_attendance_user_id_idx" ON "session_attendance" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "session_attendance"`);
    await queryRunner.query(`DROP TABLE "cohort_members"`);
    await queryRunner.query(`DROP TABLE "cohort_sessions"`);
    await queryRunner.query(`DROP TABLE "cohorts"`);
    await queryRunner.query(`DROP TYPE "attendance_status"`);
    await queryRunner.query(`DROP TYPE "cohort_member_status"`);
    await queryRunner.query(`DROP TYPE "cohort_status"`);
  }
}
