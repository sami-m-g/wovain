import { linkTelegramChat, TELEGRAM_COPY } from "@wovain/mastra/flow/alerts";
import { startTokenOf } from "@wovain/mastra/flow/telegram";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { useLogger as getRequestLogger, withEvlog } from "@/lib/evlog";
import { alerts, core, db } from "@/services";

// wovain's Telegram bot webhook (openspec alerts). Telegram posts each
// message here with the secret token setWebhook gave it
// (core.telegram.org/bots/api#setwebhook). /start <token> from the
// Settings deep link links the chat to the merchant; anything else gets the
// way to connect. 200 unless linking failed, so Telegram resends only then.

const update = z.object({
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string() }),
      from: z.object({ username: z.string().optional() }).optional(),
      text: z.string().optional(),
    })
    .optional(),
});

const OK = () => new Response(null, { status: 200 });

const handleUpdate = async (request: NextRequest) => {
  const bot = alerts.telegram;
  if (
    bot === undefined ||
    !bot.verifies(request.headers.get("x-telegram-bot-api-secret-token"))
  ) {
    return new Response(null, { status: 401 });
  }
  // A body that isn't JSON is logged and acknowledged, so Telegram drops it.
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error ? error : new Error(String(error))
    );
    return OK();
  }
  const parsed = update.safeParse(body);
  const message = parsed.success ? parsed.data.message : undefined;
  // Only private chats link: a group would show alerts to everyone in it.
  if (message === undefined || message.chat.type !== "private") {
    return OK();
  }
  const chatId = String(message.chat.id);
  const token = startTokenOf(message.text);
  // A failed link answers 500, so Telegram sends the update again and the
  // token stays usable.
  let linked: Awaited<ReturnType<typeof linkTelegramChat>>;
  try {
    linked =
      token === undefined
        ? undefined
        : await linkTelegramChat(
            db,
            token,
            { id: chatId, username: message.from?.username },
            async (userId) => await core.flags.isOn("alerts", { userId })
          );
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error ? error : new Error(String(error))
    );
    return new Response(null, { status: 500 });
  }
  const copy = TELEGRAM_COPY[linked?.locale ?? "en"];
  try {
    await bot.send(chatId, {
      text: linked === undefined ? copy.expired : copy.connected,
    });
  } catch (error) {
    // The chat is linked; only the reply failed.
    getRequestLogger().error(
      error instanceof Error ? error : new Error(String(error))
    );
  }
  return OK();
};

export const POST = withEvlog(handleUpdate);
