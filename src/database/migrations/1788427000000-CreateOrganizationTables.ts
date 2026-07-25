import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateOrganizationTables1788427000000 implements MigrationInterface {
  name = 'CreateOrganizationTables1788427000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED')`);
    await queryRunner.query(`CREATE TYPE "organization_member_role" AS ENUM ('ADMIN', 'MEMBER')`);
    await queryRunner.query(`CREATE TYPE "seat_pack_source" AS ENUM ('MANUAL', 'PURCHASE')`);
    await queryRunner.query(
      `CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(200) NOT NULL,
        "slug" varchar(220) NOT NULL,
        "description" text,
        "website" varchar(2048),
        "logo_url" varchar(2048),
        "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
        "owner_id" uuid NOT NULL,
        CONSTRAINT "pk_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_organizations_owner" FOREIGN KEY ("owner_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "organizations_owner_id_idx" ON "organizations" ("owner_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "organization_memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" "organization_member_role" NOT NULL DEFAULT 'MEMBER',
        CONSTRAINT "pk_organization_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "fk_organization_memberships_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_organization_memberships_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "organization_memberships_org_user_unique" ON "organization_memberships" ("organization_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "seat_packs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "seats" int NOT NULL,
        "source" "seat_pack_source" NOT NULL,
        "purchase_id" uuid,
        "note" varchar(500),
        "expires_at" timestamptz,
        CONSTRAINT "pk_seat_packs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_seat_packs_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "seat_packs_organization_id_idx" ON "seat_packs" ("organization_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "seat_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "assigned_by_id" uuid NOT NULL,
        "revoked_at" timestamptz,
        CONSTRAINT "pk_seat_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_seat_assignments_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_seat_assignments_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_seat_assignments_course" FOREIGN KEY ("course_id")
          REFERENCES "courses" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "seat_assignments_org_user_course_unique" ON "seat_assignments" ("organization_id", "user_id", "course_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "seat_assignments_user_id_idx" ON "seat_assignments" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "seat_assignments_course_id_idx" ON "seat_assignments" ("course_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "organization_invitations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "email" varchar(320) NOT NULL,
        "role" "organization_member_role" NOT NULL,
        "token_hash" varchar(128) NOT NULL,
        "invited_by_id" uuid NOT NULL,
        "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
        "expires_at" timestamptz NOT NULL,
        "accepted_at" timestamptz,
        CONSTRAINT "pk_organization_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_organization_invitations_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "organization_invitations_organization_id_idx" ON "organization_invitations" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "organization_invitations_email_idx" ON "organization_invitations" ("email")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "organization_invitations_token_hash_unique" ON "organization_invitations" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "organization_invitations"`);
    await queryRunner.query(`DROP TABLE "seat_assignments"`);
    await queryRunner.query(`DROP TABLE "seat_packs"`);
    await queryRunner.query(`DROP TABLE "organization_memberships"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TYPE "invitation_status"`);
    await queryRunner.query(`DROP TYPE "seat_pack_source"`);
    await queryRunner.query(`DROP TYPE "organization_member_role"`);
    await queryRunner.query(`DROP TYPE "organization_status"`);
  }
}
