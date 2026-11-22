import { useState } from 'react';
import { cardMastery, coachStatus, overallPlan, guidedMethod, STAGE_LABELS, MASTERY_POLICY } from './coach-engine.js';
import {canUseStudyMethod} from './study-engine.js';

const METHOD_NAMES={flip:'Flip the card',quiz:'Multiple choice',type:'Type the answer',match:'Matching pairs',boolean:'True or false'};
export function CoachPlan({deck, updateDeck, onStart}) {
  const [showCards,setShowCards]=useState(false);
  const status=coachStatus(deck), coach=deck.coach||{}, plan=overallPlan(deck);
  const enabled=!!coach.enabled;
  const remaining=deck.cards.length-status.counts.mature;
  const nextCard=plan[0];
  const betweenTests=!status.passed && status.testPasses>0 && !status.testAvailable;
  const recommendation=betweenTests ? {mode:'type',step:coach.guideStep||0,reason:'Recall the full deck without seeing the answers before your confirmation test, or return on a later day. Spacing your checks helps test lasting memory.'} : guidedMethod(deck);
  const start=kind=>onStart({mode:kind==='final'?'type':recommendation.mode,scope:'all',flip:false,limit:betweenTests || !['learn','practice'].includes(kind)?deck.cards.length:Math.min(20,deck.cards.length),coachKind:kind,...(kind==='final'?{}:{guideStep:recommendation.step})});
  const save=patch=>updateDeck({...deck,coach:{...coach,...patch}});
  const sessionKind=status.passed ? 'revision' : status.ready && status.testAvailable ? 'final' : 'learn';
  const label=status.passed ? 'Start daily revision' : status.ready && status.testAvailable ? 'Start final test' : betweenTests ? 'Start full-deck recall check' : 'Start recommended session';
  return <section className="review-panel coach-panel" aria-labelledby="coach-title">
    <h3 id="coach-title" className="review-heading">Overall plan</h3>
    <label className="coach-toggle"><input type="checkbox" checked={enabled} onChange={event=>save({enabled:event.target.checked})} /><span><strong>Use study coach for this deck</strong><small>Recommendations and mastery estimates run on your device. Turn this off to choose your own methods.</small></span></label>
    {enabled && <>
      <label className="deadline-field">Learning deadline (optional)<input aria-label="Learning deadline" type="date" value={coach.deadline||''} onChange={event=>save({deadline:event.target.value||null})} /></label>
      <p className="review-copy">{status.deadline ? status.daysLeft>0 ? `${status.daysLeft} day${status.daysLeft===1?'':'s'} including today.${remaining ? ` Aim to strengthen about ${Math.max(1,Math.ceil(remaining/Math.max(1,status.daysLeft)))} unfinished card${Math.ceil(remaining/Math.max(1,status.daysLeft))===1?'':'s'} per day.` : ' Every card has reached the mastery threshold.'}` : 'The deadline has passed. You can keep learning or choose a new deadline.' : 'No deadline: learn at your own pace, then keep the deck fresh with one revision session a day.'}</p>
      <div className="coach-metrics"><span><strong>{status.score}%</strong> estimated mastery</span><span><strong>{status.counts.mature}/{deck.cards.length}</strong> cards ready</span><span><strong>{status.counts.needsPractice}</strong> need lots of practice</span></div>
      <progress className="coach-progress" aria-label="Estimated deck mastery" max="100" value={status.score} />
      <p className="review-copy">Mastery grows from reliable unaided recall, with stronger evidence when you remember after a gap. Flips and answer choices help you learn; typed answers check what you can recall. There is no fixed session quota or daily cap. Each card must be ready before a full-deck test and a separate confirmation test.</p>
      <p className="coach-status" role="status">{status.passed ? `Final test passed: 100%. Both checks completed. ${status.maintenanceEnded ? 'Your deadline has passed; daily revision is optional.' : status.revisionDue ? 'Daily revision is ready.' : 'Revision is complete for today.'}` : betweenTests ? `First check complete. Recall the full deck once before confirming, or come back on a later day.` : status.ready ? `Every card is ready. Knowledge check ${status.testPasses+1} of 2: all ${deck.cards.length} questions, no hints or retries, and 100% required.` : 'Keep building reliable recall for every card before testing.'}</p>
      {!!deck.cards.length && <p className="review-copy">Next guided method: <strong>{METHOD_NAMES[recommendation.mode]}</strong>. {!canUseStudyMethod('quiz',deck.cards) && 'Multiple choice needs at least four distinct answers, so it is skipped for this deck.'} {deck.cards.length<2 && 'Matching pairs needs at least two cards.'}</p>}
      {!!deck.cards.length && <p className="recommendation-reason">{recommendation.reason}</p>}
      {coach.lastTest && !status.passed && <p className="review-copy">Last final test: {coach.lastTest.correct}/{coach.lastTest.total}. {coach.lastTest.correct===coach.lastTest.total?`${status.testPasses}/2 knowledge checks complete.`:'Focus on the missed questions before trying again. Completed checks are kept; you do not restart the deck.'}</p>}
      <button className="study-action selected" disabled={!deck.cards.length || (status.passed && (!status.revisionDue || status.maintenanceEnded))} onClick={()=>start(sessionKind)}>{label}</button>
      {(status.passed || coach.lastTest) && <button className="study-action" disabled={!deck.cards.length} onClick={()=>start('practice')}>Continue guided practice</button>}
      {(status.passed || coach.lastTest) && <p className="review-copy">You can keep using the guide whenever you want, even after today’s revision or your deadline. Extra practice keeps your final-test result and daily revision status.</p>}
      <button className="study-action" onClick={()=>setShowCards(value=>!value)} aria-expanded={showCards}>{showCards?'Hide card plan':'See card-by-card plan'}</button>
      {showCards && <ul className="card-plan">{plan.map(card=>{const mastery=cardMastery(card);return <li key={card.id}><strong>{card.q}</strong><span>{STAGE_LABELS[mastery.stage]} · {mastery.score}% · {mastery.practiceSessions} successful sessions · {mastery.recallSessions} unaided · next review {card.next || 'now'} · {METHOD_NAMES[recommendation.mode]}</span></li>;})}</ul>}
      <p className="review-copy">Revision prompts appear when you open this deck. Mastery is an estimate from your answers, not a guarantee.</p>
    </>}
  </section>;
}
