// Registers the Telegram webhook and bot commands.
// Usage: TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… APP_URL=https://your.app node scripts/telegram-setup.mjs
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.APP_URL;
if (!token || !secret || !appUrl) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL');
  process.exit(1);
}
const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

console.log(await api('setWebhook', { url: `${appUrl}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message'] }));
console.log(
  await api('setMyCommands', {
    commands: [
      { command: 'home', description: "I'm home: check in" },
      { command: 'status', description: 'Last check-in and next deadline' },
      { command: 'help', description: 'Help' },
    ],
  }),
);
console.log(await api('getMe', {}));
