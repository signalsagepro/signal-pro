import nodemailer from 'nodemailer';
import type { NotificationConfig, Signal, Asset, Strategy } from "@shared/schema";

export interface NotificationPayload {
  signal: Signal;
  asset: Asset;
  strategy: Strategy;
}

export interface NotificationResult {
  success: boolean;
  channel: string;
  message: string;
  timestamp: Date;
}

export interface INotificationChannel {
  name: string;
  send(payload: NotificationPayload, config: Record<string, any>): Promise<NotificationResult>;
  test(config: Record<string, any>): Promise<NotificationResult>;
  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] };
}

/**
 * Format signal data for notifications
 */
function formatSignalMessage(payload: NotificationPayload): { subject: string; text: string; html: string } {
  const { signal, asset, strategy } = payload;
  const signalTypeDisplay = signal.type.replace(/_/g, ' ').toUpperCase();
  const isBullish = signal.type.includes('bullish') || signal.type.includes('reversal') || signal.type.includes('above');
  const emoji = isBullish ? '🟢' : '🔴';
  const direction = isBullish ? 'BULLISH' : 'BEARISH';

  const subject = `${emoji} ${direction} Signal: ${asset.symbol} - ${strategy.name}`;

  const text = `
Trading Signal Alert
=====================

Asset: ${asset.symbol} (${asset.name})
Exchange: ${asset.exchange || 'N/A'}
Strategy: ${strategy.name}
Signal Type: ${signalTypeDisplay}
Timeframe: ${signal.timeframe}

Current Price: ${signal.price.toFixed(4)}
EMA 50: ${signal.ema50.toFixed(4)}
EMA 200: ${signal.ema200.toFixed(4)}

Time: ${new Date(signal.createdAt).toLocaleString()}

---
SignalPro - Professional Trading Signals
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: ${isBullish ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'}; color: white; padding: 24px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-top: 8px; }
    .content { padding: 24px; }
    .asset-info { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .asset-info h2 { margin: 0 0 4px 0; color: #1e293b; font-size: 20px; }
    .asset-info p { margin: 0; color: #64748b; font-size: 14px; }
    .data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
    .data-item { text-align: center; padding: 16px; background: #f8fafc; border-radius: 8px; }
    .data-item .label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .data-item .value { font-size: 18px; font-weight: 600; color: #1e293b; font-family: 'SF Mono', 'Monaco', monospace; }
    .strategy-info { border-left: 4px solid ${isBullish ? '#10b981' : '#ef4444'}; padding-left: 16px; margin-bottom: 20px; }
    .strategy-info .label { font-size: 12px; color: #64748b; }
    .strategy-info .name { font-size: 16px; font-weight: 600; color: #1e293b; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${emoji} ${direction} Signal</h1>
      <span class="badge">${signal.timeframe} Timeframe</span>
    </div>
    <div class="content">
      <div class="asset-info">
        <h2>${asset.symbol}</h2>
        <p>${asset.name} • ${asset.exchange || 'N/A'}</p>
      </div>
      <div class="data-grid">
        <div class="data-item">
          <div class="label">Current Price</div>
          <div class="value">${signal.price.toFixed(4)}</div>
        </div>
        <div class="data-item">
          <div class="label">EMA 50</div>
          <div class="value">${signal.ema50.toFixed(4)}</div>
        </div>
        <div class="data-item">
          <div class="label">EMA 200</div>
          <div class="value">${signal.ema200.toFixed(4)}</div>
        </div>
      </div>
      <div class="strategy-info">
        <div class="label">Strategy</div>
        <div class="name">${strategy.name}</div>
      </div>
      <p style="color: #64748b; font-size: 14px; margin: 0;">
        Signal Type: <strong>${signalTypeDisplay}</strong><br>
        Generated at: ${new Date(signal.createdAt).toLocaleString()}
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0;">SignalPro - Professional Trading Signals</p>
      <p style="margin: 4px 0 0 0;">This is an automated notification. Do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Email Notification Channel
 */
export class EmailChannel implements INotificationChannel {
  name = "email";

  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.smtpHost) errors.push("SMTP host is required");
    if (!config.smtpPort) errors.push("SMTP port is required");
    if (!config.smtpUser) errors.push("SMTP username is required");
    if (!config.smtpPassword) errors.push("SMTP password is required");
    if (!config.recipients || (Array.isArray(config.recipients) && config.recipients.length === 0)) {
      errors.push("At least one recipient email is required");
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = Array.isArray(config.recipients) ? config.recipients : [config.recipients];
    for (const email of recipients) {
      if (email && !emailRegex.test(email)) {
        errors.push(`Invalid email format: ${email}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private createTransporter(config: Record<string, any>) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: parseInt(config.smtpPort),
      secure: parseInt(config.smtpPort) === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs
      },
    });
  }

  async send(payload: NotificationPayload, config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const transporter = this.createTransporter(config);
      const { subject, text, html } = formatSignalMessage(payload);
      const recipients = Array.isArray(config.recipients) ? config.recipients : [config.recipients];

      await transporter.sendMail({
        from: config.fromEmail || config.smtpUser,
        to: recipients.join(','),
        subject,
        text,
        html,
      });

      return {
        success: true,
        channel: this.name,
        message: `Email sent to ${recipients.length} recipient(s)`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Email error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  async test(config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const transporter = this.createTransporter(config);
      const recipients = Array.isArray(config.recipients) ? config.recipients : [config.recipients];

      await transporter.sendMail({
        from: config.fromEmail || config.smtpUser,
        to: recipients[0],
        subject: '✅ SignalPro Email Test',
        text: 'Your email configuration is working correctly!',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #10b981;">✅ Email Configuration Test</h2>
            <p>Your email notification channel is configured correctly.</p>
            <p style="color: #666;">You will now receive trading signals via email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">SignalPro - Professional Trading Signals</p>
          </div>
        `,
      });

      return {
        success: true,
        channel: this.name,
        message: 'Test email sent successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }
}

/**
 * SMS Notification Channel (Twilio)
 */
export class SMSChannel implements INotificationChannel {
  name = "sms";

  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.twilioAccountSid) errors.push("Twilio Account SID is required");
    if (!config.twilioAuthToken) errors.push("Twilio Auth Token is required");
    if (!config.twilioPhoneNumber) errors.push("Twilio Phone Number (sender) is required");
    if (!config.phoneNumbers || (Array.isArray(config.phoneNumbers) && config.phoneNumbers.length === 0)) {
      errors.push("At least one recipient phone number is required");
    }

    return { valid: errors.length === 0, errors };
  }

  async send(payload: NotificationPayload, config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const { signal, asset, strategy } = payload;
      const isBullish = signal.type.includes('bullish') || signal.type.includes('reversal');
      const emoji = isBullish ? '🟢' : '🔴';
      
      const message = `${emoji} SignalPro Alert\n${asset.symbol}: ${strategy.name}\nPrice: ${signal.price.toFixed(4)}\nEMA50: ${signal.ema50.toFixed(4)}\nEMA200: ${signal.ema200.toFixed(4)}`;

      const phoneNumbers = Array.isArray(config.phoneNumbers) ? config.phoneNumbers : [config.phoneNumbers];
      const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

      let successCount = 0;
      for (const phone of phoneNumbers) {
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: phone,
              From: config.twilioPhoneNumber,
              Body: message,
            }),
          }
        );
        if (response.ok) successCount++;
      }

      return {
        success: successCount > 0,
        channel: this.name,
        message: `SMS sent to ${successCount}/${phoneNumbers.length} recipient(s)`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `SMS error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  async test(config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const phoneNumbers = Array.isArray(config.phoneNumbers) ? config.phoneNumbers : [config.phoneNumbers];
      const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: phoneNumbers[0],
            From: config.twilioPhoneNumber,
            Body: '✅ SignalPro SMS Test - Configuration successful!',
          }),
        }
      );

      if (response.ok) {
        return {
          success: true,
          channel: this.name,
          message: 'Test SMS sent successfully',
          timestamp: new Date(),
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          channel: this.name,
          message: `Twilio error: ${error.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }
}

/**
 * Discord Webhook Notification Channel
 */
export class DiscordChannel implements INotificationChannel {
  name = "discord";

  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.webhookUrl) {
      errors.push("Discord webhook URL is required");
    } else if (!config.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      errors.push("Invalid Discord webhook URL format");
    }

    return { valid: errors.length === 0, errors };
  }

  async send(payload: NotificationPayload, config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const { signal, asset, strategy } = payload;
      const isBullish = signal.type.includes('bullish') || signal.type.includes('reversal') || signal.type.includes('above');
      const color = isBullish ? 0x10b981 : 0xef4444;

      const embed = {
        title: `${isBullish ? '🟢' : '🔴'} ${asset.symbol} - ${strategy.name}`,
        description: `**${signal.type.replace(/_/g, ' ').toUpperCase()}**`,
        color,
        fields: [
          { name: '💰 Price', value: signal.price.toFixed(4), inline: true },
          { name: '📊 EMA 50', value: signal.ema50.toFixed(4), inline: true },
          { name: '📈 EMA 200', value: signal.ema200.toFixed(4), inline: true },
          { name: '⏱️ Timeframe', value: signal.timeframe, inline: true },
          { name: '🏦 Exchange', value: asset.exchange || 'N/A', inline: true },
          { name: '📋 Type', value: asset.type, inline: true },
        ],
        footer: { text: 'SignalPro - Professional Trading Signals' },
        timestamp: new Date(signal.createdAt).toISOString(),
      };

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (response.ok || response.status === 204) {
        return {
          success: true,
          channel: this.name,
          message: 'Discord notification sent',
          timestamp: new Date(),
        };
      } else {
        const error = await response.text();
        return {
          success: false,
          channel: this.name,
          message: `Discord error: ${error}`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Discord error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  async test(config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '✅ SignalPro Test',
            description: 'Discord webhook is configured correctly!',
            color: 0x10b981,
            footer: { text: 'SignalPro - Professional Trading Signals' },
            timestamp: new Date().toISOString(),
          }],
        }),
      });

      if (response.ok || response.status === 204) {
        return {
          success: true,
          channel: this.name,
          message: 'Test notification sent to Discord',
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          channel: this.name,
          message: 'Failed to send to Discord',
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }
}

/**
 * Telegram Bot Notification Channel
 */
export class TelegramChannel implements INotificationChannel {
  name = "telegram";
  private baseUrl = "https://api.telegram.org";

  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.botToken) errors.push("Telegram Bot Token is required");
    if (!config.chatId) errors.push("Telegram Chat ID is required");

    return { valid: errors.length === 0, errors };
  }

  async send(payload: NotificationPayload, config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const { signal, asset, strategy } = payload;
      const isBullish = signal.type.includes('bullish') || signal.type.includes('reversal') || signal.type.includes('above');
      const emoji = isBullish ? '🟢' : '🔴';

      const message = `
${emoji} *${asset.symbol}* - ${strategy.name}

📊 *Signal:* ${signal.type.replace(/_/g, ' ').toUpperCase()}
⏱ *Timeframe:* ${signal.timeframe}

💰 *Price:* \`${signal.price.toFixed(4)}\`
📈 *EMA 50:* \`${signal.ema50.toFixed(4)}\`
📉 *EMA 200:* \`${signal.ema200.toFixed(4)}\`

🏦 *Exchange:* ${asset.exchange || 'N/A'}
🕐 *Time:* ${new Date(signal.createdAt).toLocaleString()}

_SignalPro - Professional Trading Signals_
      `.trim();

      const response = await fetch(`${this.baseUrl}/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });

      if (response.ok) {
        return {
          success: true,
          channel: this.name,
          message: 'Telegram notification sent',
          timestamp: new Date(),
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          channel: this.name,
          message: `Telegram error: ${error.description || 'Unknown error'}`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Telegram error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  async test(config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: '✅ *SignalPro Test*\n\nTelegram bot is configured correctly!',
          parse_mode: 'Markdown',
        }),
      });

      if (response.ok) {
        return {
          success: true,
          channel: this.name,
          message: 'Test message sent to Telegram',
          timestamp: new Date(),
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          channel: this.name,
          message: `Telegram error: ${error.description || 'Unknown error'}`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }
}

/**
 * Custom Webhook Notification Channel
 */
export class WebhookChannel implements INotificationChannel {
  name = "webhook";

  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.url) {
      errors.push("Webhook URL is required");
    } else {
      try {
        const url = new URL(config.url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push("Webhook URL must use HTTP or HTTPS");
        }
      } catch {
        errors.push("Invalid webhook URL format");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async send(payload: NotificationPayload, config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const { signal, asset, strategy } = payload;

      const webhookPayload = {
        event: 'signal.created',
        timestamp: new Date().toISOString(),
        data: {
          signal: {
            id: signal.id,
            type: signal.type,
            timeframe: signal.timeframe,
            price: signal.price,
            ema50: signal.ema50,
            ema200: signal.ema200,
            createdAt: signal.createdAt,
          },
          asset: {
            id: asset.id,
            symbol: asset.symbol,
            name: asset.name,
            type: asset.type,
            exchange: asset.exchange,
          },
          strategy: {
            id: strategy.id,
            name: strategy.name,
            type: strategy.type,
            timeframe: strategy.timeframe,
          },
        },
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add custom headers if configured
      if (config.headers && typeof config.headers === 'object') {
        Object.assign(headers, config.headers);
      }

      // Add auth header if configured
      if (config.authHeader && config.authValue) {
        headers[config.authHeader] = config.authValue;
      }

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers,
        body: JSON.stringify(webhookPayload),
      });

      if (response.ok) {
        return {
          success: true,
          channel: this.name,
          message: `Webhook delivered (${response.status})`,
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          channel: this.name,
          message: `Webhook failed: HTTP ${response.status}`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Webhook error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  async test(config: Record<string, any>): Promise<NotificationResult> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        channel: this.name,
        message: `Configuration error: ${validation.errors.join(', ')}`,
        timestamp: new Date(),
      };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.headers && typeof config.headers === 'object') {
        Object.assign(headers, config.headers);
      }

      if (config.authHeader && config.authValue) {
        headers[config.authHeader] = config.authValue;
      }

      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers,
        body: JSON.stringify({
          event: 'test',
          timestamp: new Date().toISOString(),
          message: 'SignalPro webhook test - configuration successful!',
        }),
      });

      if (response.ok) {
        return {
          success: true,
          channel: this.name,
          message: 'Webhook test successful',
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          channel: this.name,
          message: `Webhook test failed: HTTP ${response.status}`,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }
}

/**
 * Notification Service - Manages all notification channels
 */
export class NotificationService {
  private channels: Map<string, INotificationChannel> = new Map();

  constructor() {
    this.channels.set('email', new EmailChannel());
    this.channels.set('sms', new SMSChannel());
    this.channels.set('discord', new DiscordChannel());
    this.channels.set('telegram', new TelegramChannel());
    this.channels.set('webhook', new WebhookChannel());
  }

  getChannel(name: string): INotificationChannel | undefined {
    return this.channels.get(name.toLowerCase());
  }

  async sendNotification(
    payload: NotificationPayload,
    config: NotificationConfig
  ): Promise<NotificationResult> {
    const channel = this.getChannel(config.channel);
    if (!channel) {
      return {
        success: false,
        channel: config.channel,
        message: `Unknown notification channel: ${config.channel}`,
        timestamp: new Date(),
      };
    }

    if (!config.enabled) {
      return {
        success: false,
        channel: config.channel,
        message: 'Notification channel is disabled',
        timestamp: new Date(),
      };
    }

    const configData = config.config as Record<string, any>;
    return channel.send(payload, configData);
  }

  async sendToAllEnabled(
    payload: NotificationPayload,
    configs: NotificationConfig[]
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const enabledConfigs = configs.filter(c => c.enabled);

    for (const config of enabledConfigs) {
      const result = await this.sendNotification(payload, config);
      results.push(result);
    }

    return results;
  }

  async testChannel(config: NotificationConfig): Promise<NotificationResult> {
    const channel = this.getChannel(config.channel);
    if (!channel) {
      return {
        success: false,
        channel: config.channel,
        message: `Unknown notification channel: ${config.channel}`,
        timestamp: new Date(),
      };
    }

    const configData = config.config as Record<string, any>;
    return channel.test(configData);
  }

  validateChannelConfig(channelName: string, config: Record<string, any>): { valid: boolean; errors: string[] } {
    const channel = this.getChannel(channelName);
    if (!channel) {
      return { valid: false, errors: [`Unknown channel: ${channelName}`] };
    }
    return channel.validateConfig(config);
  }

  getSupportedChannels(): string[] {
    return Array.from(this.channels.keys());
  }
}

export const notificationService = new NotificationService();
