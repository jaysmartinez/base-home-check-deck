'use client';

import { ChangeEvent, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import './simple-check.css';
import FindEquipment, { FindSubject } from './find-equipment';
import PropertyLocator, { PropertyContext } from './property-locator';

type Stage = 'address' | 'location' | 'welcome' | 'find' | 'photo' | 'confirm' | 'review' | 'result';
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
const breakerStart = shots.findIndex(shot => shot.title === 'Your breaker panel');

function useDialog(open: boolean, panel: RefObject<HTMLElement | null>, initialFocus: RefObject<HTMLElement | null>, close: () => void, suppressRestore?: RefObject<boolean>) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocus.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>('h2, button, [href], input, label')];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const skip = suppressRestore?.current;
      if (suppressRestore) suppressRestore.current = false;
      if (!skip && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, panel, initialFocus, close, suppressRestore]);
}

function Example({ index, small = false }: { index: number; small?: boolean }) {
  return <div role="img" aria-label={`Example: ${shots[index].title}. ${shots[index].angle}`} className={`sc-example sc-example-${shots[index].image} ${small ? 'sc-small' : ''}`}>
    {!small && <span className="sc-example-label">Example photo</span>}
  </div>;
}

export default function CustomerDeck() {
  const [stage, setStage] = useState<Stage>('address');
  const [address, setAddress] = useState('');
  const [property, setProperty] = useState<PropertyContext>();
  const [find, setFind] = useState<FindSubject>('meter');
  const side = property?.meterUncertain ? 'Location unsure' : 'Marked on property map';
  const [index, setIndex] = useState(0);
  const [photos, setPhotos] = useState<Record<number, Photo>>({});
  const [pending, setPending] = useState<Photo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sampleResult, setSampleResult] = useState<'review' | 'qualified' | 'fail'>('review');
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraGeneration, setCameraGeneration] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const safetyPanel = useRef<HTMLDivElement>(null);
  const safetyHeading = useRef<HTMLHeadingElement>(null);
  const photoPanel = useRef<HTMLDivElement>(null);
  const photoHeading = useRef<HTMLHeadingElement>(null);
  const cameraPanel = useRef<HTMLDivElement>(null);
  const cameraHeading = useRef<HTMLHeadingElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraSession = useRef(0);
  const suppressPhotoFocusRestore = useRef(false);
  const closeSafety = useCallback(() => setSafetyOpen(false), []);
  const closePhotoPicker = useCallback(() => setPhotoPickerOpen(false), []);
  const closeCamera = useCallback(() => {
    cameraSession.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setCameraError('');
    setCameraOpen(false);
  }, []);
  const urls = useRef<string[]>([]);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus(); }, [stage]);
  useEffect(() => {
    if (stage === 'review') return;
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [stage, index]);
  useEffect(() => {
    if (stage !== 'review') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      setIndex(current => event.key === 'ArrowLeft' ? (current + shots.length - 1) % shots.length : (current + 1) % shots.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);
  useDialog(safetyOpen, safetyPanel, safetyHeading, closeSafety);
  useDialog(photoPickerOpen, photoPanel, photoHeading, closePhotoPicker, suppressPhotoFocusRestore);
  useDialog(cameraOpen, cameraPanel, cameraHeading, closeCamera);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || !video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    let cancelled = false;
    const markReady = () => { if (!cancelled) setCameraReady(true); };
    video.addEventListener('playing', markReady);
    video.play().catch(() => { if (!cancelled && video.paused) setCameraError('The camera preview couldn’t start. Try again.'); });
    return () => { cancelled = true; video.removeEventListener('playing', markReady); };
  }, [cameraOpen, cameraGeneration]);
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);
  const go = (next: Stage) => { setError(''); setStage(next); };
  const shot = shots[index];
  const title = stage === 'address' ? 'Where is your home?' : stage === 'location' ? 'Where is your meter?' : stage === 'welcome' ? 'Let’s check your home' : stage === 'photo' ? shot.title : stage === 'confirm' ? 'Use this photo?' : stage === 'review' ? 'Review' : sampleResult === 'qualified' ? 'Your home may be a fit' : sampleResult === 'fail' ? 'This setup may not qualify' : 'Thanks! You’re all set.';
  const save = (photo: Photo) => {
    setPhotos(current => ({ ...current, [index]: photo })); setPending(null);
    if (editing) { setEditing(false); go('review'); }
    else if (index === shots.length - 1) { setIndex(0); go('review'); }
    else if (index === breakerStart - 1) { setFind('breaker'); go('find'); }
    else { setIndex(index + 1); go('photo'); }
  };
  const acceptFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Choose a photo, then try again.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('This photo is too large. Choose one under 20 MB.'); return; }
    setBusy(true); setError('');
    const url = URL.createObjectURL(file); urls.current.push(url);
    const valid = await new Promise<boolean>(resolve => { const img = new Image(); img.onload = () => resolve(img.width > 0); img.onerror = () => resolve(false); img.src = url; });
    setBusy(false);
    if (!valid) { setError('We couldn’t open that photo. Try a JPG or PNG.'); return; }
    setPending({ url }); go('confirm');
  };
  const onPickedFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setPhotoPickerOpen(false);
    closeCamera();
    void acceptFile(file);
  };
  const back = () => {
    if (stage === 'location') go('address');
    else if (stage === 'welcome') go('address');
    else if (stage === 'find') { if (find === 'breaker') { setIndex(breakerStart - 1); go('photo'); } else { setSafetyOpen(true); go('welcome'); } }
    else if (stage === 'confirm') go('photo');
    else if (stage === 'review') { setIndex(6); go('photo'); }
    else if (stage === 'result') go('review');
    else if (stage === 'photo') { if (editing) { setEditing(false); go('review'); } else if (index === breakerStart) { setFind('breaker'); go('find'); } else if (index > 0) setIndex(index - 1); else { setFind('meter'); go('find'); } }
  };
  const primary = stage === 'address' ? 'Find my home' : stage === 'location' ? 'Confirm location' : stage === 'welcome' ? 'Start' : stage === 'find' ? find === 'meter' ? 'Continue' : 'I found it' : stage === 'photo' ? busy ? 'Opening photo…' : 'Take photo' : stage === 'confirm' ? 'Use this photo' : stage === 'review' ? 'Submit' : 'Review my photos';
  const step = ['address', 'location'].includes(stage) ? '1 · Find your home' : 'Demo result';
  const acceptSafety = () => { setSafetyOpen(false); setFind('meter'); go('find'); };
  const openCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    const session = ++cameraSession.current;
    suppressPhotoFocusRestore.current = true;
    setCameraError('');
    setCameraReady(false);
    setPhotoPickerOpen(false);
    setCameraOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('The camera couldn’t open in this browser. You can choose a photo from your library instead.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(stream => {
      if (cameraSession.current !== session) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      setCameraGeneration(current => current + 1);
    }).catch(error => {
      if (cameraSession.current !== session) return;
      const name = error instanceof DOMException ? error.name : '';
      setCameraError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Camera access was blocked. Allow the camera in your browser, then try again.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError'
          ? 'No camera was found on this device.'
          : 'The camera couldn’t open. You can choose a photo from your library instead.');
    });
  };
  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) { setCameraError('The camera isn’t ready yet. Try again.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setCameraError('We couldn’t save that picture. Try again.'); return; }
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) { setCameraError('We couldn’t save that picture. Try again.'); return; }
    closeCamera();
    await acceptFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
  };
  const next = () => {
    if (stage === 'address') { if (address.trim().length < 8) { setError('Enter your street address, city and ZIP code.'); return; } go('location'); }
    else if (stage === 'location') go('welcome');
    else if (stage === 'welcome') setSafetyOpen(true);
    else if (stage === 'find') { setIndex(find === 'meter' ? 0 : breakerStart); go('photo'); }
    else if (stage === 'photo') setPhotoPickerOpen(true);
    else if (stage === 'confirm' && pending) save(pending);
    else if (stage === 'review') { if (!shots.every((_, i) => photos[i]?.url || photos[i]?.demo)) { setError('Add all 7 photos before submitting.'); return; } setSampleResult('review'); go('result'); }
    else if (stage === 'result') go('review');
  };
  return <main className="sc-root">
    <div className={`sc-shell sc-stage-${stage}`} inert={safetyOpen || photoPickerOpen || cameraOpen || undefined}>
      {stage === 'address' ? <PropertyLocator initial={property} onDone={value => { setProperty(value); setAddress(value.address); go('welcome'); }} /> : <>
      {stage === 'find' ? <FindEquipment subject={find} headingRef={heading} onBack={back} /> : <section className="sc-content">
        {stage === 'welcome' && <TopBack onClick={back} />}
        {stage !== 'welcome' && stage !== 'result' && <div className="sc-topbar"><TopBack onClick={back} />{!['photo', 'confirm', 'review'].includes(stage) && <div className="sc-step">{step}</div>}{stage === 'photo' && <button type="button" className="sc-example-btn" aria-label="Try with example photo" onClick={() => save({ url: '', demo: true })}>E</button>}</div>}
        {stage === 'result' && sampleResult !== 'review' && <div className="sc-step">{step}</div>}
        {!(stage === 'result' && sampleResult === 'review') && <h1 ref={heading} tabIndex={-1}>{title}</h1>}
        {stage === 'welcome' && <><div className="sc-welcome-pair"><img src="/find-meter.webp" alt="Person photographing an electric meter on the outside wall of a house" /><img src="/find-breaker.webp" alt="Person photographing an open breaker panel in a garage" /></div><div className="sc-facts"><span>This should take only a few minutes</span></div></>}
        {stage === 'photo' && <><p>{shot.instruction}</p><Example index={index} /><div className="sc-angle">{shot.angle}</div></>}
        {stage === 'confirm' && <><p>Can you see {index === 6 ? 'the main switch number' : 'the equipment and area'} clearly?</p>{pending?.demo ? <Example index={index} /> : <img className="sc-upload" src={pending?.url} alt={`Your photo: ${shot.title}`} />}<p className="sc-muted">{pending?.demo ? 'Example photo for this demo.' : 'Photo opened. Automated quality checks are not connected.'}</p><button className="sc-option" onClick={() => go('photo')}>Retake photo</button></>}
        {stage === 'review' && <div className="sc-review">
          <div className="sc-review-viewer">
            <button type="button" className="sc-review-nav" aria-label="Previous photo" onClick={() => setIndex(current => (current + shots.length - 1) % shots.length)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            <div className="sc-review-photo">{photos[index]?.url ? <img src={photos[index].url} alt={shot.title} /> : <Example index={index} small />}</div>
            <button type="button" className="sc-review-nav" aria-label="Next photo" onClick={() => setIndex(current => (current + 1) % shots.length)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          </div>
          <p className="sc-review-caption" aria-live="polite"><strong>{shot.title}</strong><span>{index + 1} of {shots.length}</span><span>{!photos[index] ? 'Photo missing' : photos[index].demo ? 'Example photo' : 'Photo added'}</span></p>
          <button type="button" className="sc-option" onClick={() => { setEditing(true); go('photo'); }} aria-label={`Change ${shot.title}`}>Edit</button>
        </div>}
        {stage === 'result' && sampleResult === 'review' && <div className="sc-result-final">
          <TopBack onClick={back} />
          <img className="sc-result-logo" src="/base-logo.svg" alt="Base Power" />
          <div className="sc-result-success" aria-hidden="true"><svg viewBox="0 0 72 72"><path d="m19 37 12 12 23-30" /></svg></div>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          <p className="sc-result-received">We received your photos.</p>
          <div className="sc-result-next">
            <strong>What happens next</strong>
            <div><span>1</span><p>Our team reviews your photos.</p></div>
            <div><span>2</span><p>We contact you with next steps.</p></div>
          </div>
          <p className="sc-result-done"><span aria-hidden="true">✓</span>Nothing else is needed right now.</p>
        </div>}
        {stage === 'result' && sampleResult !== 'review' && <><div className="sc-result-icon" aria-hidden="true">{sampleResult === 'qualified' ? '✓' : '×'}</div><p>{sampleResult === 'qualified' ? 'Your next step would be installation planning.' : 'Example reason: the available wall space does not meet the installation requirement.'}</p><div className="sc-result-message"><strong>{sampleResult === 'qualified' ? 'Qualified lead — example' : 'Does not qualify — example'}</strong><p>No live assessment was performed. Your photos have not been sent.</p></div><details className="sc-team"><summary>Demo: team assessment</summary><p>Photo coverage: {shots.filter((_, i) => photos[i]?.url || photos[i]?.demo).length} of 7. This is completeness, not an eligibility score.</p><p>Illustrative result only. No score or decision was calculated from your photos.</p><p>Property context: {property?.propertyConfirmed ? 'confirmed' : 'unconfirmed'}; front {property?.frontUncertain ? 'unsure' : 'marked'}; meter {property?.meterUncertain ? 'unsure' : 'marked'}.</p><div className="sc-outcome-options">{(['qualified', 'fail', 'review'] as const).map(outcome => <button className="sc-option" key={outcome} aria-pressed={sampleResult === outcome} onClick={() => setSampleResult(outcome)}>{outcome === 'qualified' ? 'Qualified example' : outcome === 'fail' ? 'Fail example' : 'Human review example'}</button>)}</div></details></>}
        {error && <p className="sc-error" role="alert">{error}</p>}
      </section>}
      {!(stage === 'result' && sampleResult === 'review') && <footer className="sc-actions"><button className="sc-primary" onClick={next} disabled={busy || (stage === 'location' && !side) || (stage === 'review' && !shots.every((_, i) => photos[i]?.url || photos[i]?.demo))}>{primary}</button></footer>}</>}
    </div>
    {photoPickerOpen && <div className="sc-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closePhotoPicker(); }}>
      <div className="sc-photo-modal" role="dialog" aria-modal="true" aria-labelledby="photo-source-title" ref={photoPanel}>
        <TopBack onClick={closePhotoPicker} />
        <h2 id="photo-source-title" ref={photoHeading} tabIndex={-1}>Add a photo</h2>
        <p>Take a new picture, or choose one from your library.</p>
        <button type="button" className="sc-primary" onClick={openCamera}>Take picture</button>
        <label className="sc-option sc-pick">Select from library<input className="sc-file-input" type="file" accept="image/*" onChange={onPickedFile} /></label>
      </div>
    </div>}
    {cameraOpen && <div className="sc-camera-backdrop">
      <div className="sc-camera" role="dialog" aria-modal="true" aria-labelledby="camera-title" ref={cameraPanel}>
        <div className="sc-camera-bar"><TopBack onClick={closeCamera} /><h2 id="camera-title" ref={cameraHeading} tabIndex={-1}>{shot.title}</h2></div>
        <p className="sc-camera-hint">{shot.instruction}</p>
        <div className="sc-camera-stage">
          <video ref={videoRef} autoPlay playsInline muted disablePictureInPicture aria-label="Camera preview" />
          {!cameraReady && !cameraError && <p className="sc-camera-status">Opening camera…</p>}
        </div>
        {cameraError && <p className="sc-error" role="alert">{cameraError}</p>}
        <footer className="sc-actions">{cameraError
          ? <><button type="button" className="sc-primary" onClick={openCamera}>Try again</button><label className="sc-option sc-pick">Select from library<input className="sc-file-input" type="file" accept="image/*" onChange={onPickedFile} /></label></>
          : <button type="button" className="sc-primary" onClick={() => void capture()} disabled={!cameraReady || busy}>{busy ? 'Saving photo…' : 'Take picture'}</button>}</footer>
      </div>
    </div>}
    {safetyOpen && <div className="sc-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setSafetyOpen(false); }}>
      <div className="sc-safety-modal" role="dialog" aria-modal="true" aria-labelledby="safety-title" ref={safetyPanel}>
        <TopBack onClick={() => setSafetyOpen(false)} />
        <h2 id="safety-title" ref={safetyHeading} tabIndex={-1}>A quick safety check</h2>
        <p>Only photograph what you can reach safely.</p>
        <div className="sc-safety"><p>Open hinged doors only.</p><p>Never remove screws or covers.</p><p>Do not touch wires or switches.</p></div>
        <p>All 7 photos are needed. Stop if a location is unsafe.</p>
        <button className="sc-primary" onClick={acceptSafety}>I understand</button>
      </div>
    </div>}
  </main>;
}

function TopBack({ onClick }: { onClick: () => void }) {
  return <button type="button" className="pl-top-back" aria-label="Back" onClick={onClick}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H6M11 6.5 5.5 12 11 17.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button>;
}
