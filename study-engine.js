// An adaptive scheduler driven by answers, assistance, distinct review days and misses.
// Dates are local calendar dates; same-day practice cannot inflate a review interval.
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function isDateKey(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number), date=new Date(0);
  date.setUTCFullYear(year,month-1,day); date.setUTCHours(0,0,0,0);
  return year>=1900 && year<=9999 && date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
}
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const calendarDay = key => {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};
const afterDays = (date, count) => { const next = new Date(date); next.setDate(next.getDate() + count); return dateKey(next); };
const WEIGHT = {flip: 1, type: 1, final: 1, quiz: .7, boolean: .5, gap: .75, hint: .55, match: .6};

export function scheduleReview(card, result, now = new Date()) {
  if (result.attemptId && Array.isArray(card.reviewHistory) && card.reviewHistory.some(entry=>entry?.attemptId===result.attemptId)) return card;
  const today = dateKey(now);
  const repeated = card.lastReviewDay === today;
  const failedToday = card.lastFailedDay === today;
  const early = !!card.next && card.next > today;
  const previousInterval = Math.max(0, finite(card.interval, 0));
  let stability = clamp(finite(card.stability, Math.max(1, previousInterval)), .5, 365);
  let difficulty = clamp(finite(card.difficulty, 5 + finite(card.lapses, 0) * .3), 1, 10);
  let streak = Math.max(0, finite(card.successStreak, finite(card.reps, 0)));
  let lapses = Math.max(0, finite(card.lapses, 0));
  let interval = previousInterval, next = card.next || today;
  const evidence = (WEIGHT[result.method] ?? .7) * (result.assisted ? .65 : 1);

  if (!result.correct) {
    if (!failedToday) { lapses++; difficulty = clamp(difficulty + .8, 1, 10); }
    streak = 0;
    if (!failedToday) stability = clamp(stability * .35, .5, 1.5);
    interval = 1;
    next = afterDays(now, 1);
  } else if (failedToday) {
    // A correction after seeing the answer is learning, not proof of lasting recall.
    interval = 1; next = afterDays(now, 1); streak = 0;
  } else if (!repeated && !early) {
    streak++;
    difficulty = clamp(difficulty - .25 * evidence, 1, 10);
    const overdue = card.next ? Math.max(0, calendarDay(today) - calendarDay(card.next)) : 0;
    const latenessBonus = Math.min(.3, overdue / Math.max(1, stability) * .1);
    const growth = 1 + (1.65 - difficulty * .09) * evidence + latenessBonus;
    stability = card.seen ? Math.max(stability + .5, stability * growth) : 1;
    interval = card.seen ? clamp(Math.max(previousInterval + 1, Math.round(stability)), 1, 365) : 1;
    stability = Math.min(365, stability);
    next = afterDays(now, interval);
  }

  return {
    ...card, schedulerVersion: 2, stability, difficulty, successStreak: streak,
    ease: clamp(3 - difficulty * .15, 1.3, 3), interval, reps: streak, lapses, next,
    seen: Math.max(0, finite(card.seen, 0)) + 1,
    right: Math.max(0, finite(card.right, 0)) + (result.correct ? 1 : 0),
    lastReviewDay: today, lastReview: now.toISOString(),
    lastFailedDay: result.correct ? card.lastFailedDay || null : today,
    lastMethod: result.method,
    reviewHistory: [...(Array.isArray(card.reviewHistory) ? card.reviewHistory : []), {
      day: today, correct: !!result.correct, assisted: !!result.assisted, method: result.method, interval,
      ...(result.feedbackKind ? {feedbackKind:result.feedbackKind} : {}),
      ...(typeof result.near==='boolean' ? {near:result.near} : {}),
      ...(typeof result.retryScheduled==='boolean' ? {retryScheduled:result.retryScheduled} : {}),
      ...(Number.isInteger(result.sessionMisses) ? {sessionMisses:result.sessionMisses} : {}),
      ...(result.attemptId ? {attemptId:result.attemptId,nextReview:next} : {}),
    }].slice(-60),
  };
}

export function reviewPool(cards, scope = 'due', now = new Date()) {
  const today = dateKey(now);
  const pool = cards.filter(card => scope === 'due' ? !card.next || card.next <= today
    : scope === 'starred' ? card.starred
    : scope === 'hard' ? (card.lapses || 0) >= 5 || (card.seen && card.right / card.seen < .6) : true);
  const priority = card => {
    const overdue = card.seen && card.next ? clamp(calendarDay(today) - calendarDay(card.next), -365, 365) : 0;
    return (card.seen ? 10 : 0) + overdue * 3 + (card.difficulty || 5) + Math.min(10, card.lapses || 0);
  };
  return [...pool].sort((a, b) => priority(b) - priority(a) || String(a.id).localeCompare(String(b.id)));
}

