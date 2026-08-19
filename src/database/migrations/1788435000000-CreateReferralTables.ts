import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateReferralTables1788435000000 implements MigrationInterface {
  name = 'CreateReferralTables1788435000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "referral_code" varchar(32)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "referred_by_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_referral_code_unique" ON "users" ("referral_code") WHERE referral_code IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "fk_users_referred_by" FOREIGN KEY ("referred_by_id") REFERENCES "users" ("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(`CREATE TYPE "partner_status" AS ENUM ('ACTIVE', 'SUSPENDED')`);
    await queryRunner.query(
      `CREATE TYPE "commission_status" AS ENUM ('EARNED', 'REVERSED', 'PAID')`,
    );
    await queryRunner.query(`CREATE TYPE "payout_cycle_status" AS ENUM ('OPEN', 'READY', 'PAID')`);

    await queryRunner.query(`
      CREATE TABLE "partner_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "commission_rate_bps" int NOT NULL,
        "payout_threshold_cents" int,
        "payout_method" varchar(40),
        "payout_details" jsonb NOT NULL DEFAULT '{}',
        "status" "partner_status" NOT NULL DEFAULT 'ACTIVE',
        "notes" varchar(1000),
        CONSTRAINT "pk_partner_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_partner_profiles_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_partner_profiles_rate" CHECK ("commission_rate_bps" BETWEEN 0 AND 10000)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "partner_profiles_user_id_unique" ON "partner_profiles" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "referrer_id" uuid NOT NULL,
        "referred_user_id" uuid NOT NULL,
        "code" varchar(32) NOT NULL,
        "qualified_at" timestamptz,
        "qualified_purchase_id" uuid,
        CONSTRAINT "pk_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_referrals_referrer" FOREIGN KEY ("referrer_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_referrals_referred_user" FOREIGN KEY ("referred_user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_referrals_not_self" CHECK ("referrer_id" <> "referred_user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "referrals_referrer_id_idx" ON "referrals" ("referrer_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "referrals_referred_user_id_unique" ON "referrals" ("referred_user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payout_cycles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "partner_id" uuid NOT NULL,
        "status" "payout_cycle_status" NOT NULL DEFAULT 'OPEN',
        "currency" varchar(3) NOT NULL,
        "amount_cents" int NOT NULL DEFAULT 0,
        "entry_count" int NOT NULL DEFAULT 0,
        "threshold_cents" int NOT NULL,
        "opened_at" timestamptz NOT NULL,
        "ready_at" timestamptz,
        "alert_sent_at" timestamptz,
        "paid_at" timestamptz,
        "paid_by_id" uuid,
        "payout_reference" varchar(200),
        CONSTRAINT "pk_payout_cycles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_payout_cycles_partner" FOREIGN KEY ("partner_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "payout_cycles_partner_status_idx" ON "payout_cycles" ("partner_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "commission_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "partner_id" uuid NOT NULL,
        "referral_id" uuid NOT NULL,
        "purchase_id" uuid NOT NULL,
        "payout_cycle_id" uuid,
        "purchase_amount_cents" int NOT NULL,
        "rate_bps" int NOT NULL,
        "amount_cents" int NOT NULL,
        "currency" varchar(3) NOT NULL,
        "status" "commission_status" NOT NULL DEFAULT 'EARNED',
        "reversed_at" timestamptz,
        "paid_at" timestamptz,
        CONSTRAINT "pk_commission_entries" PRIMARY KEY ("id"),
        CONSTRAINT "fk_commission_entries_partner" FOREIGN KEY ("partner_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_commission_entries_referral" FOREIGN KEY ("referral_id")
          REFERENCES "referrals" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_commission_entries_cycle" FOREIGN KEY ("payout_cycle_id")
          REFERENCES "payout_cycles" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "commission_entries_partner_id_idx" ON "commission_entries" ("partner_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "commission_entries_purchase_id_unique" ON "commission_entries" ("purchase_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "commission_entries_status_idx" ON "commission_entries" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "commission_entries"`);
    await queryRunner.query(`DROP TABLE "payout_cycles"`);
    await queryRunner.query(`DROP TABLE "referrals"`);
    await queryRunner.query(`DROP TABLE "partner_profiles"`);
    await queryRunner.query(`DROP TYPE "payout_cycle_status"`);
    await queryRunner.query(`DROP TYPE "commission_status"`);
    await queryRunner.query(`DROP TYPE "partner_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "fk_users_referred_by"`);
    await queryRunner.query(`DROP INDEX "users_referral_code_unique"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referred_by_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referral_code"`);
  }
}
