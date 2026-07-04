import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAuthTables1788423173000 implements MigrationInterface {
  name = 'CreateAuthTables1788423173000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(128) NOT NULL,
        "family" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "replaced_by_id" uuid,
        "user_agent" varchar(512),
        "ip_address" varchar(64),
        CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refresh_tokens_token_hash_unique" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(`CREATE TYPE "one_time_code_purpose" AS ENUM ('PASSWORD_RESET')`);
    await queryRunner.query(`
      CREATE TABLE "one_time_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "purpose" "one_time_code_purpose" NOT NULL,
        "code_hash" varchar(128) NOT NULL,
        "attempts" int NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        CONSTRAINT "pk_one_time_codes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_one_time_codes_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "one_time_codes_user_purpose_idx" ON "one_time_codes" ("user_id", "purpose")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "one_time_codes"`);
    await queryRunner.query(`DROP TYPE "one_time_code_purpose"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
