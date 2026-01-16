// src/notifications/notifications.service.ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from 'src/config/config.service'; // Importe o ConfigService
import * as nodemailer from 'nodemailer'; // Instale: npm install nodemailer
import Mail from 'nodemailer/lib/mailer';

@Injectable()
export class NotificationsService {
  public readonly logger = new Logger(NotificationsService.name); // Torna o logger público para acesso externo
  private transporter: Mail;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.emailServiceHost,
      port: this.configService.emailServicePort,
      secure: this.configService.emailServicePort === 465, // true for 465, false for other ports
      auth: {
        user: this.configService.emailServiceUser,
        pass: this.configService.emailServicePass,
      },
    });
  }

  private async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    const mailOptions = {
      from: this.configService.emailServiceFrom,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Remove HTML tags for plain text version
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`E-mail enviado com sucesso para ${to}. Assunto: ${subject}`);
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail para ${to}. Assunto: ${subject}. Erro: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Falha ao enviar e-mail de notificação.');
    }
  }

  async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    const subject = 'Bem-vindo(a) à MKCloset!';
    const html = `
      <p>Olá ${userName},</p>
      <p>Seja muito bem-vindo(a) à MKCloset! Estamos felizes em tê-lo(a) conosco.</p>
      <p>Explore nossa coleção e encontre as últimas tendências da moda.</p>
      <p>Atenciosamente,</p>
      <p>Equipe MKCloset</p>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendOrderConfirmationEmail(to: string, orderId: string, totalAmount: number): Promise<void> {
    const subject = `Confirmação de Pedido #${orderId} - MKCloset`;
    const html = `
      <p>Olá,</p>
      <p>Seu pedido #${orderId} foi recebido com sucesso!</p>
      <p>Valor total: R$ ${totalAmount.toFixed(2)}</p>
      <p>Você pode acompanhar o status do seu pedido em nossa loja.</p>
      <p>Atenciosamente,</p>
      <p>Equipe MKCloset</p>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendPaymentConfirmationEmail(to: string, orderId: string, totalAmount: number): Promise<void> {
    const subject = `Pagamento Aprovado para o Pedido #${orderId} - MKCloset`;
    const html = `
      <p>Olá,</p>
      <p>Informamos que o pagamento do seu pedido #${orderId} no valor de R$ ${totalAmount.toFixed(2)} foi aprovado com sucesso!</p>
      <p>Estamos preparando seu pedido para envio.</p>
      <p>Atenciosamente,</p>
      <p>Equipe MKCloset</p>
    `;
    await this.sendEmail(to, subject, html);
  }

  async sendPaymentCancellationEmail(to: string, orderId: string): Promise<void> {
    const subject = `Cancelamento do Pagamento do Pedido #${orderId} - MKCloset`;
    const html = `
      <p>Olá,</p>
      <p>Informamos que o pagamento do seu pedido #${orderId} foi cancelado.</p>
      <p>Caso tenha alguma dúvida, entre em contato conosco.</p>
      <p>Atenciosamente,</p>
      <p>Equipe MKCloset</p>
    `;
    await this.sendEmail(to, subject, html);
  }

  // Você pode adicionar mais métodos para outros tipos de notificações (envio, entrega, etc.)
}