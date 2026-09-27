'use client';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';

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
type MapObject = { setCenter(p: Coordinate): void; getCenter(): LatLng | undefined; setZoom(n:number):void; getZoom(): number | undefined; addListener(t:string, cb:(e:{latLng?:LatLng})=>void): {remove():void} };
type Marker = { setMap(m:MapObject|null):void; setPosition(p:Coordinate):void };
type Maps = {
  Map: new (node:HTMLElement, options:Record<string,unknown>) => MapObject;
  Marker: new (options:Record<string,unknown>) => Marker;
  Geocoder: new () => { geocode(options:{address:string}|{location:Coordinate}): Promise<{results:Array<{formatted_address:string;place_id:string;types:string[];partial_match?:boolean;geometry:{location:LatLng}}>}> };
  importLibrary?(name:string): Promise<PlacesLibrary>;
};
type FormattableText = { text?: string; toString(): string };
type Place = { fetchFields(request:{fields:string[]}): Promise<unknown>; formattedAddress?: string | null; location?: LatLng | null };
type PlacePrediction = { text: FormattableText; placeId: string; mainText?: FormattableText | null; secondaryText?: FormattableText | null; toPlace(): Place };
type PlacesLibrary = {
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(request:{input:string;sessionToken?:object;includedRegionCodes?:string[];includedPrimaryTypes?:string[];language?:string;region?:string}): Promise<{suggestions:Array<{placePrediction:PlacePrediction|null}>}> };
  AutocompleteSessionToken: new () => object;
};
type AddressSuggestion = { placeId: string; label: string; main: string; secondary: string; toPlace: () => Place };
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
let placesLoading: Promise<PlacesLibrary> | null = null;
function textOf(value: FormattableText | null | undefined) {
  const text = value?.text?.trim();
  return text || value?.toString().trim() || '';
}
async function loadPlaces(maps: Maps) {
  if (placesLoading) return placesLoading;
  if (!maps.importLibrary) throw new Error('Places library is unavailable.');
  placesLoading = maps.importLibrary('places').catch(error => { placesLoading = null; throw error; });
  return placesLoading;
}

