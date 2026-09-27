'use client';

import { RefObject } from 'react';

export type FindSubject = 'meter' | 'breaker';

const copy = {
  meter: {
    title: 'Find your meter',
    lead: 'Look on the outside wall of your home.',
    tip: 'Keep the meter cover closed.',
    image: '/find-meter.webp',
    alt: 'Person photographing an electric meter on the outside wall of a house',
  },
  breaker: {
    title: 'Find your breaker panel',
    lead: 'Look in your garage or utility room.',
    tip: 'Leave the inner cover in place.',
    image: '/find-breaker.webp',
    alt: 'Person photographing an open breaker panel in a garage',
  },
} as const;

export default function FindEquipment({ subject, headingRef, onBack }: { subject: FindSubject; headingRef: RefObject<HTMLHeadingElement | null>; onBack: () => void }) {
  const text = copy[subject];
  return <section className="sc-content sc-find">
    <button type="button" className="pl-top-back" aria-label="Back" onClick={onBack}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H6M11 6.5 5.5 12 11 17.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
    <h1 ref={headingRef} tabIndex={-1}>{text.title}</h1>
    <div className="sc-find-art"><img src={text.image} alt={text.alt} /></div>
    <p className="sc-find-lead">{text.lead}</p>
    <p className="sc-find-tip"><InfoIcon />{text.tip}</p>
  </section>;
}

function InfoIcon() {
  return <svg className="sc-find-info" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="11" cy="7.2" r="1.05" fill="currentColor" />
    <path d="M11 10.2v5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}
