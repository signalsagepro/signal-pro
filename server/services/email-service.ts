import nodemailer from 'nodemailer';

// Email service for sending notifications
export class EmailService {
  private transporter: any;

  constructor() {
    const smtpHost = process.env.SMTP_HOST || 'localhost';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASSWORD || '';
    const smtpFrom = process.env.SMTP_FROM || 'noreply@signalpro.com';

    if (!smtpHost) {
      console.warn('⚠️ SMTP_HOST not configured. Email notifications will not work.');
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser && smtpPass ? {
        user: smtpUser,
        pass: smtpPass,
      } : undefined,
    });
  }

  async sendSignalAlert(emails: string[], assetSymbol: string, strategyName: string, signalType: string, price: number, ema50: number, ema200: number): Promise<boolean> {
    if (!emails || emails.length === 0) {
      console.log('No email recipients configured');
      return false;
    }

    try {
      const subject = `🚨 Trading Signal: ${assetSymbol} - ${strategyName}`;
      
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
              .container { max-width: 600px; margin: 20px auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .header { border-bottom: 3px solid #0066ff; padding-bottom: 15px; margin-bottom: 20px; }
              .header h1 { margin: 0; color: #0066ff; font-size: 24px; }
              .signal-type { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; margin-top: 10px; }
              .bullish { background-color: #10b981; color: white; }
              .bearish { background-color: #ef4444; color: white; }
              .data-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .data-label { color: #666; font-weight: bold; }
              .data-value { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #0066ff; }
              .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📊 Trading Signal Alert</h1>
                <span class="signal-type ${signalType.includes('bullish') || signalType.includes('reversal') ? 'bullish' : 'bearish'}">
                  ${signalType.toUpperCase()}
                </span>
              </div>
              
              <h2 style="margin-top: 0; color: #333;">Asset: <span style="color: #0066ff;">${assetSymbol}</span></h2>
              <p style="margin-top: 0; color: #666;">Strategy: <strong>${strategyName}</strong></p>
              
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <div class="data-row">
                  <span class="data-label">Current Price:</span>
                  <span class="data-value">$${price.toFixed(2)}</span>
                </div>
                <div class="data-row">
                  <span class="data-label">EMA 50:</span>
                  <span class="data-value">$${ema50.toFixed(2)}</span>
                </div>
                <div class="data-row">
                  <span class="data-label">EMA 200:</span>
                  <span class="data-value">$${ema200.toFixed(2)}</span>
                </div>
              </div>
              
              <p style="color: #666; margin: 20px 0;">
                This is an automated signal from SignalPro. Visit your dashboard to manage this signal.
              </p>
              
              <div class="footer">
                <p>SignalPro - Professional Trading Signals</p>
                <p>Do not reply to this email. It is automatically generated.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const textContent = `
Trading Signal Alert

Asset: ${assetSymbol}
Strategy: ${strategyName}
Signal Type: ${signalType}

Current Price: $${price.toFixed(2)}
EMA 50: $${ema50.toFixed(2)}
EMA 200: $${ema200.toFixed(2)}

Visit your SignalPro dashboard for more details.
      `;

      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@signalpro.com',
        to: emails.join(','),
        subject: subject,
        text: textContent,
        html: htmlContent,
      });

      console.log(`✅ Email sent to ${emails.join(', ')}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  async sendTestEmail(email: string): Promise<boolean> {
    if (!email) {
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@signalpro.com',
        to: email,
        subject: '✅ SignalPro Email Test',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; background-color: #f5f5f5;">
              <div style="max-width: 600px; margin: 20px auto; background: white; padding: 20px; border-radius: 8px;">
                <h1 style="color: #0066ff;">📧 Email Configuration Test</h1>
                <p style="color: #333; font-size: 16px;">
                  Your email configuration is working correctly! 🎉
                </p>
                <p style="color: #666;">
                  You will now receive trading signals and notifications from SignalPro.
                </p>
                <p style="margin-top: 30px; color: #999; font-size: 12px;">
                  SignalPro - Professional Trading Signals
                </p>
              </div>
            </body>
          </html>
        `,
        text: 'Your email configuration is working correctly!',
      });

      console.log(`✅ Test email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send test email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