export const DEFAULT_MARKING = Object.freeze({caseSensitive: false, ignoreDiacritics: false, ignorePunctuation: true, allowTypos: true, ignoreExtraSpaces: true});
export function markingRules(settings = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_MARKING).map(([key, value]) => [key, typeof settings?.[key] === 'boolean' ? settings[key] : value]));
}
export function normalizeAnswer(value, settings) {
  const rules = markingRules(settings);
  let text = String(value).normalize('NFKC').replace(/−/g,'-');
  if (!rules.caseSensitive) text = text.toLowerCase();
  if (rules.ignoreDiacritics) text = text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  const original = text;
  const mathematical=/[=+*^<>]/.test(text) || /-\s*(?:\d|\.\d)/.test(text) || /\b[a-z]\s*[-/]\s*[a-z]\b/i.test(text);
  if (rules.ignorePunctuation) text = text.replace(/\p{P}/gu, (character, index, full) => {
    // Keep decimal points, negative signs and arithmetic punctuation next to numbers.
    if (character === '.' && /\d/.test(full[index + 1] || '') && (index===0 || /[\d\s+\-−(]/.test(full[index - 1] || ''))) return character;
    if (character === ',' && /\d/.test(full[index - 1] || '') && /\d/.test(full[index + 1] || '')) return character;
    if (/[\-/]/.test(character) && /\d/.test((full[index - 1] || '') + (full[index + 1] || ''))) return character;
    if (mathematical && /[-/()[\]{}]/.test(character)) return character;
    return '';
  });
  // If punctuation is the entire answer (e.g. "?"), it must still be checked.
  if (!text.trim() && original.trim()) text = original;
  if (rules.ignoreExtraSpaces) text = text.replace(/\s+/g, ' ').trim();
  return text;
}
export function assessAnswer(given, expected, settings) {
  const rules = markingRules(settings);
  const a = normalizeAnswer(given, rules), b = normalizeAnswer(expected, rules);
  if (!a || !b) return {correct: false, assisted: false};
  if (a === b) return {correct: true, assisted: false};
  if (!rules.allowTypos) return {correct: false, assisted: false};
  if (!rules.ignoreDiacritics && JSON.stringify(a.normalize('NFD').match(/\p{M}/gu)) !== JSON.stringify(b.normalize('NFD').match(/\p{M}/gu))) return {correct:false, assisted:false};
  // Spelling tolerance never relaxes a rule explicitly selected for this question.
  if (rules.caseSensitive && Array.from(a).some((letter, i) => b[i] && letter !== b[i] && letter.toLowerCase() === b[i].toLowerCase())) return {correct: false, assisted: false};
  if (rules.caseSensitive && JSON.stringify(a.match(/\p{Lu}/gu)) !== JSON.stringify(b.match(/\p{Lu}/gu))) return {correct:false, assisted:false};
  if (!rules.ignorePunctuation && JSON.stringify(a.match(/\p{P}/gu)) !== JSON.stringify(b.match(/\p{P}/gu))) return {correct: false, assisted: false};
  if (!rules.ignoreExtraSpaces && JSON.stringify(a.match(/\s+/g)) !== JSON.stringify(b.match(/\s+/g))) return {correct: false, assisted: false};
  // Numbers, operators and negation must agree before allowing small spelling mistakes.
  const tokens = value => JSON.stringify(value.toLowerCase().match(/[+\-]?\d+(?:\.\d+)?|[=<>+%*/^−]|\b(?:not|no|never|without|dont|cannot|cant|isnt)\b/g) || []);
  if (tokens(a) !== tokens(b) || Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 3) return {correct: false, assisted: false};
  // Limit comparison size and use a single row to keep long cards responsive.
  if (Math.max(a.length, b.length) > 1000) return {correct: false, assisted: false};
  let row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      const left = a[i - 1], right = b[j - 1];
      const leftLetter = /\p{L}/u.test(left), rightLetter = /\p{L}/u.test(right);
      const sameCase = !rules.caseSensitive || (left === left.toUpperCase()) === (right === right.toUpperCase());
      next[j] = Math.min(next[j - 1] + (rightLetter ? 1 : Infinity), row[j] + (leftLetter ? 1 : Infinity), row[j - 1] + (left === right ? 0 : leftLetter && rightLetter && sameCase ? 1 : Infinity));
    }
    row = next;
  }
  const close = row[b.length] <= Math.max(1, Math.floor(b.length * .08));
  return {correct: close, assisted: close};
}

export function assessCardAnswer(given, card, reverse = false) {
  const answers = reverse ? [card.q] : [card.a, ...(Array.isArray(card.acceptedAnswers) ? card.acceptedAnswers : [])];
  const results = answers.map(answer => assessAnswer(given, answer, card.marking));
  return results.find(result => result.correct && !result.assisted) || results.find(result => result.correct) || {correct:false, assisted:false,near:answers.some(answer=>isNearAnswer(given,answer))};
}

// Feedback similarity does not relax the question's marking rules or award credit.
export function isNearAnswer(given,expected) {
  const relaxed={caseSensitive:false,ignoreDiacritics:true,ignorePunctuation:true,ignoreExtraSpaces:true};
  const a=normalizeAnswer(given,relaxed),b=normalizeAnswer(expected,relaxed),length=Math.max(a.length,b.length);
  if (!a || !b || length>1000) return false;
  if (a===b) return true;
  const limit=Math.floor(length*.25);
  if (Math.abs(a.length-b.length)>limit) return false;
  let row=Array.from({length:b.length+1},(_,index)=>index);
  for (let i=1;i<=a.length;i++) {
    const next=[i];
    for (let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));
    row=next;
  }
  return row[b.length]<=limit;
}
