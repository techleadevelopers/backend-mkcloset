import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
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
  private readonly brevoApiUrl = 'https://api.brevo.com/v3/smtp/email';
  private readonly brandLogoUrl = 'https://www.bymkcloset.com.br/images/logo2.png';

  constructor(private configService: ConfigService) {
    this.logger.log('Servico de e-mail inicializado via Brevo API.');
  }

  private buildLayout(title: string, intro: string, body: string, cta?: string) {
    return `
      <div style="margin:0;background:#f5f2ee;padding:32px 16px;color:#111827;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ece7df;box-shadow:0 18px 45px rgba(17,24,39,0.08);">
          <div style="background:linear-gradient(180deg,#fbf8f3 0%,#f2ebe2 100%);padding:28px 28px 22px;border-bottom:1px solid #e8dfd4;text-align:center;">
            <img
              src="${this.brandLogoUrl}"
              alt="MK Closet"
              style="display:block;margin:0 auto 14px;max-width:180px;width:100%;height:auto;"
            />
            <p style="margin:0;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#8a7663;">${title}</p>
          </div>
          <div style="padding:30px 28px;">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.75;color:#1f2937;">${intro}</p>
            ${body}
            ${cta ? `<p style="margin:26px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">${cta}</p>` : ''}
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
    const apiKey = this.configService.emailServicePass;
    const fromEmail = this.configService.emailServiceFrom;

    if (!apiKey) {
      this.logger.warn(`Brevo API desativada: chave nao configurada. Ignorando envio para ${to}.`);
      return;
    }

    if (!fromEmail) {
      this.logger.warn(`Brevo API desativada: remetente nao configurado. Ignorando envio para ${to}.`);
      return;
    }

    try {
      const payload = {
        sender: {
          name: 'MK Closet',
          email: fromEmail,
        },
        to: [
          {
            email: to,
          },
        ],
        subject,
        htmlContent: html,
        textContent: text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      };

      const response = await axios.post(this.brevoApiUrl, payload, {
        headers: {
          'api-key': apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        timeout: 15000,
      });

      this.logger.log(
        `E-mail enviado com sucesso para ${to}. Assunto: ${subject}. MessageId: ${response.data?.messageId ?? 'n/a'}`,
      );
    } catch (error) {
      const err = error as Error;
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(
          `Falha ao enviar e-mail para ${to}. Assunto: ${subject}. Brevo: ${JSON.stringify(error.response.data)}`,
        );
      } else {
        this.logger.error(
          `Falha ao enviar e-mail para ${to}. Assunto: ${subject}. Erro: ${err.message}`,
          err.stack,
        );
      }
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
