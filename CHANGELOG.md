# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Project scaffold with NestJS, TypeScript strict mode, ESLint flat config,
  Prettier, Husky and lint-staged.
- Docker Compose service for PostgreSQL with a dedicated test database.
- Joi validated environment configuration with typed config namespaces.
- TypeORM data source, first migration and users entity.
- Health endpoint at `GET /api/v1/health` with a database probe.
- Global exception filter with a stable error contract, response envelope and
  request logging interceptors with request ids.
- Pagination helpers and a reusable pagination query DTO.
- Rate limiting through `@nestjs/throttler`, configured from the environment.
- Authentication: registration, login, Google ID token sign-in, refresh token
  rotation with reuse detection, logout, OTP password reset, password change
  and profile endpoints. Global JWT and roles guards with a `@Public()` opt-out.
- Mail module wrapping Nodemailer with smtp, log and in-memory transports plus
  welcome and password reset templates.
- Superadmin account seeded from the environment on boot.
- Admin user management: filtered, paginated listing, role changes with
  superadmin safeguards, activation and suspension, and an analytics summary.
- Course catalog data model: categories, courses, modules, lessons, materials
  and FAQs with migrations.
- Category management and the instructor and admin course authoring surface:
  create, update, archive and delete drafts with ownership checks.
- Curriculum authoring: modules and lessons with reordering, dense
  positions, automatic course duration and the publish/unpublish flow.
- S3 compatible storage service issuing presigned PUT uploads with MIME and
  size validation, plus cover images, lesson materials and course FAQs.
- Public catalog with search, category, level, pricing and tag filters,
  sorting, course detail pages that hide lesson content from non enrolled
  viewers, and popularity based recommendations.
- Organizations: creation with an owning org admin, email invitations with
  single use tokens, membership management, manually granted seat packs,
  seat assignment to members per course and a seat usage dashboard.
- Cohorts: scheduled runs of a course with capacity, live session schedule,
  join and leave with an automatic waitlist that promotes the next learner,
  rosters, attendance marking and per learner attendance summaries.
