# Cohortly Backend

REST API for Cohortly, a cohort-based tech bootcamp platform. Organizations
buy seats, learners join scheduled cohorts, instructors grade work and
partners earn referral commissions.

Built with Node 20, NestJS 11, TypeScript in strict mode, TypeORM 0.3 and
PostgreSQL, Passport JWT, Stripe Checkout, an S3 compatible object store and
Nodemailer. Tested with Jest and Supertest.

## Contents

- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Testing](#testing)
- [Deployment](#deployment)

## Getting started

Requirements: Node.js 20 or newer and Docker for the local PostgreSQL.

```bash
cp .env.example .env          # then set JWT_ACCESS_SECRET and SUPERADMIN_* values
docker compose up -d          # PostgreSQL 16 with the app and test databases
npm install
npm run migration:run
npm run seed                  # optional: demo accounts, courses, cohorts and an organization
npm run start:dev
```

The API listens on `http://localhost:3000/api/v1`. Swagger UI with a bearer
token input is served at `http://localhost:3000/docs`. A superadmin account
is created on boot from `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD`.

## Scripts

| Script                         | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `npm run start:dev`            | Start the API with file watching                           |
| `npm run build`                | Compile to `dist/`                                         |
| `npm run start:prod`           | Run the compiled build                                     |
| `npm run lint` / `lint:check`  | Lint with autofix / without                                |
| `npm test`                     | Unit tests                                                 |
| `npm run test:e2e`             | End to end tests against PostgreSQL                        |
| `npm run migration:generate`   | Generate a migration from entity changes (review it!)      |
| `npm run migration:run`        | Apply pending migrations                                   |
| `npm run migration:revert`     | Roll back the last migration                               |
| `npm run seed`                 | Populate a development database with demo data             |
| `npm run certificates:reissue` | Re-render certificates with the current SVG template       |
| `npm run referrals:backfill`   | Assign referral codes to accounts that predate the feature |

## Architecture

The application is a modular NestJS monolith. Each business area is a
module with its own entities, DTOs, service, controller and unit specs.
Requests flow through helmet and CORS, rate limiting, a global JWT guard with
a `@Public()` opt-out, a roles guard, a whitelisting validation pipe, and a
response envelope so every success looks like `{ success, data, meta }` and
every failure like `{ statusCode, error, message, path, timestamp }`.

Modules that would otherwise depend on each other in a cycle communicate
through registration hooks: enrollments unlock catalog content and gate
cohort joins, quizzes gate lesson completion, certificates react to course
completion, and referrals react to paid and refunded purchases.

See [docs/architecture.md](docs/architecture.md) for the full picture and
the ADRs in [docs/adr](docs/adr) for the reasoning behind authentication,
payments and the referral payout model.

## Environment variables

All variables are validated on boot. See `.env.example` for defaults.

| Variable                                                                                                     | Required     | Description                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                   | no           | `development`, `test` or `production`                                                  |
| `PORT`                                                                                                       | no           | HTTP port, default 3000                                                                |
| `APP_NAME`, `APP_URL`                                                                                        | no           | Used in emails, certificate links and referral links                                   |
| `CORS_ORIGINS`                                                                                               | no           | Comma separated origins, or `*`                                                        |
| `THROTTLE_TTL_MS`, `THROTTLE_LIMIT`                                                                          | no           | Rate limit window and request budget per IP                                            |
| `DATABASE_URL`                                                                                               | yes          | PostgreSQL connection string                                                           |
| `DATABASE_SSL`, `DATABASE_LOGGING`                                                                           | no           | TLS to the database, SQL logging                                                       |
| `DATABASE_MIGRATIONS_RUN`                                                                                    | no           | Apply pending migrations on boot (test and preview environments)                       |
| `JWT_ACCESS_SECRET`                                                                                          | yes          | At least 32 characters                                                                 |
| `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_DAYS`                                                             | no           | Token lifetimes                                                                        |
| `BCRYPT_ROUNDS`                                                                                              | no           | Password hashing cost                                                                  |
| `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`                                                                        | no           | Password reset code lifetime and attempt budget                                        |
| `GOOGLE_CLIENT_ID`                                                                                           | no           | Enables Google ID token sign in                                                        |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_FIRST_NAME`, `SUPERADMIN_LAST_NAME`                   | no           | Superadmin seeded on boot when email and password are set                              |
| `MAIL_TRANSPORT`                                                                                             | no           | `smtp`, `log` or `memory`                                                              |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`                           | smtp only    | Outgoing mail settings                                                                 |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | for uploads  | S3 compatible storage; uploads return 503 until configured                             |
| `STORAGE_PUBLIC_URL`, `STORAGE_FORCE_PATH_STYLE`, `STORAGE_PRESIGN_TTL_SECONDS`, `STORAGE_MAX_UPLOAD_MB`     | no           | Public url base, path style addressing, presign lifetime, size cap                     |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                                 | for payments | Checkout returns 503 until the secret key is set; the webhook needs the signing secret |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`                                                                    | no           | Redirect targets after checkout                                                        |
| `PAYMENTS_CURRENCY`, `SEAT_PRICE_CENTS`, `MAX_BUNDLE_SIZE`                                                   | no           | Seat pack pricing and bundle limits                                                    |
| `REFERRAL_COMMISSION_RATE_BPS`, `REFERRAL_PAYOUT_THRESHOLD_CENTS`, `REFERRAL_CODE_LENGTH`                    | no           | Default partner terms                                                                  |

## API overview

All routes are prefixed with `/api/v1`. Routes under `/manage` require the
instructor or admin role; `/manage/analytics`, `/manage/certificates`,
`/manage/purchases` and `/manage/referrals` require admin.

| Area             | Routes                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health           | `GET /health`                                                                                                                                                                                                                                                                   |
| Auth             | `POST /auth/register`, `/login`, `/google`, `/refresh`, `/logout`, `/logout-all`, `/forgot-password`, `/reset-password`, `/change-password`; `GET` and `PATCH /auth/me`                                                                                                         |
| Users (admin)    | `GET /users`, `GET /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/status`, `GET /users/analytics/summary`                                                                                                                                                              |
| Categories       | `GET /categories`; admin `POST`, `PATCH /:id`, `DELETE /:id`                                                                                                                                                                                                                    |
| Course authoring | `/manage/courses` CRUD, `/:id/publish`, `/:id/unpublish`, `/:id/archive`, `/:id/cover`, `/:id/faqs`; `/manage/courses/:id/modules`, `/manage/modules/:id`, `/manage/modules/:id/lessons`, `/manage/lessons/:id`, reorder endpoints, `/manage/lessons/:id/materials`             |
| Catalog          | `GET /catalog/courses`, `GET /catalog/courses/:slug`, `GET /catalog/recommendations`                                                                                                                                                                                            |
| Organizations    | `POST` and `GET /organizations` (admin), `GET /organizations/mine`, `GET /:id`, `PATCH /:id`, `/:id/dashboard`, `/:id/members`, `/:id/invitations`, `POST /organizations/invitations/accept`, `/:id/seat-packs`, `/:id/seats`                                                   |
| Cohorts          | `GET /cohorts`, `GET /cohorts/mine`, `GET /cohorts/:id`, `POST /cohorts/:id/join`, `/leave`; `/manage/courses/:id/cohorts`, `/manage/cohorts/:id`, `/roster`, `/sessions`, `/manage/sessions/:id/attendance`, `/manage/cohorts/:id/attendance-summary`                          |
| Enrollments      | `POST /enrollments`, `GET /enrollments/mine`, `/continue`, `/streak`, `/courses/:courseId/progress`, `PUT /enrollments/lessons/:lessonId/progress`, `POST /enrollments/:id/cancel`; `GET /manage/courses/:id/enrollments`                                                       |
| Quizzes          | `PUT`, `GET`, `DELETE /manage/lessons/:lessonId/quiz`; `GET /quizzes/lessons/:lessonId`, `POST` and `GET /quizzes/lessons/:lessonId/attempts`                                                                                                                                   |
| Assignments      | `PUT`, `GET`, `DELETE /manage/lessons/:lessonId/assignment`, `GET /manage/lessons/:lessonId/submissions`, `POST /manage/submissions/:id/grade`, `GET /manage/cohorts/:id/gradebook`; `GET /assignments/lessons/:lessonId`, `POST .../uploads`, `POST` and `GET .../submissions` |
| Certificates     | `GET /certificates/mine`, `GET /certificates/verify/:code`, `GET /certificates/svg/:code`; admin `GET /manage/certificates`, `POST /:id/revoke`, `POST /:id/reissue`                                                                                                            |
| Payments         | `POST /payments/checkout`, `POST /payments/confirm/:purchaseId`, `GET /payments/mine`, `GET /payments/:id`, `POST /payments/webhook`; admin `GET /manage/purchases`, `POST /manage/purchases/:id/refund`                                                                        |
| Referrals        | `GET /referrals/me`, `/me/ledger`, `/me/payouts`; admin `GET /manage/referrals/partners`, `PUT /manage/referrals/partners/:userId`, `GET /manage/referrals/ledger`, `GET /manage/referrals/payouts`, `POST /manage/referrals/payouts/:id/pay`                                   |
| Notifications    | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `DELETE /notifications/:id`                                                                                                                            |
| Storage          | `POST /storage/uploads`                                                                                                                                                                                                                                                         |
| Analytics        | `GET /manage/analytics/overview`, `/revenue`, `/enrollments`, `/top-courses`, `/cohort-completion`; `GET` and `POST .../reset` under `/manage/instructors/:id/performance`                                                                                                      |

The complete, always current reference is the Swagger document at `/docs`.

## Testing

```bash
npm test                 # unit tests, no database needed
npm run test:e2e         # boots the app against cohortly_test and runs HTTP suites
```

The e2e harness applies migrations on boot, truncates tables between
suites and uses the in-memory mail transport so reset codes and invitation
tokens can be read back. Stripe webhooks are exercised with locally signed
events, so no Stripe account is needed to run the suite.

## Deployment

```bash
npm ci
npm run build
npm run migration:run
pm2 start ecosystem.config.js --env production
```

`ecosystem.config.js` runs `dist/main.js` in cluster mode. Point Stripe's
webhook at `/api/v1/payments/webhook` with the signing secret from
`STRIPE_WEBHOOK_SECRET`, configure an S3 compatible bucket for uploads, and
set `MAIL_TRANSPORT=smtp` with your relay. The GitHub Actions workflow in
`.github/workflows/ci.yml` runs lint, build, unit and e2e tests on every
push and pull request.
