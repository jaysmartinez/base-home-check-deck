'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import './simple-check.css';
import PropertyLocator, { PropertyContext } from './property-locator';

type Stage = 'address' | 'location' | 'welcome' | 'safety' | 'photo' | 'confirm' | 'review' | 'result';
type Photo = { url: string; demo?: boolean };
const shots = [
  { title: 'Your electric meter', instruction: 'Fit the whole meter box in the photo.', angle: 'Stand straight in front of the meter.', image: 1 },
  { title: 'The whole meter wall', instruction: 'Step back. Show the meter, wall and ground.', angle: 'Walk back only as far as it is safe.', image: 2 },
  { title: 'Left of your meter', instruction: 'Show the wall and ground on the left.', angle: 'Keep the meter at the right edge.', image: 4 },
  { title: 'Right of your meter', instruction: 'Show the wall and ground on the right.', angle: 'Keep the meter at the left edge.', image: 3 },
  { title: 'Around the corner', instruction: 'Show the next wall and the ground below.', angle: 'Stand back to fit the whole wall.', image: 5 },
  { title: 'Your breaker panel', instruction: 'Show the whole panel and the wall around it.', angle: 'Stand straight in front of the panel.', image: 6 },
  { title: 'The main switch', instruction: 'Get close enough to read the number.', angle: 'Open only the hinged door. Never remove screws or covers.', image: 7 },
];

function Example({ index, small = false }: { index: number; small?: boolean }) {
  return <div role="img" aria-label={`Example: ${shots[index].title}. ${shots[index].angle}`} className={`sc-example sc-example-${shots[index].image} ${small ? 'sc-small' : ''}`}>
    {!small && <><span className="sc-example-label">Example photo</span><div className={`sc-guide sc-guide-${index}`} /></>}
  </div>;
}

