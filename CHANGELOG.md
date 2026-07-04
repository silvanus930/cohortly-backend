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
