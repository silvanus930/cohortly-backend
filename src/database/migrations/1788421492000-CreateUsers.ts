import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateUsers1788421492000 implements MigrationInterface {
  name = 'CreateUsers1788421492000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('SUPERADMIN', 'ADMIN', 'INSTRUCTOR', 'LEARNER', 'ORG_ADMIN', 'PARTNER')`,
    );
    await queryRunner.query(`CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED')`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "email" varchar(320) NOT NULL,
        "password_hash" varchar(255),
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'LEARNER',
        "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
        "avatar_url" varchar(2048),
        "google_id" varchar(255),
        "email_verified_at" timestamptz,
        "last_login_at" timestamptz,
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_google_id_unique" ON "users" ("google_id") WHERE google_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "users_google_id_unique"`);
    await queryRunner.query(`DROP INDEX "users_email_unique"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_status"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
