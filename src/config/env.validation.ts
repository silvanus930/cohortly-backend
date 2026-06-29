import Joi from 'joi';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * Every variable the application reads is declared here. Validation runs once
 * on boot so a misconfigured deployment fails fast with a readable message
 * instead of surfacing as a runtime error deep inside a request.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVS)
    .default('development'),
  PORT: Joi.number().port().default(3000),
  APP_NAME: Joi.string().default('Cohortly'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().default('*'),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_LOGGING: Joi.boolean().default(false),
});
