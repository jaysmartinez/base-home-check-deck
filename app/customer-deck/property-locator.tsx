'use client';
import { useEffect, useRef, useState } from 'react';

type Coordinate = { lat: number; lng: number };
type Point = { x: number; y: number };
export type PropertyContext = {
  address: string; source: 'google' | 'example'; placeId?: string;
  house?: Coordinate; front?: Coordinate; meter?: Coordinate;
  exampleFront?: Point; exampleMeter?: Point;
  frontUncertain: boolean; meterUncertain: boolean; propertyConfirmed: boolean;
};
type Phase = 'search' | 'house' | 'front' | 'meter';
type LatLng = { toJSON(): Coordinate };
type MapObject = { setCenter(p: Coordinate): void; getCenter(): LatLng | undefined; setZoom(n:number):void; getZoom(): number | undefined; setMapTypeId(t:string):void; addListener(t:string, cb:(e:{latLng?:LatLng})=>void): {remove():void} };
type Marker = { setMap(m:MapObject|null):void; setPosition(p:Coordinate):void };
type Maps = {
  Map: new (node:HTMLElement, options:Record<string,unknown>) => MapObject;
  Marker: new (options:Record<string,unknown>) => Marker;
  Geocoder: new () => { geocode(options:{address:string}): Promise<{results:Array<{formatted_address:string;place_id:string;types:string[];partial_match?:boolean;geometry:{location:LatLng}}>}> };
};
declare global { interface Window { google?: {maps:Maps}; __baseMapsReady?:()=>void; gm_authFailure?:()=>void } }
let mapsLoading: Promise<Maps> | null = null;
function loadMaps(key:string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<Maps>((resolve,reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail(), 15000);
    const fail = () => { clearTimeout(timer); script.remove(); mapsLoading=null; reject(new Error('Maps could not load. Please try again.')); };
    window.__baseMapsReady = () => { clearTimeout(timer); if(window.google?.maps) resolve(window.google.maps); else fail(); };
    window.gm_authFailure = fail;
    script.async = true; script.onerror = fail;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=quarterly&callback=__baseMapsReady`;
    document.head.appendChild(script);
  });
  return mapsLoading;
}
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function PropertyLocator({ initial, onDone }: {initial?:PropertyContext;onDone:(value:PropertyContext)=>void}) {
  const [phase,setPhase] = useState<Phase>('search');
  const [query,setQuery] = useState(initial?.source === 'google' ? initial.address : '');
  const [context,setContext] = useState<PropertyContext>(initial || {address:'',source:'example',frontUncertain:false,meterUncertain:false,propertyConfirmed:false});
  const [active,setActive] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [mapType,setMapType] = useState('satellite');
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapObject|null>(null);
  const markers = useRef<Record<string,Marker>>({});
  const currentPhase = useRef(phase);
  const clickListener = useRef<{remove():void}|null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const changePhase = (next:Phase) => { setError(''); setPhase(next); };
  useEffect(() => { currentPhase.current = phase; }, [phase]);
  useEffect(() => { heading.current?.focus({preventScroll:true}); window.scrollTo(0,0); },[phase]);
  useEffect(() => () => { clickListener.current?.remove(); Object.values(markers.current).forEach(m=>m.setMap(null)); },[]);
  const mark = (kind:string, point:Coordinate, maps:Maps) => {
    if(markers.current[kind]) markers.current[kind].setPosition(point);
    else markers.current[kind] = new maps.Marker({map:map.current,position:point,label:{text:kind === 'house'?'H':kind === 'front'?'F':'M',color:'white',fontWeight:'bold'},title:kind === 'front' ? 'Front of house' : kind === 'meter' ? 'Meter location' : 'House location'});
  };
  const putPoint = (kind:Phase, point:Coordinate, maps:Maps) => {
    if(kind === 'search') return;
    mark(kind, point, maps);
    setContext(c=>({...c,[kind]:point,...(kind==='front'?{frontUncertain:false}:kind==='meter'?{meterUncertain:false}:{})}));
  };
  const search = async () => {
    if(!query.trim()) { setError('Enter your street address, city and ZIP code.'); return; }
    if(!apiKey) { setError('Live map search is not connected yet. Use the example below to try the steps.'); return; }
    setBusy(true); setError('');
    try {
      const maps = await loadMaps(apiKey);
      const {results} = await new maps.Geocoder().geocode({address:query.trim()});
      const result = results[0];
      if(!result || result.partial_match || !result.types.some(t=>['street_address','premise','subpremise'].includes(t))) { setError('We couldn’t find an exact home. Add the house number, city and ZIP code, then try again.'); return; }
      if(!mapNode.current) return;
      mapNode.current.style.display = 'block';
      const point = result.geometry.location.toJSON();
      Object.values(markers.current).forEach(m=>m.setMap(null)); markers.current={};
      if(!map.current) {
        map.current = new maps.Map(mapNode.current,{center:point,zoom:20,mapTypeId:'satellite',tilt:0,heading:0,disableDefaultUI:true,zoomControl:true,gestureHandling:'cooperative',clickableIcons:false});
        clickListener.current = map.current.addListener('click',e=>{if(e.latLng) putPoint(currentPhase.current,e.latLng.toJSON(),maps);});
      } else { map.current.setCenter(point); map.current.setZoom(20); }
      mark('house',point,maps);
      setContext({address:result.formatted_address,placeId:result.place_id,source:'google',house:point,frontUncertain:false,meterUncertain:false,propertyConfirmed:false});
      setActive(true); changePhase('house');
    } catch { setError('We couldn’t load your home. Check the Maps connection and try again.'); }
    finally { setBusy(false); }
  };
  const example = () => {
    setContext({address:'Example property from your reference',source:'example',frontUncertain:false,meterUncertain:false,propertyConfirmed:false});
    setActive(true); changePhase('house');
  };
  const selectExample = (point:Point) => {
    if(phase === 'front') setContext(c=>({...c,exampleFront:point,frontUncertain:false}));
    if(phase === 'meter') setContext(c=>({...c,exampleMeter:point,meterUncertain:false}));
  };
  const ready = phase==='house' || (phase==='front' && !!(context.front || context.exampleFront || context.frontUncertain)) || (phase==='meter' && !!(context.meter || context.exampleMeter || context.meterUncertain));
  const advance = () => {
    if(phase==='house') {setContext(c=>({...c,propertyConfirmed:true}));changePhase('front');}
    else if(phase==='front') changePhase('meter');
    else if(phase==='meter') onDone(context);
  };
  return <section className="pl-flow">
    <div className="sc-content">
      {phase !== 'search' && <div className="sc-step">{phase==='house'?'1 of 3 · Confirm your house':phase==='front'?'2 of 3 · Mark the front':'3 of 3 · Mark the meter'}</div>}
      <h1 ref={heading} tabIndex={-1}>{phase==='search'?'Find your home':phase==='house'?'Is this your house?':phase==='front'?'Where is the front?':'Where is your meter?'}</h1>
      {phase !== 'search' && <p>{phase==='house'?'Confirm that this is your house':phase==='front'?'Tap the front entrance on your house.':'Tap the wall where your meter is located.'}</p>}
      {phase==='search' && <form onSubmit={e=>{e.preventDefault();void search();}}><label htmlFor="map-address">Home address</label><input id="map-address" autoComplete="street-address" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Street, city and ZIP code"/><button className="sc-primary pl-search" disabled={busy}>{busy?'Finding your home…':'Search map'}</button><p className="sc-muted">{apiKey?'Your address is sent to Google to find your home.':'Live Google Maps needs to be connected.'}</p></form>}
      {active && phase!=='search' && context.source==='google' && <div className="pl-address">{context.address}</div>}
      <div className={`pl-map-wrap ${phase==='search'?'pl-map-preview':''}`}>
        <div ref={mapNode} className="pl-google-map" style={{display:active && context.source==='google'?'block':'none'}} aria-label="Google property map" />
        {(!active || context.source==='example') && <div className={`pl-reference ${phase==='front'||phase==='meter'?'pl-selectable':''}`} role="group" aria-label="Reference map example, not a searched property" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();selectExample({x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height});}}>
          <img src="/property-map-reference.png" alt="Reference map showing neighboring house footprints" draggable={false}/>
          <span className="pl-example-badge">Example map</span>
          {context.exampleFront && <span className="pl-pin pl-front" style={{left:`${context.exampleFront.x*100}%`,top:`${context.exampleFront.y*100}%`}}>F<span>Front</span></span>}
          {context.exampleMeter && <span className="pl-pin pl-meter" style={{left:`${context.exampleMeter.x*100}%`,top:`${context.exampleMeter.y*100}%`}}>M<span>Meter</span></span>}
        </div>}
      </div>
      {active && context.source==='google' && <div className="pl-map-tools"><button onClick={()=>{const next=mapType==='satellite'?'roadmap':'satellite';setMapType(next);map.current?.setMapTypeId(next);}}>{mapType==='satellite'?'Show house outlines':'Show satellite'}</button><button onClick={()=>{if(context.house) map.current?.setCenter(context.house);}}>Recenter house</button></div>}
      {phase==='house' && <>{context.source==='google' && <p className="sc-muted">If the pin is off, tap your roof to move it.</p>}<button className="sc-text-button" onClick={()=>{setActive(false);changePhase('search');}}>Search a different address</button></>}
      {(phase==='front'||phase==='meter') && <>
        {context.source==='example' && <details className="pl-keyboard"><summary>Choose without tapping the map</summary><div className="pl-position-buttons">{[{label:'Top',x:.55,y:.29},{label:'Right',x:.76,y:.55},{label:'Bottom',x:.47,y:.74},{label:'Left',x:.3,y:.5}].map(p=><button key={p.label} onClick={()=>selectExample(p)}>{p.label}</button>)}</div></details>}
        {context.source==='google' && <button className="sc-option" onClick={()=>{const center=map.current?.getCenter();if(center&&window.google) putPoint(phase,center.toJSON(),window.google.maps);}}>Use the center of the map</button>}
        <p className="pl-selection" aria-live="polite">{phase==='front'?(context.frontUncertain?'Front marked as unsure':context.front||context.exampleFront?'Front marked · tap again to move it':''):(context.meterUncertain?'Meter marked as unsure':context.meter||context.exampleMeter?'Meter marked · tap again to move it':'Tap once to place the meter marker')}</p>
      </>}
      {error && <p className="sc-error" role="alert">{error}</p>}
    </div>
    {phase==='search' && <footer className="sc-actions"><button className="sc-primary" disabled={busy} onClick={apiKey ? () => { void search(); } : example}>Next</button></footer>}
    {phase!=='search' && <footer className="sc-actions"><button className="sc-primary" disabled={!ready} onClick={advance}>{phase==='house'?'Confirmed':phase==='front'?'Confirm front':'Confirm meter location'}</button><button className="sc-back" onClick={()=>changePhase(phase==='house'?'search':phase==='front'?'house':'front')}>Back</button></footer>}
  </section>;
}
