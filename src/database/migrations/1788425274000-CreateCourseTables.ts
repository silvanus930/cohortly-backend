import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCourseTables1788425274000 implements MigrationInterface {
  name = 'CreateCourseTables1788425274000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "course_level" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')`,
    );
    await queryRunner.query(`CREATE TYPE "course_pricing" AS ENUM ('FREE', 'PAID')`);
    await queryRunner.query(
      `CREATE TYPE "course_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "lesson_type" AS ENUM ('VIDEO', 'QUIZ', 'ASSIGNMENT', 'READING')`,
    );
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "slug" varchar(120) NOT NULL,
        "description" text,
        "position" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" ("slug")`,
    );
    await queryRunner.query(`
      CREATE TABLE "courses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "title" varchar(200) NOT NULL,
        "slug" varchar(220) NOT NULL,
        "summary" varchar(500) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "level" "course_level" NOT NULL DEFAULT 'BEGINNER',
        "pricing" "course_pricing" NOT NULL DEFAULT 'FREE',
        "price_cents" int NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'USD',
        "status" "course_status" NOT NULL DEFAULT 'DRAFT',
        "cover_url" varchar(2048),
        "tags" text[] NOT NULL DEFAULT '{}',
        "duration_minutes" int NOT NULL DEFAULT 0,
        "enrollment_count" int NOT NULL DEFAULT 0,
        "published_at" timestamptz,
        "category_id" uuid,
        "instructor_id" uuid NOT NULL,
        CONSTRAINT "pk_courses" PRIMARY KEY ("id"),
        CONSTRAINT "fk_courses_category" FOREIGN KEY ("category_id")
          REFERENCES "categories" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_courses_instructor" FOREIGN KEY ("instructor_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "courses_slug_unique" ON "courses" ("slug")`);
    await queryRunner.query(`CREATE INDEX "courses_status_idx" ON "courses" ("status")`);
    await queryRunner.query(`CREATE INDEX "courses_category_id_idx" ON "courses" ("category_id")`);
    await queryRunner.query(
      `CREATE INDEX "courses_instructor_id_idx" ON "courses" ("instructor_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "course_modules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "course_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "position" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_course_modules" PRIMARY KEY ("id"),
        CONSTRAINT "fk_course_modules_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "course_modules_course_id_idx" ON "course_modules" ("course_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "lessons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "module_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "type" "lesson_type" NOT NULL DEFAULT 'VIDEO',
        "position" int NOT NULL DEFAULT 0,
        "duration_minutes" int NOT NULL DEFAULT 0,
        "content_url" varchar(2048),
        "body" text,
        "is_preview" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_lessons" PRIMARY KEY ("id"),
        CONSTRAINT "fk_lessons_module" FOREIGN KEY ("module_id")
          REFERENCES "course_modules" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_lessons_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "lessons_module_id_idx" ON "lessons" ("module_id")`);
    await queryRunner.query(`CREATE INDEX "lessons_course_id_idx" ON "lessons" ("course_id")`);
    await queryRunner.query(`
      CREATE TABLE "lesson_materials" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "lesson_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "file_key" varchar(512) NOT NULL,
        "file_url" varchar(2048) NOT NULL,
        "mime_type" varchar(150) NOT NULL,
        "size_bytes" bigint NOT NULL DEFAULT 0,
        "position" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_lesson_materials" PRIMARY KEY ("id"),
        CONSTRAINT "fk_lesson_materials_lesson" FOREIGN KEY ("lesson_id")
          REFERENCES "lessons" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "lesson_materials_lesson_id_idx" ON "lesson_materials" ("lesson_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "course_faqs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "course_id" uuid NOT NULL,
        "question" varchar(300) NOT NULL,
        "answer" text NOT NULL,
        "position" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_course_faqs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_course_faqs_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "course_faqs_course_id_idx" ON "course_faqs" ("course_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "course_faqs"`);
    await queryRunner.query(`DROP TABLE "lesson_materials"`);
    await queryRunner.query(`DROP TABLE "lessons"`);
    await queryRunner.query(`DROP TABLE "course_modules"`);
    await queryRunner.query(`DROP TABLE "courses"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TYPE "lesson_type"`);
    await queryRunner.query(`DROP TYPE "course_status"`);
    await queryRunner.query(`DROP TYPE "course_pricing"`);
    await queryRunner.query(`DROP TYPE "course_level"`);
  }
}
