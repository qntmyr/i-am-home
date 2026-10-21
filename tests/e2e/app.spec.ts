import { expect, test, type Page } from '@playwright/test';

/** Signs in through the DEV_MODE magic link and returns the user's email. */
async function signIn(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto('/login');
  await page.fill('input[type=email]', email);
  await page.click('button[type=submit]');
  await page.click('[data-testid=dev-link]');
  await page.waitForURL('**/app');
  await expect(page.getByTestId('checkin')).toBeVisible();
  return email;
}

test('landing page renders and switches language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Tell them you got home');
  await page.selectOption('.lang-switch select', 'fr');
  await expect(page.locator('h1')).toContainText('Dis-leur que tu es rentré');
  await page.selectOption('.lang-switch select', 'cs');
  await expect(page.locator('h1')).toContainText('Dej jim vědět');
  await page.selectOption('.lang-switch select', 'en');
  await expect(page.locator('h1')).toContainText('Tell them you got home');
});

test('terms page is reachable from the landing footer and warns it is not an emergency service', async ({ page }) => {
  await page.goto('/');
  await page.click('footer a[href="/terms"]');
  await expect(page.locator('h1')).toContainText('Terms of service');
  await expect(page.locator('.notice')).toContainText('112');
});

test('admin stats need the admin token', async ({ request }) => {
  const r = await request.get('/api/admin/stats');
  expect(r.status()).toBe(401);
});

test('protected routes redirect to login', async ({ page }) => {
  await page.goto('/app/rules');
  await page.waitForURL('**/login');
  await expect(page.locator('input[type=email]')).toBeVisible();
});

test('full flow: sign in, contact, rule, check-in, settings', async ({ page }) => {
  await signIn(page);

  // Empty dashboard shows the setup checklist.
  await expect(page.locator('.setup')).toBeVisible();

  // Add a Telegram contact and simulate the contact opening the deep link.
  await page.goto('/app/contacts');
  await page.click('[data-testid=add-contact]');
  await page.fill('.modal-card input[type=text]', 'Mum');
  await page.click('[data-testid=save-contact]');
  const link = await page.locator('.modal-card .code').textContent();
  const token = link!.split('=').pop()!.trim();
  expect(token.startsWith('c_')).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(
    (tok) => fetch('/api/dev/telegram-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, chatId: 'e2e-chat' }) }),
    token,
  );
  await page.reload();
  await expect(page.getByTestId('contact')).toHaveCount(1);
  await expect(page.getByTestId('contact')).toContainText('Connected');

  // Free plan: the add button is disabled after one contact.
  await expect(page.getByTestId('add-contact')).toBeDisabled();

  // Add a recurring rule.
  await page.goto('/app/rules');
  await page.click('[data-testid=add-rule]');
  await page.fill('.modal-card input[type=text]', 'Back from work');
  await page.fill('.modal-card input[type=time]', '23:59');
  // 24 h window so the check-in below counts whatever time of day the suite runs.
  await page.selectOption('.modal-card select:has(option[value="18"])', '24');
  await page.click('[data-testid=save-rule]');
  await expect(page.getByTestId('rule')).toHaveCount(1);
  await expect(page.getByTestId('rule')).toContainText('Back from work');
  await expect(page.getByTestId('rule')).toContainText('Next:');

  // Dashboard shows the deadline, check-in satisfies it.
  await page.goto('/app');
  await expect(page.locator('.next-card')).toContainText('Mum will be told');
  await page.click('[data-testid=checkin]');
  await expect(page.locator('.toast')).toContainText('Told Mum');
  await expect(page.locator('.next-card')).toContainText('Already covered');
  await expect(page.locator('.events')).toContainText('You checked in');

  // The contact got the announcement (dev outbox).
  const outbox = await page.evaluate(async () => (await (await fetch('/api/dev/outbox')).json()) as { outbox: Array<{ channel: string; text: string }> });
  expect(outbox.outbox.some((m) => m.channel === 'telegram' && m.text.includes('is home safe'))).toBe(true);

  // Secret hook checks in without a session.
  await page.goto('/app/settings');
  const hookUrl = (await page.getByTestId('hook-url').textContent())!.trim();
  const res = await page.request.get(hookUrl + '?note=wifi');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('checked in');

  // Settings: rename and switch to French.
  await page.fill('form.card input[type=text]', 'Quentin');
  await page.selectOption('form.card select >> nth=1', 'fr');
  await page.click('form.card button[type=submit]');
  await expect(page.locator('h1')).toContainText('Réglages');

  // Sign out.
  await page.click('[data-testid=logout]');
  await page.waitForURL('**/');
});

test('scheduler alerts contacts when a deadline is missed', async ({ page }) => {
  await signIn(page);
  // Email contact (no linking needed).
  await page.goto('/app/contacts');
  await page.click('[data-testid=add-contact]');
  await page.fill('.modal-card input[type=text]', 'Dad');
  await page.selectOption('.modal-card select', 'email');
  await page.fill('.modal-card input[type=email]', 'dad@example.com');
  await page.click('[data-testid=save-contact]');
  await expect(page.getByTestId('contact')).toHaveCount(1);

  // One-off rule 2 minutes from now, then run the scheduler "in the future".
  const onceAt = Date.now() + 2 * 60_000;
  await page.evaluate(async (at) => {
    const contacts = (await (await fetch('/api/contacts')).json()) as { contacts: Array<{ id: string }> };
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'once', name: 'Tonight', onceAt: at, contactIds: contacts.contacts.map((c) => c.id), remindBeforeMin: 0 }),
    });
  }, onceAt);
  const tick = await page.evaluate(async (at) => (await (await fetch(`/api/dev/tick?now=${at + 60_000}`, { method: 'POST' })).json()) as { alerts: number }, onceAt);
  expect(tick.alerts).toBe(1);

  await page.goto('/app');
  await expect(page.locator('.events')).toContainText('Alert sent to Dad');
  const outbox = await page.evaluate(async () => (await (await fetch('/api/dev/outbox')).json()) as { outbox: Array<{ channel: string; to: string; text: string }> });
  expect(outbox.outbox.some((m) => m.channel === 'email' && m.to === 'dad@example.com' && m.text.includes("hasn't checked in"))).toBe(true);
});
