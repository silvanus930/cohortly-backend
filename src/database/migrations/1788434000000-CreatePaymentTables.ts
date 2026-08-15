import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreatePaymentTables1788434000000 implements MigrationInterface {
  name = 'CreatePaymentTables1788434000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "purchase_kind" AS ENUM ('COURSE', 'BUNDLE', 'SEAT_PACK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "purchase_status" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "purchases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "kind" "purchase_kind" NOT NULL,
        "status" "purchase_status" NOT NULL DEFAULT 'PENDING',
        "amount_cents" int NOT NULL,
        "currency" varchar(3) NOT NULL,
        "items" jsonb NOT NULL DEFAULT '[]',
        "organization_id" uuid,
        "seats" int,
        "stripe_checkout_session_id" varchar(255),
        "stripe_payment_intent_id" varchar(255),
        "referral_code" varchar(32),
        "paid_at" timestamptz,
        "refunded_at" timestamptz,
        "refund_reason" varchar(500),
        CONSTRAINT "pk_purchases" PRIMARY KEY ("id"),
        CONSTRAINT "fk_purchases_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_purchases_amount" CHECK ("amount_cents" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "purchases_user_id_idx" ON "purchases" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "purchases_status_idx" ON "purchases" ("status")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "purchases_checkout_session_unique" ON "purchases" ("stripe_checkout_session_id") WHERE stripe_checkout_session_id IS NOT NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE "stripe_events" (
        "event_id" varchar(255) NOT NULL,
        "type" varchar(120) NOT NULL,
        "purchase_id" uuid,
        "processed_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_stripe_events" PRIMARY KEY ("event_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stripe_events"`);
    await queryRunner.query(`DROP TABLE "purchases"`);
    await queryRunner.query(`DROP TYPE "purchase_status"`);
    await queryRunner.query(`DROP TYPE "purchase_kind"`);
  }
}
