import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipResponseEnvelope';

/** Marks a handler or controller whose responses must not be wrapped. */
export const SkipEnvelope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ENVELOPE_KEY, true);
