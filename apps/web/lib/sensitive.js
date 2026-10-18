// F4 phase 3: client-side warning (never a block) when a note or description looks like it
// contains a payment card, passport or national ID number. Heuristic only; runs in the
// browser, the text is never sent anywhere for this check.

function luhnOk(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
// Passport-style: 1–2 letters followed by 6–9 digits (e.g. A1234567, AB1234567).
const PASSPORT = /\b[A-Z]{1,2}\d{6,9}\b/i;
// Singapore NRIC/FIN, and 10-digit Saudi national / iqama IDs (start with 1 or 2).
const NATIONAL_ID = /\b[STFGM]\d{7}[A-Z]\b|\b[12]\d{9}\b/i;

// → array of kinds found: 'card' | 'passport' | 'id'. Empty when nothing looks sensitive.
export function findSensitive(text) {
  const value = String(text ?? '');
  const kinds = [];
  for (const match of value.match(CARD_CANDIDATE) ?? []) {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
      kinds.push('card');
      break;
    }
  }
  if (PASSPORT.test(value)) kinds.push('passport');
  if (NATIONAL_ID.test(value)) kinds.push('id');
  return kinds;
}

const LABELS = { card: 'a card number', passport: 'a passport number', id: 'an ID number' };

export function sensitiveWarning(kinds) {
  if (!kinds.length) return null;
  const list = kinds.map((k) => LABELS[k]).join(' or ');
  return `This looks like it contains ${list}. Don't record card, passport or ID numbers here.`;
}
