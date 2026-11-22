import { cardMastery, masteryCounts, needsAnotherLook, STAGES, STAGE_LABELS, coachStatus } from './coach-engine.js';

export const STAGE_COLOURS={new:'#C9D5E0',needsPractice:'#C4553E',learning:'#F2C14E',young:'#8AB4B2',mature:'#2E7D7A'};
export function Progress({deck}) {
  const counts=masteryCounts(deck.cards), status=coachStatus(deck);
  const reviewed=deck.cards.filter(card=>card.seen), total=reviewed.reduce((sum,card)=>sum+card.seen,0), right=reviewed.reduce((sum,card)=>sum+card.right,0);
  const weak=deck.cards.filter(needsAnotherLook).sort((a,b)=>cardMastery(a).score-cardMastery(b).score);
  return <div className="review-session">
    <section className="review-panel"><h3 className="review-heading">Overall progress</h3><div className="coach-metrics"><span><strong>{deck.cards.length}</strong> cards</span><span><strong>{status.score}%</strong> estimated mastery</span><span><strong>{total?Math.round(right/total*100)+'%':'—'}</strong> answer accuracy</span><span><strong>{counts.mature}</strong> mature</span></div>
      <div className="mastery-stages" role="img" aria-label={STAGES.map(stage=>`${STAGE_LABELS[stage]} ${counts[stage]}`).join(', ')}>{STAGES.map(stage=><span key={stage} style={{width:`${counts[stage]/Math.max(1,deck.cards.length)*100}%`,background:STAGE_COLOURS[stage]}} />)}</div>
      <div className="stage-legend">{STAGES.map(stage=><span key={stage}><i style={{background:STAGE_COLOURS[stage]}} />{STAGE_LABELS[stage]} {counts[stage]}</span>)}</div>
      <p className="review-copy">Mastery estimates the strength of your recall. Unaided answers count most; remembering after a gap adds stronger evidence. Repeating the same card within a session does not inflate mastery. Mistakes focus your next practice without erasing earlier learning. A full-deck test and a separate confirmation check verify the deck; later mistakes or overdue reviews can lower the estimate.</p>
      <div className="progress-explainer"><p><strong>Answer accuracy</strong> is the percentage of all saved answers you got right, including retries. The session result shows how many cards you answered correctly on the first try.</p><p><strong>Mastery</strong> estimates how well you know each card. It needs repeated successful sessions and unaided recall, so a perfect session can still leave mastery below 100%.</p><p>Retries within one session count as one missed session for mastery. A fresh successful session helps you recover. There is no daily limit on gaining mastery.</p></div>
      {!deck.cards.length && <p className="review-copy">Add some cards to start tracking progress.</p>}
    </section>
    <section className="review-panel"><h3 className="review-heading">Needs another look</h3>{weak.length ? <ul className="card-plan">{weak.map(card=><li key={card.id}><strong>{card.q}</strong><span>{STAGE_LABELS[cardMastery(card).stage]} · {cardMastery(card).score}% mastery</span></li>)}</ul> : <p className="review-copy">{reviewed.length?'Nothing needs another look — your recent answers were all correct.':'No mistakes recorded yet. Start studying to build your progress.'}</p>}</section>
  </div>;
}
