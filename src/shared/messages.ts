// Text of the messages sent to contacts and users, in the user's locale.
import type { Locale } from './types';

export interface MessageContext {
  userName: string;
  contactName: string;
  time: string; // local time "HH:MM"
  deadline?: string;
  custom?: string;
  appUrl: string;
}

type Template = (c: MessageContext) => string;

const T: Record<Locale, Record<string, Template>> = {
  en: {
    announce: (c) => `🏠 ${c.userName} is home safe (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} hasn't checked in by ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nThis is an automatic message from I am home. It only means no check-in was received; it may be worth a call.`,
    reminder: (c) =>
      `⏰ Reminder: you haven't checked in yet. ${c.contactName} will be told at ${c.deadline ?? c.time} if you don't. Tap "I'm home" or reply /home.`,
    contactLinked: (c) => `✅ You're linked. You'll get a message when ${c.userName} is home, or if a check-in is missed.`,
    userLinked: () => `✅ Your account is linked. Send /home any time to check in.`,
    testContact: (c) => `👋 Test from ${c.userName} via I am home. You'll get messages like this one.`,
    checkinAck: (c) => `🏠 Checked in at ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} checked in before ${c.deadline ?? c.time}.`,
    magicSubject: () => 'Your sign-in link for I am home',
    magicBody: (c) => `Hi,\n\nClick to sign in to I am home: ${c.custom}\n\nThe link is valid for 15 minutes. If you didn't ask for it, ignore this email.`,
  },
  fr: {
    announce: (c) => `🏠 ${c.userName} est bien rentré·e (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} n'a pas signalé son retour avant ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nMessage automatique de I am home : aucun check-in n'a été reçu, un appel peut valoir le coup.`,
    reminder: (c) =>
      `⏰ Rappel : tu n'as pas encore fait ton check-in. ${c.contactName} sera prévenu·e à ${c.deadline ?? c.time} sinon. Appuie sur « Je suis rentré » ou réponds /home.`,
    contactLinked: (c) => `✅ C'est lié. Tu recevras un message quand ${c.userName} est rentré·e, ou si un check-in est manqué.`,
    userLinked: () => `✅ Ton compte est lié. Envoie /home à tout moment pour faire ton check-in.`,
    testContact: (c) => `👋 Test envoyé par ${c.userName} via I am home. Tu recevras des messages comme celui-ci.`,
    checkinAck: (c) => `🏠 Check-in enregistré à ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} a fait son check-in avant ${c.deadline ?? c.time}.`,
    magicSubject: () => 'Ton lien de connexion à I am home',
    magicBody: (c) => `Bonjour,\n\nClique pour te connecter à I am home : ${c.custom}\n\nLe lien est valable 15 minutes. Si tu n'as rien demandé, ignore cet email.`,
  },
};

export function message(locale: Locale, key: keyof (typeof T)['en'], ctx: MessageContext): string {
  const table = T[locale] ?? T.en;
  const fn = table[key] ?? T.en[key];
  return fn ? fn(ctx) : '';
}

export function normalizeLocale(input: string | null | undefined): Locale {
  return (input ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
