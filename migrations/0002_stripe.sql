-- igothome: Stripe customer id, so subscription events can be matched to a user
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
CREATE INDEX users_stripe_customer ON users(stripe_customer_id);
