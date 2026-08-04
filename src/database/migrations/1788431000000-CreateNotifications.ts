import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateNotifications1788431000000 implements MigrationInterface {
  name = 'CreateNotifications1788431000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "notification_type" AS ENUM ('GRADE_POSTED', 'CERTIFICATE_ISSUED', 'PAYOUT_THRESHOLD', 'COHORT_SEAT_GRANTED', 'SUBMISSION_RECEIVED', 'GENERIC')`,
    );
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "type" "notification_type" NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}',
        "read_at" timestamptz,
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id", "read_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_user_created_idx" ON "notifications" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "notification_type"`);
  }
}
