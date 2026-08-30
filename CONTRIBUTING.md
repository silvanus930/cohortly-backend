# Contributing

Thanks for helping build Cohortly. This guide covers the local workflow,
the conventions the codebase follows and what a pull request needs before it
is merged.

## Local setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migration:run
npm run seed
npm run start:dev
```

The API listens on `http://localhost:3000/api/v1` and Swagger UI on
`http://localhost:3000/docs`. Seeded accounts all use the password
`Password123!`; the seed prints their emails.

## Project layout

Each business area is a NestJS module under `src/` with the same shape:

```
src/<module>/
  entities/        TypeORM entities
  dto/             request validation classes
  <module>.service.ts
  <module>.controller.ts
  <module>.module.ts
  *.spec.ts        unit tests next to the code they cover
```

Cross module rules that would create import cycles are expressed as hooks:
the catalog asks registered resolvers whether a viewer may see content,
cohorts ask join policies, progress asks lesson gates, enrollments notify
completion handlers and payments notify paid and refund handlers. When you
need one module to react to another, prefer registering a handler in
`onModuleInit` over importing the other module's service directly.

## Database changes

- Never enable `synchronize`. Every schema change is a migration in
  `src/database/migrations`, written by hand in SQL so it is readable in
  review and reversible in `down`.
- Name columns in snake_case in the migration and map them with
  `@Column({ name })` in the entity.
- Run `npm run migration:run` locally and make sure `npm run test:e2e`
  passes; the e2e harness applies migrations to `cohortly_test` on boot.

## Tests

- `npm test` runs unit tests. Every service and controller has a spec that
  mocks its collaborators; keep them fast and free of database access.
- `npm run test:e2e` runs the HTTP suites against PostgreSQL. Each suite
  boots the full application, truncates the tables and exercises real
  requests, so use it for authorization rules and multi module flows.
- Add or extend tests in the same change as the behaviour they cover.

## Style

- TypeScript strict mode, ESLint flat config and Prettier are enforced by
  `npm run lint:check` and by the pre-commit hook.
- Prefer explicit return types on exported functions and methods.
- Throw Nest HTTP exceptions from services; controllers stay thin and map
  entities to response shapes through the module's mapper.
- Do not log secrets or tokens. Emails and reset codes are only visible in
  the in-memory mail transport used by tests.

## Commits and pull requests

- Use Conventional Commits: `feat(scope): ...`, `fix(scope): ...`,
  `test(scope): ...`, `docs: ...`, `chore: ...`, `ci: ...`. Keep the subject
  imperative and under 72 characters.
- One logical change per commit; the project must build and pass lint at
  every commit.
- Update `CHANGELOG.md` under _Unreleased_ when you add or change behaviour.
- A pull request should describe the motivation, list any new environment
  variables and note migrations that need to run on deploy.
