import { useState } from 'react';
import { cardMastery, coachStatus, overallPlan, recommendedMethod, STAGE_LABELS } from './coach-engine.js';

const METHOD_NAMES={flip:'Flip the card',type:'Type the answer'};
export function CoachPlan({deck, updateDeck, onStart}) {
  const [showCards,setShowCards]=useState(false);
  const status=coachStatus(deck), coach=deck.coach||{}, plan=overallPlan(deck);
  const enabled=!!coach.enabled;
  const remaining=deck.cards.length-status.counts.mature;
  const nextCard=plan[0];
  const save=patch=>updateDeck({...deck,coach:{...coach,...patch}});
  const sessionKind=status.passed ? 'revision' : status.ready ? 'final' : 'learn';
  const label=status.passed ? 'Start daily revision' : status.ready ? 'Start final test' : 'Start recommended session';
  return <section className="review-panel coach-panel" aria-labelledby="coach-title">
    <h3 id="coach-title" className="review-heading">Overall plan</h3>
    <label className="coach-toggle"><input type="checkbox" checked={enabled} onChange={event=>save({enabled:event.target.checked})} /><span><strong>Use study coach for this deck</strong><small>Recommendations and mastery estimates run on your device. Turn this off to choose your own methods.</small></span></label>
    {enabled && <>
      <label className="deadline-field">Learning deadline (optional)<input aria-label="Learning deadline" type="date" value={coach.deadline||''} onChange={event=>save({deadline:event.target.value||null})} /></label>
      <p className="review-copy">{status.deadline ? status.daysLeft>0 ? `${status.daysLeft} day${status.daysLeft===1?'':'s'} including today.${remaining ? ` Aim to strengthen about ${Math.max(1,Math.ceil(remaining/Math.max(1,status.daysLeft)))} unfinished card${Math.ceil(remaining/Math.max(1,status.daysLeft))===1?'':'s'} per day.` : ' Every card has reached the mastery threshold.'}` : 'The deadline has passed. You can keep learning or choose a new deadline.' : 'No deadline: learn at your own pace, then keep the deck fresh with one revision session a day.'}</p>
      <div className="coach-metrics"><span><strong>{status.score}%</strong> estimated mastery</span><span><strong>{status.counts.mature}/{deck.cards.length}</strong> cards ready</span><span><strong>{status.counts.needsPractice}</strong> need lots of practice</span></div>
      <progress className="coach-progress" aria-label="Estimated deck mastery" max="100" value={status.score} />
      {status.passed ? <p className="coach-status" role="status">Final test passed: 100%. {status.maintenanceEnded ? 'Your deadline has passed, so daily revision is no longer requested.' : status.revisionDue ? 'One revision session is ready for you.' : 'Revision is complete for today. Come back tomorrow.'}</p> : status.ready ? <p className="coach-status" role="status">Every card is ready. Take the final test: all {deck.cards.length} questions, no hints or retries, and 100% to pass.</p> : <p className="review-copy">The coach starts with scaffolding, then asks for unaided recall. Cards become mature after reliable unaided answers across separate sessions. {nextCard ? `Start with ${METHOD_NAMES[recommendedMethod(nextCard,deck.cards)]}; the method adjusts for each question.` : 'Add cards to build your plan.'}</p>}
      {coach.lastTest && !status.passed && <p className="review-copy">Last final test: {coach.lastTest.correct}/{coach.lastTest.total}. {coach.lastTest.correct===coach.lastTest.total?'This deck has changed since that test. Learn the changed cards, then take a fresh test.':'Practise the missed questions before your next attempt.'}</p>}
      <button className="study-action selected" disabled={!deck.cards.length || (status.passed && (!status.revisionDue || status.maintenanceEnded))} onClick={()=>onStart({mode:sessionKind==='final'?'type':'adaptive',scope:'all',flip:false,limit:sessionKind==='learn'?Math.min(20,deck.cards.length):deck.cards.length,coachKind:sessionKind})}>{label}</button>
      {(status.passed || coach.lastTest) && <button className="study-action" disabled={!deck.cards.length} onClick={()=>onStart({mode:'adaptive',scope:'all',flip:false,limit:Math.min(20,deck.cards.length),coachKind:'practice'})}>Continue guided practice</button>}
      {(status.passed || coach.lastTest) && <p className="review-copy">You can keep using the guide whenever you want, even after today’s revision or your deadline. Extra practice keeps your final-test result and daily revision status.</p>}
      <button className="study-action" onClick={()=>setShowCards(value=>!value)} aria-expanded={showCards}>{showCards?'Hide card plan':'See card-by-card plan'}</button>
      {showCards && <ul className="card-plan">{plan.map(card=>{const mastery=cardMastery(card);return <li key={card.id}><strong>{card.q}</strong><span>{STAGE_LABELS[mastery.stage]} · {mastery.score}% · next review {card.next || 'now'} · {METHOD_NAMES[recommendedMethod(card,deck.cards)]}</span></li>;})}</ul>}
      <p className="review-copy">Revision prompts appear when you open this deck. Mastery is an estimate from your answers, not a guarantee.</p>
    </>}
  </section>;
}
