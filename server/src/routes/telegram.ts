import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import telegramService from '../services/notifications/TelegramService';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
  res.sendStatus(200);

  try {
    const update  = req.body;
    const message = update?.message;
    if (!message) return;

    const chatId    = String(message.chat.id);
    const text      = message.text ?? '';
    const firstName = message.from?.first_name ?? 'there';

    // Resolve bot token for this chat (for outgoing replies)
    const resolveToken = async (): Promise<string> => {
      const u = await prisma.userSettings.findFirst({
        where:  { telegramChatId: chatId },
        select: { telegramBotToken: true } as any,
      });
      return (u as any)?.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
    };

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const token = parts[1]?.trim();

      if (!token) {
        const replyToken = await resolveToken();
        await telegramService.sendMessage(chatId,
          `👋 Hi ${firstName}! I'm <b>RIA BOT</b> — your autonomous trading assistant.\n\n` +
          `To receive trade alerts, go to <b>Settings → Telegram Alerts</b> in the RIA BOT app and follow the setup steps.`,
          replyToken, 'HTML',
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
        const replyToken = await resolveToken();
        await telegramService.sendMessage(chatId,
          `❌ This link has expired or is invalid.\n\nPlease go back to <b>Settings → Telegram Alerts</b> and generate a new connect link.`,
          replyToken, 'HTML',
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

      const updatedSettings = await prisma.userSettings.findUnique({
        where:  { id: settings.id },
        select: { telegramBotToken: true } as any,
      });
      const replyToken = (updatedSettings as any)?.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';

      await telegramService.sendMessage(chatId,
        `✅ <b>RIA BOT connected!</b>\n\nHi ${name}! You'll now receive:\n` +
        `• 🟢 Trade placed alerts\n` +
        `• 🔴 Position closed alerts\n` +
        `• 📊 Daily summary at 4:00 PM ET\n` +
        `• 🚨 Circuit breaker warnings\n\n` +
        `To disconnect, go to <b>Settings</b> in the app.\n\n` +
        `<i>Commands: /stop to pause · /status to check</i>`,
        replyToken, 'HTML',
      );

    } else if (text === '/stop' || text === '/disconnect') {
      const userSettings = await prisma.userSettings.findFirst({
        where:  { telegramChatId: chatId },
        select: { id: true, telegramBotToken: true } as any,
      });
      if (userSettings) {
        await prisma.userSettings.update({
          where: { id: (userSettings as any).id },
          data:  { telegramEnabled: false },
        });
        const replyToken = (userSettings as any).telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
        await telegramService.sendMessage(chatId,
          `⏸ <b>Notifications paused.</b>\n\nYou won't receive any more alerts. To re-enable, go to Settings → Telegram Alerts in the app.`,
          replyToken, 'HTML',
        );
      } else {
        await telegramService.sendMessage(chatId,
          `You don't have an active RIA BOT connection.`,
          process.env.TELEGRAM_BOT_TOKEN ?? '', 'HTML',
        );
      }

    } else if (text === '/status') {
      const userSettings = await prisma.userSettings.findFirst({
        where:  { telegramChatId: chatId },
        select: { telegramEnabled: true, autoTradeEnabled: true, telegramBotToken: true } as any,
      });
      if (userSettings) {
        const replyToken = (userSettings as any).telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
        await telegramService.sendMessage(chatId,
          `📊 <b>RIA BOT Status</b>\n\n` +
          `Notifications: ${(userSettings as any).telegramEnabled ? '✅ Active' : '⏸ Paused'}\n` +
          `Auto-trading: ${(userSettings as any).autoTradeEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
          `Commands: /stop to pause, /status to check`,
          replyToken, 'HTML',
        );
      } else {
        await telegramService.sendMessage(chatId,
          `Not connected to a RIA BOT account.`,
          process.env.TELEGRAM_BOT_TOKEN ?? '', 'HTML',
        );
      }
    }

  } catch (err: any) {
    console.error('[Telegram Webhook]', err?.message);
  }
});

router.post('/register-webhook', async (req: Request, res: Response) => {
  const token = req.body?.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(400).json({ success: false, error: 'No bot token provided' });

  const webhookUrl = `${process.env.APP_URL ?? 'https://ria-bot.replit.app'}/api/telegram/webhook`;
  try {
    const axiosLib = (await import('axios')).default;
    const { data } = await axiosLib.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      { url: webhookUrl, allowed_updates: ['message'] },
      { timeout: 10_000 },
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

export default router;
