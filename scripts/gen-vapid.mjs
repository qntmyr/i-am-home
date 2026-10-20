// Generates a VAPID key pair for Web Push. Run: node scripts/gen-vapid.mjs
import { webcrypto } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await webcrypto.subtle.exportKey('raw', keys.publicKey);
const priv = await webcrypto.subtle.exportKey('jwk', keys.privateKey);

console.log('Add these to your Worker secrets (wrangler secret put …) or to .dev.vars:\n');
console.log(`VAPID_PUBLIC_KEY=${b64url(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
