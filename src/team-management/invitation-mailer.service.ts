import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class InvitationMailerService {
  async sendInvitation(email: string, inviterName: string, acceptanceUrl: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const from = process.env.SMTP_FROM;
    const username = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;

    if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Invitation email is not configured.');
    }
    if ((username && !password) || (!username && password)) {
      throw new ServiceUnavailableException('SMTP credentials are incomplete.');
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(port === 465 ? {} : { requireTLS: true }),
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    const safeName = this.escapeHtml(inviterName);
    const safeUrl = this.escapeHtml(acceptanceUrl);
    try {
      await transport.sendMail({
        from,
        to: email,
        subject: 'Invitation to Team Platform',
        text: `${inviterName} invited you to Team Platform. Sign in with this email address and accept the invitation: ${acceptanceUrl}`,
        html: `<p>${safeName} invited you to Team Platform.</p><p>Sign in with this email address and accept the invitation.</p><p><a href="${safeUrl}">Accept invitation</a></p>`,
      });
    } catch {
      throw new ServiceUnavailableException('Invitation email could not be delivered.');
    } finally {
      transport.close();
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const escaped: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return escaped[character] ?? character;
    });
  }
}
