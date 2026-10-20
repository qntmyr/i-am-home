import { Hono } from 'hono';
import type { Env } from './env';
import { api } from './routes/api';
import { telegram } from './routes/telegram';
import { billing } from './routes/billing';
import { runTick } from './scheduler';
import { HttpError } from './util';
import type { Vars } from './auth';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('/api/*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-content-type-options', 'nosniff');
});

app.get('/api/health', (c) => c.json({ ok: true, name: c.env.APP_NAME, time: Date.now() }));
app.route('/api/telegram', telegram);
app.route('/api/billing', billing);
app.route('/api', api);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, code: err.code ?? 'error' }, err.status as 400);
  console.error(err);
  return c.json({ error: 'Something went wrong', code: 'internal' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runTick(env).then(
        (r) => console.log('tick', JSON.stringify(r)),
        (e) => console.error('tick failed', e),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