export default function PropertyLocator({ initial, onDone }: {initial?:PropertyContext;onDone:(value:PropertyContext)=>void}) {
  const [phase,setPhase] = useState<Phase>('search');
  const [query,setQuery] = useState(initial?.source === 'google' ? initial.address : '');
  const [context,setContext] = useState<PropertyContext>(initial || {address:'',source:'example',frontUncertain:false,meterUncertain:false,propertyConfirmed:false});
  const [active,setActive] = useState(false);
  const [busy,setBusy] = useState(false);
  const [locating,setLocating] = useState(false);
  const [error,setError] = useState('');
  const [suggestions,setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestOpen,setSuggestOpen] = useState(false);
  const [activeSuggestion,setActiveSuggestion] = useState(-1);
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapObject|null>(null);
  const markers = useRef<Record<string,Marker>>({});
  const mapFrame = useRef<number|null>(null);
  const currentPhase = useRef(phase);
  const clickListener = useRef<{remove():void}|null>(null);
  const heading = useRef<HTMLElement | null>(null);
  const setHeading = (node: HTMLElement | null) => { heading.current = node; };
  const addressInput = useRef<HTMLInputElement>(null);
  const [popBox,setPopBox] = useState<{top:number;left:number;width:number;maxHeight:number}|null>(null);
  const suggestTimer = useRef<number | null>(null);
  const suggestRequest = useRef(0);
  const sessionToken = useRef<object | null>(null);
  const changePhase = (next:Phase) => { setError(''); setPhase(next); };
  useEffect(() => { currentPhase.current = phase; }, [phase]);
  useEffect(() => { heading.current?.focus({preventScroll:true}); window.scrollTo(0,0); },[phase]);
  useEffect(() => () => { if(mapFrame.current) cancelAnimationFrame(mapFrame.current); if(suggestTimer.current) window.clearTimeout(suggestTimer.current); clickListener.current?.remove(); Object.values(markers.current).forEach(m=>m.setMap(null)); },[]);
  const mark = (kind:string, point:Coordinate, maps:Maps) => {
    if(markers.current[kind]) markers.current[kind].setPosition(point);
    else markers.current[kind] = new maps.Marker({map:map.current,position:point,label:{text:kind === 'house'?'H':kind === 'front'?'F':'M',color:'white',fontWeight:'bold'},title:kind === 'front' ? 'Front of house' : kind === 'meter' ? 'Meter location' : 'House location'});
  };
  const putPoint = (kind:Phase, point:Coordinate, maps:Maps) => {
    if(kind === 'search') return;
    mark(kind, point, maps);
    setContext(c=>({...c,[kind]:point,...(kind==='front'?{frontUncertain:false}:kind==='meter'?{meterUncertain:false}:{})}));
  };
  const showProperty = (maps:Maps, point:Coordinate, address:string, placeId?:string) => {
    setContext({address,placeId,source:'google',house:point,frontUncertain:false,meterUncertain:false,propertyConfirmed:false});
    setActive(true); changePhase('house');
    mapFrame.current = requestAnimationFrame(() => {
      if(!mapNode.current) return;
      Object.values(markers.current).forEach(m=>m.setMap(null)); markers.current={};
      if(!map.current) {
        map.current = new maps.Map(mapNode.current,{center:point,zoom:20,mapTypeId:'roadmap',tilt:0,heading:0,disableDefaultUI:true,zoomControl:true,gestureHandling:'cooperative',clickableIcons:false});
        clickListener.current = map.current.addListener('click',e=>{if(e.latLng) putPoint(currentPhase.current,e.latLng.toJSON(),maps);});
      } else { map.current.setCenter(point); map.current.setZoom(20); }
      mark('house',point,maps);
    });
  };
  const closeSuggestions = () => { suggestRequest.current += 1; setSuggestions([]); setSuggestOpen(false); setActiveSuggestion(-1); };
  const placeSuggestions = () => {
    const rect = addressInput.current?.getBoundingClientRect();
    if (!rect) return;
    const space = window.innerHeight - rect.bottom - 16;
    setPopBox({ top: rect.bottom + 8, left: rect.left, width: rect.width, maxHeight: Math.max(96, Math.min(240, space - 28)) });
  };
  useEffect(() => {
    if (!suggestOpen) return;
    placeSuggestions();
    const update = () => placeSuggestions();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [suggestOpen]);
  const onQueryChange = (value: string) => {
    setQuery(value);
    setActiveSuggestion(-1);
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    const trimmed = value.trim();
    if (!apiKey || trimmed.length < 3) { closeSuggestions(); return; }
    suggestTimer.current = window.setTimeout(() => { void fetchSuggestions(trimmed); }, 250);
  };
  const fetchSuggestions = async (input: string) => {
    const requestId = ++suggestRequest.current;
    try {
      const maps = await loadMaps(apiKey);
      const places = await loadPlaces(maps);
      if (!sessionToken.current) sessionToken.current = new places.AutocompleteSessionToken();
      const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionToken.current,
        includedRegionCodes: ['us'],
        includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
        language: 'en',
        region: 'us',
      });
      if (requestId !== suggestRequest.current || currentPhase.current !== 'search') return;
      const next = results.flatMap(item => {
        const prediction = item.placePrediction;
        if (!prediction) return [];
        const label = textOf(prediction.text);
        if (!label) return [];
        const main = textOf(prediction.mainText) || label;
        return [{ placeId: prediction.placeId, label, main, secondary: textOf(prediction.secondaryText), toPlace: () => prediction.toPlace() }];
      });
      setSuggestions(next);
      if (next.length) placeSuggestions();
      setSuggestOpen(next.length > 0);
      setActiveSuggestion(next.length ? 0 : -1);
    } catch {
      if (requestId === suggestRequest.current) closeSuggestions();
    }
  };
  const chooseSuggestion = async (item: AddressSuggestion) => {
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    closeSuggestions();
    setQuery(item.label);
    setBusy(true); setError('');
    try {
      const maps = await loadMaps(apiKey);
      const place = item.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });
      sessionToken.current = null;
      const point = place.location?.toJSON();
      const address = place.formattedAddress || item.label;
      setQuery(address);
      if (!point) { setError('We couldn’t pinpoint that address. Try it again.'); return; }
      showProperty(maps, point, address, item.placeId);
    } catch {
      sessionToken.current = null;
      setError('We couldn’t load that address. Try it again.');
    } finally { setBusy(false); }
  };
  const onAddressKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setSuggestOpen(false); return; }
    if (!suggestOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveSuggestion(index => (index + 1) % suggestions.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSuggestion(index => index <= 0 ? suggestions.length - 1 : index - 1); }
    else if (event.key === 'Enter' && activeSuggestion >= 0) { event.preventDefault(); void chooseSuggestion(suggestions[activeSuggestion]); }
  };
  const search = async () => {
    closeSuggestions();
    if(!query.trim()) { setError('Enter your street address, city and ZIP code.'); return; }
    if(!apiKey) { setError('Live map search is not connected yet.'); return; }
    setBusy(true); setError('');
    try {
      const maps = await loadMaps(apiKey);
      const {results} = await new maps.Geocoder().geocode({address:query.trim()});
      const result = results[0];
      if(!result || result.partial_match || !result.types.some(t=>['street_address','premise','subpremise'].includes(t))) { setError('We couldn’t find an exact home. Add the house number, city and ZIP code, then try again.'); return; }
      const point = result.geometry.location.toJSON();
      showProperty(maps,point,result.formatted_address,result.place_id);
    } catch (error) { setError(error instanceof Error && error.message.includes('not allowed to use the geocoder') ? 'Address lookup isn’t available right now. Use your current location instead.' : 'We couldn’t load your home. Check the Maps connection and try again.'); }
    finally { setBusy(false); }
  };
  const useLocation = () => {
    if(!navigator.geolocation) { setError('Location sharing is not available on this device. Enter your address instead.'); return; }
    if(!apiKey) { setError('Location sharing needs the live map connection. Enter your address to try the demo.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const point = {lat:position.coords.latitude,lng:position.coords.longitude};
        const maps = await loadMaps(apiKey);
        let address = 'Your current location';
        let placeId: string | undefined;
        try {
          const {results} = await new maps.Geocoder().geocode({location:point});
          if(results?.[0]?.formatted_address) address = results[0].formatted_address;
          placeId = results?.[0]?.place_id;
        } catch { /* Shared coordinates can still center the map. */ }
        showProperty(maps,point,address,placeId);
      } catch { setError('We couldn’t open the map. Enter your address instead.'); }
      finally { setLocating(false); }
    }, error => {
      setLocating(false);
      setError(error.code === 1 ? 'Location was not shared. Enter your address instead.' : 'We couldn’t find your location. Enter your address instead.');
    }, {enableHighAccuracy:true,timeout:12000,maximumAge:300000});
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
  return <section className={`pl-flow pl-phase-${phase}`}>
    <div className="sc-content">
      {phase === 'house' && <button type="button" className="pl-top-back" aria-label="Back" onClick={() => changePhase('search')}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H6M11 6.5 5.5 12 11 17.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button>}
      {(phase === 'front' || phase === 'meter') && <div className="pl-front-bar"><button type="button" className="pl-top-back" aria-label="Back" onClick={() => changePhase(phase === 'front' ? 'house' : 'front')}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H6M11 6.5 5.5 12 11 17.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg></button><p ref={setHeading} tabIndex={-1}>{phase === 'front' ? 'Tap the front entrance on your house.' : 'Tap the wall where your meter is located.'}</p></div>}
      {phase === 'house' && <h1 ref={setHeading} tabIndex={-1}>Does this look familiar?</h1>}
      {phase==='search' && <form className="pl-start" onSubmit={e=>{e.preventDefault();void search();}}><label htmlFor="map-address">address</label><div className="pl-address-field"><input ref={addressInput} id="map-address" role="combobox" aria-autocomplete="list" aria-expanded={suggestOpen} aria-controls="map-address-list" aria-activedescendant={suggestOpen && activeSuggestion >= 0 ? `map-address-option-${activeSuggestion}` : undefined} autoComplete="off" value={query} onChange={e=>onQueryChange(e.target.value)} onKeyDown={onAddressKeyDown} placeholder="Street, city and ZIP code"/>{suggestOpen && popBox && <div className="pl-suggest-pop" style={{top:popBox.top,left:popBox.left,width:popBox.width}}><ul id="map-address-list" className="pl-suggestions" role="listbox" aria-label="Address suggestions" style={{maxHeight:popBox.maxHeight}}>{suggestions.map((item, index) => <li key={item.placeId} id={`map-address-option-${index}`} role="option" aria-selected={index === activeSuggestion}><button type="button" onMouseDown={event=>{event.preventDefault();void chooseSuggestion(item);}} onMouseEnter={()=>setActiveSuggestion(index)}><strong>{item.main}</strong>{item.secondary && <span>{item.secondary}</span>}</button></li>)}</ul><p className="pl-powered"><img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google"/></p></div>}</div><div className="pl-or" aria-hidden="true"><span>or</span></div><button type="button" className="sc-option pl-location" disabled={busy||locating} onClick={useLocation}>{locating?'Finding your location…':'Use my current location'}</button></form>}
      {active && phase==='house' && context.source==='google' && <div className="pl-address">{context.address}</div>}
      <div className={`pl-map-wrap ${phase==='search'?'pl-map-hidden':''}`} aria-hidden={phase==='search'}>
        <div ref={mapNode} className="pl-google-map" style={{display:active && context.source==='google'?'block':'none'}} aria-label="Google property map" />
        {(!active || context.source==='example') && <div className={`pl-reference ${phase==='front'||phase==='meter'?'pl-selectable':''}`} role="group" aria-label="Reference map example, not a searched property" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();selectExample({x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height});}}>
          <img src="/property-map-reference.png" alt="Reference map showing neighboring house footprints" draggable={false}/>
          <span className="pl-example-badge">Example map</span>
          {context.exampleFront && <span className="pl-pin pl-front" style={{left:`${context.exampleFront.x*100}%`,top:`${context.exampleFront.y*100}%`}}>F<span>Front</span></span>}
          {context.exampleMeter && <span className="pl-pin pl-meter" style={{left:`${context.exampleMeter.x*100}%`,top:`${context.exampleMeter.y*100}%`}}>M<span>Meter</span></span>}
        </div>}
      </div>
      {(phase==='front'||phase==='meter') && <>
        {context.source==='example' && <details className="pl-keyboard"><summary>Choose without tapping the map</summary><div className="pl-position-buttons">{[{label:'Top',x:.55,y:.29},{label:'Right',x:.76,y:.55},{label:'Bottom',x:.47,y:.74},{label:'Left',x:.3,y:.5}].map(p=><button key={p.label} onClick={()=>selectExample(p)}>{p.label}</button>)}</div></details>}
        {((phase==='front' && context.frontUncertain) || (phase==='meter' && context.meterUncertain)) && <p className="pl-selection" aria-live="polite">{phase==='front'?'Front marked as unsure':'Meter marked as unsure'}</p>}
      </>}
      {error && <p className="sc-error" role="alert">{error}</p>}
    </div>
    {phase!=='search' && <footer className="sc-actions"><button className="sc-primary" disabled={!ready} onClick={advance}>Confirm</button></footer>}
  </section>;
}
