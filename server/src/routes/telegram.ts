import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import telegramService from '../services/notifications/TelegramService';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
  res.sendStatus(200);

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return;

    const chatId    = String(message.chat.id);
    const text      = message.text ?? '';
    const firstName = message.from?.first_name ?? 'there';

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const token = parts[1]?.trim();

      if (!token) {
        await telegramService.sendMessage(chatId,
          `👋 Hi ${firstName}! I'm <b>RIA BOT</b> — your autonomous trading assistant.\n\n` +
          `To receive trade alerts, go to <b>Settings → Notifications</b> in the RIA BOT app and click <b>Connect Telegram</b>.`,
          'HTML'
        );
        return;
      }

      const settings = await prisma.userSettings.findFirst({
        where: {
          telegramConnectToken:  token,
          telegramConnectExpiry: { gt: new Date() },
        },
        include: { user: { select: { displayName: true, email: true } } },
      });

      if (!settings) {
        await telegramService.sendMessage(chatId,
          `❌ This link has expired or is invalid.\n\nPlease go back to <b>Settings → Notifications</b> and generate a new Connect link.`,
          'HTML'
        );
        return;
      }

      await prisma.userSettings.update({
        where: { id: settings.id },
        data: {
          telegramChatId:        chatId,
          telegramEnabled:       true,
          telegramConsent:       true,
          telegramConsentAt:     new Date(),
          telegramConnectToken:  null,
          telegramConnectExpiry: null,
        },
      });

      const name = settings.user?.displayName ?? settings.user?.email ?? 'Trader';
      await telegramService.sendMessage(chatId,
        `✅ <b>RIA BOT connected!</b>\n\n` +
        `Hi ${name}! You'll now receive:\n` +
        `• 🟢 Trade placed alerts\n` +
        `• 🔴 Position closed alerts\n` +
        `• 📊 Daily summary at 4:00 PM ET\n` +
        `• 🚨 Circuit breaker warnings\n\n` +
        `To disconnect, go to <b>Settings → Notifications</b> in the app.\n\n` +
        `<i>Your chat ID: <code>${chatId}</code></i>`,
        'HTML'
      );

    } else if (text === '/stop' || text === '/disconnect') {
      const settings = await prisma.userSettings.findFirst({ where: { telegramChatId: chatId } });
      if (settings) {
        await prisma.userSettings.update({
          where: { id: settings.id },
          data: { telegramEnabled: false },
        });
        await telegramService.sendMessage(chatId,
          `⏸ <b>Notifications paused.</b>\n\nYou won't receive any more alerts. To re-enable, go to Settings → Notifications in the app.`,
          'HTML'
        );
      } else {
        await telegramService.sendMessage(chatId, `You don't have an active RIA BOT connection.`);
      }

    } else if (text === '/status') {
      const settings = await prisma.userSettings.findFirst({
        where: { telegramChatId: chatId },
        select: { telegramEnabled: true, autoTradeEnabled: true },
      });
      if (settings) {
        await telegramService.sendMessage(chatId,
          `📊 <b>RIA BOT Status</b>\n\n` +
          `Notifications: ${settings.telegramEnabled ? '✅ Active' : '⏸ Paused'}\n` +
          `Auto-trading: ${settings.autoTradeEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
          `Commands: /stop to pause, /status to check`,
          'HTML'
        );
      } else {
        await telegramService.sendMessage(chatId, `Not connected to a RIA BOT account.`);
      }
    }

  } catch (err: any) {
    console.error('[Telegram Webhook]', err?.message);
  }
});

router.post('/register-webhook', async (req: Request, res: Response) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(400).json({ success: false, error: 'TELEGRAM_BOT_TOKEN not set' });

  const webhookUrl = `${process.env.APP_URL ?? 'https://ria-bot.replit.app'}/api/telegram/webhook`;
  try {
    const axios = (await import('axios')).default;
    const { data } = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      { url: webhookUrl, allowed_updates: ['message'] },
      { timeout: 10_000 }
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

export default router;
