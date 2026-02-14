import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { BugReportService } from '../../core/bug-report/bug-report.service';
import { BugReportSourceDto, BugReportSeverityDto } from '../../core/bug-report/dto/create-bug-report.dto';

@Injectable()
@Catch()
export class BugReportExceptionFilter {
  private readonly logger = new Logger(BugReportExceptionFilter.name);

  constructor(private readonly bugReportService: BugReportService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
      stack = exception.stack;
    }

    // Only auto-capture server errors (5xx) and unexpected errors
    if (this.shouldCapture(status, exception)) {
      this.captureError(exception, request, status).catch((err) => {
        this.logger.error(`Failed to capture bug report: ${err.message}`);
      });
    }

    // Send the error response
    if (!response.sent) {
      response.status(status).send({
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }
  }

  private shouldCapture(status: number, exception: unknown): boolean {
    // Only capture 5xx errors (server errors)
    if (status >= 500) {
      return true;
    }

    // Also capture unexpected non-HttpException errors
    if (!(exception instanceof HttpException)) {
      return true;
    }

    return false;
  }

  private async captureError(
    exception: unknown,
    request: FastifyRequest,
    status: number,
  ): Promise<void> {
    const errorMessage =
      exception instanceof Error ? exception.message : String(exception);
    const errorStack = exception instanceof Error ? exception.stack : undefined;

    // Extract user and workspace from request if available
    const userId = (request.raw as any)?.userId;
    const workspaceId = (request.raw as any)?.workspaceId;

    const severity = this.determineSeverity(status, exception);

    await this.bugReportService.createAutoReport(
      {
        source: BugReportSourceDto.AUTO_SERVER,
        errorMessage,
        errorStack,
        errorCode: String(status),
        severity,
        workspaceId,
        context: {
          endpoint: request.url,
          method: request.method,
          headers: this.sanitizeHeaders(request.headers),
          statusCode: status,
        },
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        occurredAt: new Date().toISOString(),
      },
      userId,
    );

    this.logger.log(
      `Auto-captured server error: ${status} ${request.method} ${request.url}`,
    );
  }

  private determineSeverity(
    status: number,
    exception: unknown,
  ): BugReportSeverityDto {
    const message =
      exception instanceof Error
        ? exception.message.toLowerCase()
        : String(exception).toLowerCase();

    // Critical: Database failures, complete service outages
    if (
      message.includes('database') ||
      message.includes('connection refused') ||
      message.includes('econnrefused') ||
      status === 503
    ) {
      return BugReportSeverityDto.CRITICAL;
    }

    // High: 500 errors, timeouts
    if (
      status === 500 ||
      message.includes('timeout') ||
      message.includes('deadlock')
    ) {
      return BugReportSeverityDto.HIGH;
    }

    // Medium: Other server errors
    return BugReportSeverityDto.MEDIUM;
  }

  private sanitizeHeaders(
    headers: FastifyRequest['headers'],
  ): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
    ];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.join(', ');
      }
    }

    return sanitized;
  }
}
