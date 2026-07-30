import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentRequiredException extends HttpException {
  constructor(message = 'Payment required') {
    super(
      { statusCode: HttpStatus.PAYMENT_REQUIRED, error: 'Payment Required', message },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
