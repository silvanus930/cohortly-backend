# Cohortly Backend

REST API for Cohortly, a cohort-based tech bootcamp platform. Organizations buy
seats, learners join scheduled cohorts, instructors grade work and partners earn
referral commissions.

## Requirements

- Node.js 20 or newer
- Docker (for the local PostgreSQL instance)

## Getting started

```bash
cp .env.example .env
docker compose up -d
npm install
npm run start:dev
```

The API listens on `http://localhost:3000/api/v1` and Swagger UI is served from
`http://localhost:3000/docs`.

## Scripts

| Script              | Purpose                                 |
| ------------------- | --------------------------------------- |
| `npm run start:dev` | Start the API with file watching        |
| `npm run build`     | Compile to `dist/`                      |
| `npm run lint`      | Lint and auto-fix                       |
| `npm test`          | Run unit tests                          |
| `npm run test:e2e`  | Run end-to-end tests against PostgreSQL |