export default function CustomerDeck() {
  const [stage, setStage] = useState<Stage>('address');
  const [address, setAddress] = useState('');
  const [property, setProperty] = useState<PropertyContext>();
  const side = property?.meterUncertain ? 'Location unsure' : 'Marked on property map';
  const [index, setIndex] = useState(0);
  const [photos, setPhotos] = useState<Record<number, Photo>>({});
  const [pending, setPending] = useState<Photo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sampleResult, setSampleResult] = useState<'review' | 'qualified' | 'fail'>('review');
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus(); }, [stage, index]);
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);
  const go = (next: Stage) => { setError(''); setStage(next); };
  const shot = shots[index];
  const title = stage === 'address' ? 'Where is your home?' : stage === 'location' ? 'Where is your meter?' : stage === 'welcome' ? 'Let’s check your home' : stage === 'safety' ? 'A quick safety check' : stage === 'photo' ? shot.title : stage === 'confirm' ? 'Use this photo?' : stage === 'review' ? 'Ready to send' : sampleResult === 'qualified' ? 'Your home may be a fit' : sampleResult === 'fail' ? 'This setup may not qualify' : 'Your photos need a closer look';
  const save = (photo: Photo) => {
    setPhotos(current => ({ ...current, [index]: photo })); setPending(null);
    if (editing || index === shots.length - 1) { setEditing(false); go('review'); }
    else { setIndex(index + 1); go('photo'); }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose a photo, then try again.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('This photo is too large. Choose one under 20 MB.'); return; }
    setBusy(true); setError('');
    const url = URL.createObjectURL(file); urls.current.push(url);
    const valid = await new Promise<boolean>(resolve => { const img = new Image(); img.onload = () => resolve(img.width > 0); img.onerror = () => resolve(false); img.src = url; });
    setBusy(false);
    if (!valid) { setError('We couldn’t open that photo. Try a JPG or PNG.'); return; }
    setPending({ url }); go('confirm');
  };
  const back = () => {
    if (stage === 'location') go('address');
    else if (stage === 'welcome') go('address');
    else if (stage === 'safety') go('welcome');
    else if (stage === 'confirm') go('photo');
    else if (stage === 'review') { setIndex(6); go('photo'); }
    else if (stage === 'photo') { if (editing) { setEditing(false); go('review'); } else if (index > 0) setIndex(index - 1); else go('safety'); }
  };
  const primary = stage === 'address' ? 'Find my home' : stage === 'location' ? 'Confirm location' : stage === 'welcome' ? 'Start photos' : stage === 'safety' ? 'I understand' : stage === 'photo' ? busy ? 'Opening photo…' : 'Take photo' : stage === 'confirm' ? 'Use this photo' : stage === 'review' ? 'Submit photos' : 'Review my photos';
  const next = () => {
    if (stage === 'address') { if (address.trim().length < 8) { setError('Enter your street address, city and ZIP code.'); return; } go('location'); }
    else if (stage === 'location') go('welcome');
    else if (stage === 'welcome') go('safety');
    else if (stage === 'safety') go('photo');
    else if (stage === 'photo') input.current?.click();
    else if (stage === 'confirm' && pending) save(pending);
    else if (stage === 'review') { if (!shots.every((_, i) => photos[i]?.url || photos[i]?.demo)) { setError('Add all 7 photos before submitting.'); return; } setSampleResult('review'); go('result'); }
    else if (stage === 'result') go('review');
  };
  return <main className="sc-root">
    <div className="sc-shell">
      {stage === 'address' ? <PropertyLocator initial={property} onDone={value => { setProperty(value); setAddress(value.address); go('welcome'); }} /> : <>
      <section className="sc-content">
        <div className="sc-step">{['photo','confirm'].includes(stage) ? `Photo ${index + 1} of 7` : ['address','location'].includes(stage) ? '1 · Find your home' : ['welcome','safety'].includes(stage) ? '2 · Get ready' : stage === 'review' ? '4 · Review photos' : 'Demo result'}</div>
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        {stage === 'welcome' && <><p>We’ll guide you, one photo at a time.</p><Example index={1} /><div className="sc-facts"><span>7 photos</span><span>About 5 minutes</span></div></>}
        {stage === 'safety' && <><p>Only photograph what you can reach safely.</p><div className="sc-safety"><p>Open hinged doors only.</p><p>Never remove screws or covers.</p><p>Do not touch wires or switches.</p></div><p>All 7 photos are needed. Stop if a location is unsafe.</p></>}
        {stage === 'photo' && <><p>{shot.instruction}</p><Example index={index} /><div className="sc-angle">{shot.angle}</div><input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={upload} /><button className="sc-text-button" onClick={() => { setPending({ url: '', demo: true }); go('confirm'); }}>Try with example photo</button></>}
        {stage === 'confirm' && <><p>Can you see {index === 6 ? 'the main switch number' : 'the equipment and area'} clearly?</p>{pending?.demo ? <Example index={index} /> : <img className="sc-upload" src={pending?.url} alt={`Your photo: ${shot.title}`} />}<p className="sc-muted">{pending?.demo ? 'Example photo for this demo.' : 'Photo opened. Automated quality checks are not connected.'}</p><button className="sc-option" onClick={() => go('photo')}>Retake photo</button></>}
        {stage === 'review' && <><p>Check your photos before you submit.</p><div className="sc-address">{address}<small>Meter: {side.toLowerCase()}</small><small>{property?.source === 'example' ? 'Example property' : 'Property confirmed'} · {property?.frontUncertain ? 'Front needs review' : 'Front marked'}</small></div><div className="sc-photo-list">{shots.map((item, i) => <div key={item.title}>{photos[i]?.url ? <img src={photos[i].url} alt={item.title} /> : <Example index={i} small />}<div><strong>{item.title}</strong><span>{!photos[i] ? 'Photo missing' : photos[i].demo ? 'Example photo' : 'Photo added'}</span></div><button onClick={() => { setIndex(i); setEditing(true); go('photo'); }} aria-label={`Change ${item.title}`}>Edit</button></div>)}</div><p className="sc-muted">Demo submission only. Nothing is sent to Base.</p></>}
        {stage === 'result' && <><div className="sc-result-icon" aria-hidden="true">{sampleResult === 'qualified' ? '✓' : sampleResult === 'fail' ? '×' : '?'}</div><p>{sampleResult === 'qualified' ? 'Your next step would be installation planning.' : sampleResult === 'fail' ? 'Example reason: the available wall space does not meet the installation requirement.' : 'Some details need checking before a decision.'}</p><div className="sc-result-message"><strong>{sampleResult === 'qualified' ? 'Qualified lead — example' : sampleResult === 'fail' ? 'Does not qualify — example' : 'Manual review — demo'}</strong><p>No live assessment was performed. Your photos have not been sent.</p></div><details className="sc-team"><summary>Demo: team assessment</summary><p>Photo coverage: {shots.filter((_, i) => photos[i]?.url || photos[i]?.demo).length} of 7. This is completeness, not an eligibility score.</p><p>{sampleResult === 'review' ? 'No decision: analysis and approved Base rules are not connected.' : 'Illustrative result only. No score or decision was calculated from your photos.'}</p><p>Property context: {property?.propertyConfirmed ? 'confirmed' : 'unconfirmed'}; front {property?.frontUncertain ? 'unsure' : 'marked'}; meter {property?.meterUncertain ? 'unsure' : 'marked'}.</p><div className="sc-outcome-options">{(['qualified', 'fail', 'review'] as const).map(outcome => <button className="sc-option" key={outcome} aria-pressed={sampleResult === outcome} onClick={() => setSampleResult(outcome)}>{outcome === 'qualified' ? 'Qualified example' : outcome === 'fail' ? 'Fail example' : 'Human review example'}</button>)}</div></details></>}
        {error && <p className="sc-error" role="alert">{error}</p>}
      </section>
      <footer className="sc-actions"><button className="sc-primary" onClick={next} disabled={busy || (stage === 'location' && !side) || (stage === 'review' && !shots.every((_, i) => photos[i]?.url || photos[i]?.demo))}>{primary}</button>{stage !== 'result' && <button className="sc-back" onClick={back}>Back</button>}</footer></>}
    </div>
  </main>;
}
