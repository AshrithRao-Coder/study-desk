import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleReview, reviewPool, assessAnswer, assessCardAnswer, dateKey, markingRules } from './study-engine.js';

const now = new Date(2026, 10, 21, 12);
const fresh = {id:'test', q:'A question', a:'Photosynthesis', tags:[], next:'2026-11-21', interval:0, reps:0, seen:0, right:0, lapses:0, ease:2.5};
const correct = {correct:true, method:'type', assisted:false};
test('daily review intervals grow only after successful recall on a later due day', () => {
  const first = scheduleReview(fresh, correct, now);
  assert.equal(first.next, '2026-11-22');
  assert.equal(first.interval, 1);
  const repeated = scheduleReview(first, correct, now);
  assert.equal(repeated.next, first.next);
  assert.equal(repeated.successStreak, 1);
  const second = scheduleReview(first, correct, new Date(2026, 10, 22, 12));
  assert.ok(second.interval > first.interval);
  assert.equal(second.successStreak, 2);
  const early = scheduleReview(second, correct, new Date(2026, 10, 23, 12));
  assert.equal(early.next, second.next, 'Extra practice keeps an existing future date');
  let card = second;
  for (let i=0;i<8;i++) card = scheduleReview(card, correct, new Date(`${card.next}T12:00:00`));
  assert.ok(card.interval > 20);
  assert.ok(card.interval <= 365);
});
test('misses are due tomorrow and a same-day correction cannot masquerade as mastery', () => {
  const known = {...fresh, seen:20, right:18, interval:30, stability:30, reps:5};
  const wrong = scheduleReview(known, {correct:false,method:'quiz'}, now);
  assert.equal(wrong.next, '2026-11-22');
  assert.equal(wrong.lapses, 1);
  const retry = scheduleReview(wrong, correct, now);
  assert.equal(retry.next, '2026-11-22');
  assert.equal(retry.interval, 1);
  assert.equal(retry.successStreak, 0);
  assert.equal(scheduleReview(retry, {correct:false, method:'type'}, now).lapses, 1);
  assert.equal(retry.reviewHistory.length, 2);
});
test('recognition and hints provide less interval growth than unaided recall', () => {
  const card = {...fresh, seen:10, right:10, interval:10, stability:10, next:'2026-11-21'};
  const recall = scheduleReview(card, correct, now);
  const hinted = scheduleReview(card, {correct:true,assisted:true,method:'hint'}, now);
  assert.ok(recall.interval > hinted.interval);
});
test('today’s plan prioritizes overdue reviews, excludes future cards and retains new ones', () => {
  const due = {...fresh,id:'due',seen:3,next:'2026-11-20'};
  const future = {...fresh,id:'future',seen:3,next:'2026-11-24'};
  const newOld = {...fresh,id:'new',next:'2020-01-01'};
  assert.deepEqual(reviewPool([newOld,future,due], 'due', now).map(card=>card.id), ['due','new']);
  assert.deepEqual(reviewPool([{...future,starred:true},due], 'starred', now).map(card=>card.id), ['future']);
  assert.equal(dateKey(new Date(2026,2,29,12)), '2026-03-29');
});
test('per-question case, punctuation, spacing and spelling rules are independent', () => {
  assert.equal(assessAnswer('hello, WORLD!', 'Hello world').correct, true);
  assert.equal(assessAnswer('photosynthesis', 'Photosynthesis', {caseSensitive:true}).correct, false);
  assert.equal(assessAnswer('Hello world', 'Hello world!', {ignorePunctuation:false}).correct, false);
  assert.equal(assessAnswer('long  answer', 'long answer', {ignoreExtraSpaces:false}).correct, false);
  assert.equal(assessAnswer('long  answer', 'long answer').correct, true);
  assert.equal(assessAnswer('Photosynthesi', 'Photosynthesis').correct, true);
  assert.equal(assessAnswer('Photosynthesi', 'Photosynthesis', {allowTypos:false}).correct, false);
  assert.equal(assessAnswer('Photosynthesi!', 'Photosynthesis!', {ignorePunctuation:false,caseSensitive:true}).correct, true);
  assert.equal(assessAnswer('Photosynthesis', 'Photosynthesis!', {ignorePunctuation:false,allowTypos:true}).correct, false);
  assert.deepEqual(markingRules({caseSensitive:true, allowTypos:'invalid'}), {caseSensitive:true, ignoreDiacritics:false, ignorePunctuation:true, allowTypos:true, ignoreExtraSpaces:true});
});
test('marking protects numbers, decimals, numerical signs and negation', () => {
  for (const [given,expected] of [['1234','1235'],['100','-100'],['125','12.5'],['2+2','2-2'],['it is correct','it is not correct']]) assert.equal(assessAnswer(given,expected).correct,false, `${given} differs from ${expected}`);
  assert.equal(assessAnswer('42.', '42').correct,true, 'Trailing full stop is ordinary punctuation');
});
test('alternate accepted answers follow question rules and do not apply in reverse', () => {
  const card = {...fresh, q:'Capital of Britain?', a:'London', acceptedAnswers:['City of London'], marking:{caseSensitive:true,allowTypos:false}};
  assert.equal(assessCardAnswer('City of London',card).correct,true);
  assert.equal(assessCardAnswer('city of london',card).correct,false);
  assert.equal(assessCardAnswer('City of London',card,true).correct,false);
  assert.equal(assessCardAnswer('Capital of Britain?',card,true).correct,true);
});
