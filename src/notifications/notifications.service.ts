import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Mail from 'nodemailer/lib/mailer';
import * as nodemailer from 'nodemailer';
import { ConfigService } from 'src/config/config.service';

type OrderEmailContext = {
  customerName?: string | null;
  orderId: string;
  totalAmount?: number;
  carrier?: string | null;
  postedAt?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
};

@Injectable()
export class NotificationsService {
  public readonly logger = new Logger(NotificationsService.name);
  private transporter: Mail;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.emailServiceHost,
      port: this.configService.emailServicePort,
      secure: this.configService.emailServiceSecure,
      auth: {
        user: this.configService.emailServiceUser,
        pass: this.configService.emailServicePass,
      },
    });
  }

  private buildLayout(title: string, intro: string, body: string, cta?: string) {
    return `
      <div style="font-family:Arial,sans-serif;background:#f7f7f7;padding:24px;color:#111827;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <div style="background:#111827;color:#ffffff;padding:24px 28px;">
            <h1 style="margin:0;font-size:24px;">MK Closet</h1>
            <p style="margin:8px 0 0;font-size:14px;opacity:.9;">${title}</p>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${intro}</p>
            ${body}
            ${cta ? `<p style="margin:24px 0 0;font-size:14px;color:#374151;">${cta}</p>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private greeting(customerName?: string | null) {
    return customerName ? `Olá ${customerName},` : 'Olá,';
  }

  private money(totalAmount?: number) {
    if (typeof totalAmount !== 'number') return null;
    return totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    if (!this.configService.emailServiceHost) {
      this.logger.warn(`SMTP desativado: SMTP_HOST não configurado. Ignorando envio para ${to}.`);
      return;
    }
    if (!this.configService.emailServiceUser || !this.configService.emailServicePass) {
      this.logger.warn(`SMTP desativado: credenciais não configuradas. Ignorando envio para ${to}.`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.configService.emailServiceFrom,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ' '),
      });
      this.logger.log(`E-mail enviado com sucesso para ${to}. Assunto: ${subject}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Falha ao enviar e-mail para ${to}. Assunto: ${subject}. Erro: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException('Falha ao enviar e-mail de notificação.');
    }
  }

  async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    const subject = 'Bem-vinda à MK Closet';
    const html = this.buildLayout(
      'Cadastro confirmado',
      `${this.greeting(userName)} seu cadastro foi concluído com sucesso.`,
      `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
          Agora você já pode acompanhar seus pedidos, salvar favoritos e comprar com mais rapidez.
        </p>
      `,
      'Equipe MK Closet',
    );
    await this.sendEmail(to, subject, html);
  }

  async sendOrderConfirmationEmail(
    to: string,
    orderId: string,
    totalAmount: number,
    customerName?: string | null,
  ): Promise<void> {
    const total = this.money(totalAmount);
    const subject = `Pedido criado #${orderId.slice(0, 8)} - MK Closet`;
    const html = this.buildLayout(
      'Pedido criado',
      `${this.greeting(customerName)} recebemos seu pedido com sucesso.`,
      `
        <p style="margin:0 0 12px;font-size:15px;">Pedido: <strong>#${orderId}</strong></p>
        <p style="margin:0 0 12px;font-size:15px;">Valor total: <strong>R$ ${total}</strong></p>
        <p style="margin:0;font-size:15px;line-height:1.6;">
          Assim que o pagamento for confirmado, enviaremos uma nova atualização.
        </p>
      `,
      'Obrigada por comprar na MK Closet.',
    );
    await this.sendEmail(to, subject, html);
  }

  async sendPaymentConfirmationEmail(
    to: string,
    orderId: string,
    totalAmount: number,
    customerName?: string | null,
  ): Promise<void> {
    const total = this.money(totalAmount);
    const subject = `Pagamento aprovado #${orderId.slice(0, 8)} - MK Closet`;
    const html = this.buildLayout(
      'Pagamento aprovado',
      `${this.greeting(customerName)} o pagamento do seu pedido foi aprovado.`,
      `
        <p style="margin:0 0 12px;font-size:15px;">Pedido: <strong>#${orderId}</strong></p>
        <p style="margin:0 0 12px;font-size:15px;">Valor confirmado: <strong>R$ ${total}</strong></p>
        <p style="margin:0;font-size:15px;line-height:1.6;">
          Seu pedido seguirá para preparação e separação.
        </p>
      `,
      'Você receberá novos avisos por e-mail conforme o pedido avançar.',
    );
    await this.sendEmail(to, subject, html);
  }

  async sendOrderProcessingEmail(to: string, context: OrderEmailContext): Promise<void> {
    const subject = `Pedido em separação #${context.orderId.slice(0, 8)} - MK Closet`;
    const html = this.buildLayout(
      'Pedido em separação',
      `${this.greeting(context.customerName)} seu pedido já está sendo separado para envio.`,
      `
        <p style="margin:0 0 12px;font-size:15px;">Pedido: <strong>#${context.orderId}</strong></p>
        <p style="margin:0;font-size:15px;line-height:1.6;">
          Nossa equipe já iniciou a preparação e você será avisada assim que o envio for concluído.
        </p>
      `,
    );
    await this.sendEmail(to, subject, html);
  }

  async sendOrderShippedEmail(to: string, context: OrderEmailContext): Promise<void> {
    const subject = `Pedido enviado #${context.orderId.slice(0, 8)} - MK Closet`;
    const carrierBlock = context.carrier
      ? `<p style="margin:0 0 12px;font-size:15px;">Transportadora: <strong>${context.carrier}</strong></p>`
      : '';
    const postedAtBlock = context.postedAt
      ? `<p style="margin:0 0 12px;font-size:15px;">Data de postagem: <strong>${context.postedAt}</strong></p>`
      : '';
    const trackingBlock = context.trackingCode
      ? `<p style="margin:0 0 12px;font-size:15px;">Rastreio: <strong>${context.trackingCode}</strong></p>`
      : '';
    const trackingUrlBlock = context.trackingUrl
      ? `<p style="margin:0;font-size:15px;line-height:1.6;">Acompanhe aqui: <a href="${context.trackingUrl}" target="_blank" rel="noopener noreferrer">${context.trackingUrl}</a></p>`
      : '';
    const html = this.buildLayout(
      'Pedido enviado',
      `${this.greeting(context.customerName)} seu pedido foi postado.`,
      `
        <p style="margin:0 0 12px;font-size:15px;">Pedido: <strong>#${context.orderId}</strong></p>
        ${carrierBlock}
        ${postedAtBlock}
        ${trackingBlock}
        ${trackingUrlBlock}
      `,
    );
    await this.sendEmail(to, subject, html);
  }

  async sendOrderDeliveredEmail(to: string, context: OrderEmailContext): Promise<void> {
    const subject = `Pedido entregue #${context.orderId.slice(0, 8)} - MK Closet`;
    const html = this.buildLayout(
      'Pedido entregue',
      `${this.greeting(context.customerName)} seu pedido foi marcado como entregue.`,
      `
        <p style="margin:0 0 12px;font-size:15px;">Pedido: <strong>#${context.orderId}</strong></p>
        <p style="margin:0;font-size:15px;line-height:1.6;">
          Esperamos que você aproveite sua compra. Se precisar de suporte, nossa equipe está à disposição.
        </p>
      `,
    );
    await this.sendEmail(to, subject, html);
  }

  async sendPaymentCancellationEmail(
    to: string,
    orderId: string,
    customerName?: string | null,
  ): Promise<void> {
    const subject = `Pagamento cancelado #${orderId.slice(0, 8)} - MK Closet`;
    const html = this.buildLayout(
      'Pagamento cancelado',
      `${this.greeting(customerName)} identificamos o cancelamento do pagamento do seu pedido.`,
      `
        <p style="margin:0 0 12px;font-size:15px;">Pedido: <strong>#${orderId}</strong></p>
        <p style="margin:0;font-size:15px;line-height:1.6;">
          Se precisar, você pode refazer a compra ou entrar em contato com nosso atendimento.
        </p>
      `,
    );
    await this.sendEmail(to, subject, html);
  }
}
