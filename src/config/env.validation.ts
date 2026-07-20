import Joi from 'joi';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

const optionalString = Joi.string().allow('').default('');

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
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_LOGGING: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(30),
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(15).default(12),
  OTP_TTL_MINUTES: Joi.number().integer().min(1).default(10),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  GOOGLE_CLIENT_ID: optionalString,
  SUPERADMIN_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .allow('')
    .default(''),
  SUPERADMIN_PASSWORD: optionalString,
  SUPERADMIN_FIRST_NAME: Joi.string().default('Platform'),
  SUPERADMIN_LAST_NAME: Joi.string().default('Owner'),

  MAIL_TRANSPORT: Joi.string().valid('smtp', 'memory', 'log').default('log'),
  MAIL_FROM: Joi.string().default('Cohortly <no-reply@cohortly.local>'),
  SMTP_HOST: Joi.string().when('MAIL_TRANSPORT', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: optionalString,
  }),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,

  STORAGE_ENDPOINT: Joi.string().uri().allow('').default(''),
  STORAGE_REGION: Joi.string().default('us-east-1'),
  STORAGE_BUCKET: optionalString,
  STORAGE_ACCESS_KEY_ID: optionalString,
  STORAGE_SECRET_ACCESS_KEY: optionalString,
  STORAGE_PUBLIC_URL: Joi.string().uri().allow('').default(''),
  STORAGE_FORCE_PATH_STYLE: Joi.boolean().default(true),
  STORAGE_PRESIGN_TTL_SECONDS: Joi.number().integer().min(60).max(86400).default(900),
  STORAGE_MAX_UPLOAD_MB: Joi.number().integer().min(1).default(500),
});
