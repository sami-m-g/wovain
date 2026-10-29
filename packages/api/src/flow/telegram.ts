import { createHash, timingSafeEqual } from "node:crypto";

import { Api, GrammyError } from "grammy";

// wovain's Telegram bot (openspec alerts), on grammY's Bot API client
// (grammy.dev). One bot per environment: its token is the
// `telegram-bot-token` secret (TELEGRAM_BOT_TOKEN), and its webhook points
// at that environment's /api/telegram. The merchant links a chat through a
// deep link, t.me/<bot>?start=<token> (core.telegram.org/bots/features#deep-linking).

export interface TelegramMessage {
  // A button under the message that opens this https URL.
  button?: { text: string; url: string } | undefined;
  text: string;
}

export interface TelegramBot {
  // Points the bot's webhook at `url`, with the secret token.
  ensureWebhook: (url: string) => Promise<void>;
  send: (chatId: string, message: TelegramMessage) => Promise<void>;
  // The bot's @username, for the deep link.
  username: () => Promise<string>;
  // Whether a webhook call carries the bot's secret token
  // (X-Telegram-Bot-Api-Secret-Token, set by setWebhook).
  verifies: (secretHeader: string | null) => boolean;
}

const SECRET_LABEL = "wovain-telegram-webhook:";

// The webhook's secret token, derived from the bot token: Telegram allows
// 1-256 characters of A-Z, a-z, 0-9, _ and -, so hex fits.
export const webhookSecretOf = (botToken: string) =>
  createHash("sha256").update(`${SECRET_LABEL}${botToken}`).digest("hex");

export const telegramBot = (botToken: string): TelegramBot => {
  const api = new Api(botToken);
  const secret = Buffer.from(webhookSecretOf(botToken));
  let me: Promise<string> | undefined;
  return {
    // Set every time: Telegram doesn't show the secret token, so a rotated
    // bot token (a new secret) can't be detected, and setWebhook is
    // idempotent.
    ensureWebhook: async (url) => {
      await api.setWebhook(url, {
        allowed_updates: ["message"],
        secret_token: secret.toString(),
      });
    },
    send: async (chatId, { button, text }) => {
      await api.sendMessage(chatId, text, {
        link_preview_options: { is_disabled: true },
        ...(button === undefined || !button.url.startsWith("https://")
          ? {}
          : {
              reply_markup: {
                inline_keyboard: [[{ text: button.text, url: button.url }]],
              },
            }),
      });
    },
    username: async () => {
      me ??= (async () => {
        const bot = await api.getMe();
        return bot.username;
      })();
      try {
        return await me;
      } catch (error) {
        // Ask again next time rather than keep a failed answer.
        me = undefined;
        throw error;
      }
    },
    verifies: (secretHeader) => {
      if (secretHeader === null) {
        return false;
      }
      const given = Buffer.from(secretHeader);
      return given.length === secret.length && timingSafeEqual(given, secret);
    },
  };
};

const CHAT_GONE = /chat not found|bot was blocked|user is deactivated/iu;

// Telegram refused because the merchant blocked the bot or the chat no
// longer exists: the link is dead, not the service.
export const isChatGone = (error: unknown) =>
  error instanceof GrammyError &&
  (error.error_code === 403 || CHAT_GONE.test(error.description));

// A /start message's link token, or undefined for any other message.
const START = /^\/start(?:@\w+)?\s+(?<token>[\w-]{16,64})$/u;
export const startTokenOf = (text: string | undefined) =>
  text === undefined ? undefined : START.exec(text.trim())?.groups?.["token"];
