import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { MailMessage } from '../interfaces/mail.message';
import { ResendConfig } from '../interfaces';
import { MailDriver } from './interfaces/mail-driver.interface';
import { mailLogName } from '../mail.utils';

export class ResendDriver implements MailDriver {
  private readonly logger = new Logger(mailLogName(ResendDriver.name));
  private readonly client: Resend;

  constructor(config: ResendConfig) {
    this.client = new Resend(config.apiKey);
  }

  async sendMail(message: MailMessage): Promise<void> {
    try {
      await this.client.emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      this.logger.debug(`Sent mail to ${message.to}`);
    } catch (err) {
      this.logger.warn(`Failed to send mail to ${message.to}: ${err}`);
      throw err;
    }
  }
}
