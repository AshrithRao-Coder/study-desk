export function feedbackMessage(result) {
  const misses=result.sessionMisses;
  const finalMiss=!result.correct && result.retryScheduled===false && Number.isInteger(misses);
  const attemptMessage=finalMiss ? misses>1 ? ` You missed this card on all ${misses} attempts.` : ' You missed this card on this attempt.'
    : !result.correct && misses===2 && result.retryScheduled ? ' You have 1 attempt left.' : '';
  const returnMessage=`${attemptMessage} ${finalMiss?'This card will come back next session.':'We’ll bring this card back.'}`;
  if (result.feedbackKind==='revealed') return `Here’s the answer.${returnMessage}`;
  if (result.feedbackKind==='self-check' || result.method==='flip') return result.correct
    ? 'You remembered it. Your progress has been saved.'
    : `You didn’t remember this one.${returnMessage}`;
  if (result.correct) return result.assisted ? 'Correct, with some help or a small spelling slip.' : 'Correct.';
  return `${result.near ? 'Not quite this time.' : 'You got this one wrong.'}${returnMessage}`;
}
