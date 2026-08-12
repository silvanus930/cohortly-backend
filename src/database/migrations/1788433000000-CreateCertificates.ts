import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCertificates1788433000000 implements MigrationInterface {
  name = 'CreateCertificates1788433000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "certificates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "code" varchar(32) NOT NULL,
        "user_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "enrollment_id" uuid NOT NULL,
        "recipient_name" varchar(200) NOT NULL,
        "course_title" varchar(200) NOT NULL,
        "instructor_name" varchar(200) NOT NULL,
        "completed_at" timestamptz NOT NULL,
        "issued_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "revoke_reason" varchar(500),
        "svg" text NOT NULL,
        "file_key" varchar(512),
        "file_url" varchar(2048),
        "template_version" int NOT NULL DEFAULT 1,
        CONSTRAINT "pk_certificates" PRIMARY KEY ("id"),
        CONSTRAINT "fk_certificates_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_certificates_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "certificates_code_unique" ON "certificates" ("code")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "certificates_enrollment_id_unique" ON "certificates" ("enrollment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "certificates_user_id_idx" ON "certificates" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "certificates_course_id_idx" ON "certificates" ("course_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "certificates"`);
  }
}
