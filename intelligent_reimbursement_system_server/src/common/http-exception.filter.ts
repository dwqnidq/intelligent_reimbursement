import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        // class-validator 返回的是数组
        if (Array.isArray(resObj.message)) {
          message = (resObj.message as string[]).join('; ');
        } else {
          message = (resObj.message as string) ?? message;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // 状态码映射为业务 code
    const codeMap: Record<number, number> = {
      400: 400,
      401: 401,
      403: 403,
      404: 404,
      409: 409,
      500: 500,
    };

    response.status(status).json({
      code: codeMap[status] ?? status,
      message,
      data: null,
    });
  }
}
