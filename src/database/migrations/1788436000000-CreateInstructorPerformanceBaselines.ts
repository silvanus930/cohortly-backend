import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateInstructorPerformanceBaselines1788436000000 implements MigrationInterface {
  name = 'CreateInstructorPerformanceBaselines1788436000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "instructor_performance_baselines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "reset_at" timestamptz NOT NULL,
        "reset_by_id" uuid NOT NULL,
        "note" varchar(500),
        CONSTRAINT "pk_instructor_performance_baselines" PRIMARY KEY ("id"),
        CONSTRAINT "fk_instructor_performance_baselines_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "instructor_performance_baselines_user_id_unique" ON "instructor_performance_baselines" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "instructor_performance_baselines"`);
  }
}
