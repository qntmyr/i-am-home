// Text of the messages sent to contacts and users, in the user's locale.
// These are delivery messages (Telegram, email, SMS, push), not the PWA UI strings
// which live in src/app/locales/.
import { LOCALES, type Locale } from './types';

export interface MessageContext {
  userName: string;
  contactName: string;
  time: string; // local time "HH:MM"
  deadline?: string;
  custom?: string;
  appUrl: string;
}

type Template = (c: MessageContext) => string;

export type MessageKey =
  | 'announce'
  | 'alert'
  | 'reminder'
  | 'reminderTitle'
  | 'reminderBody'
  | 'contactsFallback'
  | 'alertCopy'
  | 'alertCopyTitle'
  | 'nobody'
  | 'contactLinked'
  | 'userLinked'
  | 'testContact'
  | 'checkinAck'
  | 'ok'
  | 'hookOk'
  | 'tgStatus'
  | 'tgNone'
  | 'tgNotLinked'
  | 'tgHelp'
  | 'pushTest'
  | 'pushTestBody'
  | 'magicSubject'
  | 'magicBody';

const T: Record<Locale, Record<MessageKey, Template>> = {
  en: {
    announce: (c) => `🏠 ${c.userName} is home safe (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} hasn't checked in by ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nThis is an automatic message from I am home. It only means no check-in was received; it may be worth a call.`,
    reminder: (c) =>
      `⏰ Reminder: you haven't checked in yet. ${c.contactName} will be told at ${c.deadline ?? c.time} if you don't. Tap "I'm home" or reply /home.`,
    reminderTitle: () => 'Are you home yet?',
    reminderBody: (c) => `${c.contactName} will be told at ${c.deadline ?? c.time} if you don't check in.`,
    contactsFallback: () => 'your contacts',
    alertCopy: (c) => `⚠️ No check-in by ${c.deadline ?? c.time}: ${c.contactName} has been told.`,
    alertCopyTitle: () => 'Your contacts were alerted',
    nobody: () => 'nobody',
    contactLinked: (c) => `✅ You're linked. You'll get a message when ${c.userName} is home, or if a check-in is missed.`,
    userLinked: () => `✅ Your account is linked. Send /home any time to check in.`,
    testContact: (c) => `👋 Test from ${c.userName} via I am home. You'll get messages like this one.`,
    checkinAck: (c) => `🏠 Checked in at ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} checked in before ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, checked in at ${c.time}.`,
    tgStatus: (c) => `Last check-in: ${c.time}\nNext deadline: ${c.deadline}`,
    tgNone: () => 'none',
    tgNotLinked: (c) => `Not linked. Open ${c.appUrl}/app/settings to connect this chat.`,
    tgHelp: (c) => `/home – check in\n/status – last check-in and next deadline\n${c.appUrl}`,
    pushTest: () => '👋 I am home test notification.',
    pushTestBody: () => 'Notifications are working.',
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
    reminderTitle: () => 'Tu es rentré ?',
    reminderBody: (c) => `${c.contactName} sera prévenu·e à ${c.deadline ?? c.time} si tu ne fais pas ton check-in.`,
    contactsFallback: () => 'tes proches',
    alertCopy: (c) => `⚠️ Pas de check-in avant ${c.deadline ?? c.time} : ${c.contactName} a été prévenu·e.`,
    alertCopyTitle: () => 'Tes proches ont été prévenus',
    nobody: () => 'personne',
    contactLinked: (c) => `✅ C'est lié. Tu recevras un message quand ${c.userName} est rentré·e, ou si un check-in est manqué.`,
    userLinked: () => `✅ Ton compte est lié. Envoie /home à tout moment pour faire ton check-in.`,
    testContact: (c) => `👋 Test envoyé par ${c.userName} via I am home. Tu recevras des messages comme celui-ci.`,
    checkinAck: (c) => `🏠 Check-in enregistré à ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} a fait son check-in avant ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, check-in enregistré à ${c.time}.`,
    tgStatus: (c) => `Dernier check-in : ${c.time}\nProchaine échéance : ${c.deadline}`,
    tgNone: () => 'aucune',
    tgNotLinked: (c) => `Pas encore lié. Ouvre ${c.appUrl}/app/settings pour connecter cette conversation.`,
    tgHelp: (c) => `/home – faire ton check-in\n/status – dernier check-in et prochaine échéance\n${c.appUrl}`,
    pushTest: () => '👋 Test de notification I am home.',
    pushTestBody: () => 'Les notifications fonctionnent.',
    magicSubject: () => 'Ton lien de connexion à I am home',
    magicBody: (c) => `Bonjour,\n\nClique pour te connecter à I am home : ${c.custom}\n\nLe lien est valable 15 minutes. Si tu n'as rien demandé, ignore cet email.`,
  },
  cs: {
    announce: (c) => `🏠 ${c.userName} je v pořádku doma (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} se do ${c.deadline ?? c.time} neohlásil/a.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nToto je automatická zpráva z I am home. Znamená jen, že nepřišlo žádné ohlášení; možná stojí za to zavolat.`,
    reminder: (c) =>
      `⏰ Připomínka: ještě ses neohlásil/a. Pokud se neohlásíš, ${c.contactName} dostane zprávu v ${c.deadline ?? c.time}. Klepni na „Jsem doma“ nebo odpověz /home.`,
    reminderTitle: () => 'Už jsi doma?',
    reminderBody: (c) => `Pokud se neohlásíš, ${c.contactName} dostane zprávu v ${c.deadline ?? c.time}.`,
    contactsFallback: () => 'tvoji blízcí',
    alertCopy: (c) => `⚠️ Žádné ohlášení do ${c.deadline ?? c.time}: ${c.contactName} dostal/a zprávu.`,
    alertCopyTitle: () => 'Tvoji blízcí byli upozorněni',
    nobody: () => 'nikdo',
    contactLinked: (c) => `✅ Propojeno. Dostaneš zprávu, až bude ${c.userName} doma, nebo když ohlášení nepřijde.`,
    userLinked: () => `✅ Tvůj účet je propojený. Kdykoli pošli /home a ohlásíš se.`,
    testContact: (c) => `👋 Test od ${c.userName} přes I am home. Takové zprávy budeš dostávat.`,
    checkinAck: (c) => `🏠 Ohlášení zaznamenáno v ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} se ohlásil/a před ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, ohlášení zaznamenáno v ${c.time}.`,
    tgStatus: (c) => `Poslední ohlášení: ${c.time}\nDalší termín: ${c.deadline}`,
    tgNone: () => 'žádný',
    tgNotLinked: (c) => `Zatím nepropojeno. Otevři ${c.appUrl}/app/settings a propoj tento chat.`,
    tgHelp: (c) => `/home – ohlásit se\n/status – poslední ohlášení a další termín\n${c.appUrl}`,
    pushTest: () => '👋 Testovací oznámení I am home.',
    pushTestBody: () => 'Oznámení fungují.',
    magicSubject: () => 'Tvůj přihlašovací odkaz do I am home',
    magicBody: (c) => `Ahoj,\n\nklikni pro přihlášení do I am home: ${c.custom}\n\nOdkaz platí 15 minut. Pokud jsi o něj nežádal/a, tento e-mail ignoruj.`,
  },
  de: {
    announce: (c) => `🏠 ${c.userName} ist gut zu Hause angekommen (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} hat sich bis ${c.deadline ?? c.time} nicht gemeldet.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nDies ist eine automatische Nachricht von I am home. Sie bedeutet nur, dass kein Check-in eingegangen ist; ein Anruf könnte sich lohnen.`,
    reminder: (c) =>
      `⏰ Erinnerung: Du hast dich noch nicht gemeldet. ${c.contactName} wird um ${c.deadline ?? c.time} benachrichtigt, wenn du es nicht tust. Tippe auf „Ich bin zu Hause“ oder antworte /home.`,
    reminderTitle: () => 'Bist du schon zu Hause?',
    reminderBody: (c) => `${c.contactName} wird um ${c.deadline ?? c.time} benachrichtigt, wenn du dich nicht meldest.`,
    contactsFallback: () => 'deine Kontakte',
    alertCopy: (c) => `⚠️ Kein Check-in bis ${c.deadline ?? c.time}: ${c.contactName} wurde benachrichtigt.`,
    alertCopyTitle: () => 'Deine Kontakte wurden benachrichtigt',
    nobody: () => 'niemand',
    contactLinked: (c) => `✅ Verknüpft. Du bekommst eine Nachricht, wenn ${c.userName} zu Hause ist oder ein Check-in ausbleibt.`,
    userLinked: () => `✅ Dein Konto ist verknüpft. Sende jederzeit /home, um dich zu melden.`,
    testContact: (c) => `👋 Test von ${c.userName} über I am home. Du bekommst Nachrichten wie diese.`,
    checkinAck: (c) => `🏠 Check-in um ${c.time} gespeichert. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} hat sich vor ${c.deadline ?? c.time} gemeldet.`,
    hookOk: (c) => `OK, Check-in um ${c.time} gespeichert.`,
    tgStatus: (c) => `Letzter Check-in: ${c.time}\nNächste Frist: ${c.deadline}`,
    tgNone: () => 'keine',
    tgNotLinked: (c) => `Noch nicht verknüpft. Öffne ${c.appUrl}/app/settings, um diesen Chat zu verbinden.`,
    tgHelp: (c) => `/home – Check-in\n/status – letzter Check-in und nächste Frist\n${c.appUrl}`,
    pushTest: () => '👋 Testbenachrichtigung von I am home.',
    pushTestBody: () => 'Benachrichtigungen funktionieren.',
    magicSubject: () => 'Dein Anmeldelink für I am home',
    magicBody: (c) => `Hallo,\n\nklicke hier, um dich bei I am home anzumelden: ${c.custom}\n\nDer Link ist 15 Minuten gültig. Falls du ihn nicht angefordert hast, ignoriere diese E-Mail.`,
  },
  es: {
    announce: (c) => `🏠 ${c.userName} ha llegado bien a casa (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} no ha avisado antes de las ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nEste es un mensaje automático de I am home. Solo significa que no se recibió ningún aviso; quizá valga la pena llamar.`,
    reminder: (c) =>
      `⏰ Recordatorio: todavía no has avisado. ${c.contactName} recibirá un mensaje a las ${c.deadline ?? c.time} si no lo haces. Pulsa «Ya estoy en casa» o responde /home.`,
    reminderTitle: () => '¿Ya estás en casa?',
    reminderBody: (c) => `${c.contactName} recibirá un mensaje a las ${c.deadline ?? c.time} si no avisas.`,
    contactsFallback: () => 'tus contactos',
    alertCopy: (c) => `⚠️ Sin aviso antes de las ${c.deadline ?? c.time}: ${c.contactName} ha sido avisado/a.`,
    alertCopyTitle: () => 'Tus contactos han sido avisados',
    nobody: () => 'nadie',
    contactLinked: (c) => `✅ Vinculado. Recibirás un mensaje cuando ${c.userName} llegue a casa, o si falta un aviso.`,
    userLinked: () => `✅ Tu cuenta está vinculada. Envía /home en cualquier momento para avisar.`,
    testContact: (c) => `👋 Prueba de ${c.userName} a través de I am home. Recibirás mensajes como este.`,
    checkinAck: (c) => `🏠 Aviso registrado a las ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} avisó antes de las ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, aviso registrado a las ${c.time}.`,
    tgStatus: (c) => `Último aviso: ${c.time}\nPróximo plazo: ${c.deadline}`,
    tgNone: () => 'ninguno',
    tgNotLinked: (c) => `Aún no vinculado. Abre ${c.appUrl}/app/settings para conectar este chat.`,
    tgHelp: (c) => `/home – avisar\n/status – último aviso y próximo plazo\n${c.appUrl}`,
    pushTest: () => '👋 Notificación de prueba de I am home.',
    pushTestBody: () => 'Las notificaciones funcionan.',
    magicSubject: () => 'Tu enlace de acceso a I am home',
    magicBody: (c) => `Hola,\n\nHaz clic para entrar en I am home: ${c.custom}\n\nEl enlace es válido durante 15 minutos. Si no lo has pedido, ignora este correo.`,
  },
  it: {
    announce: (c) => `🏠 ${c.userName} è arrivato/a a casa (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} non ha dato notizie entro le ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nQuesto è un messaggio automatico di I am home. Significa solo che non è arrivato nessun check-in; forse vale la pena chiamare.`,
    reminder: (c) =>
      `⏰ Promemoria: non hai ancora fatto il check-in. ${c.contactName} riceverà un messaggio alle ${c.deadline ?? c.time} se non lo fai. Tocca «Sono a casa» o rispondi /home.`,
    reminderTitle: () => 'Sei già a casa?',
    reminderBody: (c) => `${c.contactName} riceverà un messaggio alle ${c.deadline ?? c.time} se non fai il check-in.`,
    contactsFallback: () => 'i tuoi contatti',
    alertCopy: (c) => `⚠️ Nessun check-in entro le ${c.deadline ?? c.time}: ${c.contactName} è stato/a avvisato/a.`,
    alertCopyTitle: () => 'I tuoi contatti sono stati avvisati',
    nobody: () => 'nessuno',
    contactLinked: (c) => `✅ Collegato. Riceverai un messaggio quando ${c.userName} è a casa, o se manca un check-in.`,
    userLinked: () => `✅ Il tuo account è collegato. Invia /home in qualsiasi momento per fare il check-in.`,
    testContact: (c) => `👋 Test da ${c.userName} tramite I am home. Riceverai messaggi come questo.`,
    checkinAck: (c) => `🏠 Check-in registrato alle ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} ha fatto il check-in prima delle ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, check-in registrato alle ${c.time}.`,
    tgStatus: (c) => `Ultimo check-in: ${c.time}\nProssima scadenza: ${c.deadline}`,
    tgNone: () => 'nessuna',
    tgNotLinked: (c) => `Non ancora collegato. Apri ${c.appUrl}/app/settings per collegare questa chat.`,
    tgHelp: (c) => `/home – fai il check-in\n/status – ultimo check-in e prossima scadenza\n${c.appUrl}`,
    pushTest: () => '👋 Notifica di prova di I am home.',
    pushTestBody: () => 'Le notifiche funzionano.',
    magicSubject: () => 'Il tuo link di accesso a I am home',
    magicBody: (c) => `Ciao,\n\nclicca per accedere a I am home: ${c.custom}\n\nIl link è valido per 15 minuti. Se non l'hai richiesto, ignora questa email.`,
  },
  pt: {
    announce: (c) => `🏠 ${c.userName} chegou bem a casa (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} não deu notícias até às ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nEsta é uma mensagem automática do I am home. Significa apenas que não foi recebido nenhum check-in; talvez valha a pena ligar.`,
    reminder: (c) =>
      `⏰ Lembrete: ainda não fizeste o check-in. ${c.contactName} vai receber uma mensagem às ${c.deadline ?? c.time} se não o fizeres. Toca em «Cheguei a casa» ou responde /home.`,
    reminderTitle: () => 'Já chegaste a casa?',
    reminderBody: (c) => `${c.contactName} vai receber uma mensagem às ${c.deadline ?? c.time} se não fizeres o check-in.`,
    contactsFallback: () => 'os teus contactos',
    alertCopy: (c) => `⚠️ Sem check-in até às ${c.deadline ?? c.time}: ${c.contactName} foi avisado/a.`,
    alertCopyTitle: () => 'Os teus contactos foram avisados',
    nobody: () => 'ninguém',
    contactLinked: (c) => `✅ Ligado. Vais receber uma mensagem quando ${c.userName} chegar a casa, ou se faltar um check-in.`,
    userLinked: () => `✅ A tua conta está ligada. Envia /home a qualquer momento para fazer o check-in.`,
    testContact: (c) => `👋 Teste de ${c.userName} através do I am home. Vais receber mensagens como esta.`,
    checkinAck: (c) => `🏠 Check-in registado às ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} fez o check-in antes das ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, check-in registado às ${c.time}.`,
    tgStatus: (c) => `Último check-in: ${c.time}\nPróximo prazo: ${c.deadline}`,
    tgNone: () => 'nenhum',
    tgNotLinked: (c) => `Ainda não ligado. Abre ${c.appUrl}/app/settings para ligar esta conversa.`,
    tgHelp: (c) => `/home – fazer check-in\n/status – último check-in e próximo prazo\n${c.appUrl}`,
    pushTest: () => '👋 Notificação de teste do I am home.',
    pushTestBody: () => 'As notificações estão a funcionar.',
    magicSubject: () => 'A tua ligação de acesso ao I am home',
    magicBody: (c) => `Olá,\n\nclica para entrar no I am home: ${c.custom}\n\nA ligação é válida durante 15 minutos. Se não a pediste, ignora este email.`,
  },
  pl: {
    announce: (c) => `🏠 ${c.userName} jest bezpiecznie w domu (${c.time}).`,
    alert: (c) =>
      `⚠️ ${c.userName} nie dał/a znaku do ${c.deadline ?? c.time}.` +
      (c.custom ? `\n${c.custom}` : '') +
      `\nTo automatyczna wiadomość z I am home. Oznacza tylko, że nie otrzymano zgłoszenia; może warto zadzwonić.`,
    reminder: (c) =>
      `⏰ Przypomnienie: jeszcze nie dałeś/aś znaku. ${c.contactName} dostanie wiadomość o ${c.deadline ?? c.time}, jeśli tego nie zrobisz. Kliknij „Jestem w domu” albo odpowiedz /home.`,
    reminderTitle: () => 'Jesteś już w domu?',
    reminderBody: (c) => `${c.contactName} dostanie wiadomość o ${c.deadline ?? c.time}, jeśli nie dasz znaku.`,
    contactsFallback: () => 'twoi bliscy',
    alertCopy: (c) => `⚠️ Brak zgłoszenia do ${c.deadline ?? c.time}: ${c.contactName} dostał/a wiadomość.`,
    alertCopyTitle: () => 'Twoi bliscy zostali powiadomieni',
    nobody: () => 'nikt',
    contactLinked: (c) => `✅ Połączono. Dostaniesz wiadomość, gdy ${c.userName} będzie w domu, albo gdy zabraknie zgłoszenia.`,
    userLinked: () => `✅ Twoje konto jest połączone. Wyślij /home w dowolnej chwili, aby dać znak.`,
    testContact: (c) => `👋 Test od ${c.userName} przez I am home. Będziesz dostawać takie wiadomości.`,
    checkinAck: (c) => `🏠 Zgłoszenie zapisane o ${c.time}. ${c.contactName}`,
    ok: (c) => `✅ ${c.userName} dał/a znak przed ${c.deadline ?? c.time}.`,
    hookOk: (c) => `OK, zgłoszenie zapisane o ${c.time}.`,
    tgStatus: (c) => `Ostatnie zgłoszenie: ${c.time}\nNastępny termin: ${c.deadline}`,
    tgNone: () => 'brak',
    tgNotLinked: (c) => `Jeszcze nie połączono. Otwórz ${c.appUrl}/app/settings, aby połączyć ten czat.`,
    tgHelp: (c) => `/home – daj znak\n/status – ostatnie zgłoszenie i następny termin\n${c.appUrl}`,
    pushTest: () => '👋 Testowe powiadomienie I am home.',
    pushTestBody: () => 'Powiadomienia działają.',
    magicSubject: () => 'Twój link logowania do I am home',
    magicBody: (c) => `Cześć,\n\nkliknij, aby zalogować się do I am home: ${c.custom}\n\nLink jest ważny przez 15 minut. Jeśli o niego nie prosiłeś/aś, zignoruj tę wiadomość.`,
  },
};

const EMPTY: MessageContext = { userName: '', contactName: '', time: '', appUrl: '' };

export function message(locale: Locale, key: MessageKey, ctx: Partial<MessageContext> = {}): string {
  const table = T[locale] ?? T.en;
  const fn = table[key] ?? T.en[key];
  return fn ? fn({ ...EMPTY, ...ctx }) : '';
}

/** Map any locale-ish input ("fr-FR", "CS", "pt_BR") to a supported locale, defaulting to English. */
export function normalizeLocale(input: string | null | undefined): Locale {
  const two = (input ?? '').trim().toLowerCase().slice(0, 2);
  return (LOCALES as string[]).includes(two) ? (two as Locale) : 'en';
}
