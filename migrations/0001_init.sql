-- I am home: initial schema
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  tz TEXT NOT NULL DEFAULT 'Europe/Prague',
  locale TEXT NOT NULL DEFAULT 'en',
  plan TEXT NOT NULL DEFAULT 'free',
  plan_until INTEGER,
  ls_customer_id TEXT,
  hook_token TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  telegram_link_token TEXT UNIQUE,
  last_checkin_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX magic_links_email ON magic_links(email, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'email', 'sms', 'whatsapp')),
  address TEXT NOT NULL DEFAULT '',
  telegram_chat_id TEXT,
  link_token TEXT UNIQUE,
  verified INTEGER NOT NULL DEFAULT 0,
  announce_checkins INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX contacts_user ON contacts(user_id);

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('recurring', 'once')),
  name TEXT NOT NULL DEFAULT '',
  time_local TEXT NOT NULL DEFAULT '20:00',
  days INTEGER NOT NULL DEFAULT 127,
  once_at INTEGER,
  window_hours INTEGER NOT NULL DEFAULT 12,
  remind_before_min INTEGER NOT NULL DEFAULT 30,
  message TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  next_fire_at INTEGER,
  next_remind_at INTEGER,
  last_fired_at INTEGER,
  last_result TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX rules_due ON rules(enabled, next_fire_at);
CREATE INDEX rules_remind ON rules(enabled, next_remind_at);
CREATE INDEX rules_user ON rules(user_id);

CREATE TABLE rule_contacts (
  rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, contact_id)
);

CREATE TABLE checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  source TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX checkins_user_at ON checkins(user_id, at);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX events_user_at ON events(user_id, at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_user ON push_subscriptions(user_id);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX deliveries_user_at ON deliveries(user_id, at);
