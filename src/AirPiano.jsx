/**
 * Paper Piano  —  PepperHorn × Creative Ranges Foundation
 *
 * v3.1: Marker-based key detection (no homography calibration needed)
 *  - ArUco markers above each key define positions in camera space
 *  - Scan learns all marker positions in 2 seconds
 *  - Finger positions compared directly to scanned marker positions
 *  - Ribbon strip uses 10 markers for spatial reference
 *  - Control buttons still use ghost-marker detection (cover to activate)
 */

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { CHORD_TYPES, buildChordNotes, ARP_PATTERNS, ARP_RATES, ArpEngine } from "./engines.js";

// ─── Tag ID map (must match piano_template_v3.html) ─────────────────────────
const TAG = {
  // Position markers — octave 1 (0-6, 8-12): stay visible during play
  C4:0, D4:1, E4:2, F4:3, G4:4, A4:5, B4:6,
  Cs4:8, Ds4:9, Fs4:10, Gs4:11, As4:12,
  // Ribbon (13-22)
  RIB_0:13, RIB_1:14, RIB_2:15, RIB_3:16, RIB_4:17,
  RIB_5:18, RIB_6:19, RIB_7:20, RIB_8:21, RIB_9:22,
  // Control markers (23-45): ghost detection (cover with object to activate)
  CHORD_MAJ:23, CHORD_MIN:24, CHORD_MAJ7:25, CHORD_DOM7:26,
  CHORD_HDIM:27, CHORD_DIM:28, CHORD_AUG:29, CHORD_PWR:30,
  ARP_OFF:31, ARP_UP:32, ARP_DOWN:33, ARP_UPDOWN:34, ARP_RANDOM:35,
  RATE_WHOLE:36, RATE_HALF:37, RATE_QUARTER:38, RATE_EIGHTH:39, RATE_16TH:40,
  OCT_DOWN:41, OCT_UP:42, SUSTAIN:43,
  MODE_MOD:44, MODE_VOL:45,
  // Position markers — octave 2 (46-52, 53-57)
  C5:46, D5:47, E5:48, F5:49, G5:50, A5:51, B5:52,
  Cs5:53, Ds5:54, Fs5:55, Gs5:56, As5:57,
  // Top C (58)
  C6:58,
};
const TAG_INV = Object.fromEntries(Object.entries(TAG).map(([k,v])=>[v,k]));

// Position markers (0-22 + 46-58) should never trigger ghost-marker actions
const POSITION_TAGS = new Set([
  ...Array.from({length:23}, (_,i) => i),
  ...Array.from({length:13}, (_,i) => 46+i),
]);

const CHORD_TAG_MAP = {
  [TAG.CHORD_MAJ]:'maj',[TAG.CHORD_MIN]:'min',[TAG.CHORD_MAJ7]:'maj7',
  [TAG.CHORD_DOM7]:'dom7',[TAG.CHORD_HDIM]:'hdim',[TAG.CHORD_DIM]:'dim',
  [TAG.CHORD_AUG]:'aug',[TAG.CHORD_PWR]:'pwr',
};
const ARP_PAT_TAG = {
  [TAG.ARP_OFF]:'off',[TAG.ARP_UP]:'up',[TAG.ARP_DOWN]:'down',
  [TAG.ARP_UPDOWN]:'updown',[TAG.ARP_RANDOM]:'random',
};
const ARP_RATE_TAG = {
  [TAG.RATE_WHOLE]:'whole',[TAG.RATE_HALF]:'half',[TAG.RATE_QUARTER]:'quarter',
  [TAG.RATE_EIGHTH]:'eighth',[TAG.RATE_16TH]:'sixteenth',
};

// ─── Keyboard builder ─────────────────────────────────────────────────────────
const CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FREQ_RATIOS = [1,1.0595,1.1225,1.1892,1.2599,1.3348,1.4142,1.4983,1.5874,1.6818,1.7818,1.8877];

function buildOctave(oct, tagOct) {
  const base = 261.63 * Math.pow(2, oct - 4);
  const whites = [
    {semi:0,label:'C',tkBase:'C'},{semi:2,label:'D',tkBase:'D'},{semi:4,label:'E',tkBase:'E'},
    {semi:5,label:'F',tkBase:'F'},{semi:7,label:'G',tkBase:'G'},{semi:9,label:'A',tkBase:'A'},
    {semi:11,label:'B',tkBase:'B'},
  ].map((k,i)=>({
    id:`${CHROMATIC[k.semi]}${oct}`,
    label:k.label, freq:base*FREQ_RATIOS[k.semi],
    semi:k.semi, tagId:TAG[`${k.tkBase}${tagOct}`], whiteIdx:i,
  }));
  const blacks = [
    {semi:1,label:'C#',tkBase:'Cs',lw:0},{semi:3,label:'D#',tkBase:'Ds',lw:1},
    {semi:6,label:'F#',tkBase:'Fs',lw:3},{semi:8,label:'G#',tkBase:'Gs',lw:4},
    {semi:10,label:'A#',tkBase:'As',lw:5},
  ].map(k=>({
    id:`${CHROMATIC[k.semi]}${oct}`,label:k.label,freq:base*FREQ_RATIOS[k.semi],
    semi:k.semi,tagId:TAG[`${k.tkBase}${tagOct}`],leftWhiteIdx:k.lw,isBlack:true,
  }));
  return {whites,blacks,all:[...whites,...blacks]};
}

// ─── Audio engine ─────────────────────────────────────────────────────────────
class AudioEngine {
  constructor(){
    this.ctx=null;this.masterGain=null;this.reverb=null;this.reverbGain=null;
    this.dryGain=null;this.compressor=null;this.activeNodes=new Map();
    this.adsr={attack:0.02,decay:0.1,sustain:0.7,release:0.3};
    this.waveform='triangle';this.volume=0.75;this.reverbAmount=0.25;
    this.onRecord=null;
  }
  init(){
    if(this.ctx)return;
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    this.compressor=this.ctx.createDynamicsCompressor();
    this.compressor.connect(this.ctx.destination);
    this.masterGain=this.ctx.createGain();this.masterGain.gain.value=this.volume;
    this.masterGain.connect(this.compressor);
    this.dryGain=this.ctx.createGain();this.dryGain.gain.value=1-this.reverbAmount;
    this.dryGain.connect(this.masterGain);
    this.reverbGain=this.ctx.createGain();this.reverbGain.gain.value=this.reverbAmount;
    this.reverbGain.connect(this.masterGain);
    const len=this.ctx.sampleRate*2.5,buf=this.ctx.createBuffer(2,len,this.ctx.sampleRate);
    for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.5);}
    this.reverb=this.ctx.createConvolver();this.reverb.buffer=buf;this.reverb.connect(this.reverbGain);
  }
  setVolume(v){this.volume=v;if(this.masterGain)this.masterGain.gain.setTargetAtTime(v,this.ctx.currentTime,0.01);}
  setReverb(v){this.reverbAmount=v;if(this.dryGain){this.dryGain.gain.setTargetAtTime(1-v,this.ctx.currentTime,0.01);this.reverbGain.gain.setTargetAtTime(v,this.ctx.currentTime,0.01);}}
  noteOn(id,freq,vel=1,at=null){
    if(!this.ctx)return;if(this.activeNodes.has(id))this.noteOff(id);
    const osc=this.ctx.createOscillator(),env=this.ctx.createGain();
    osc.type=this.waveform;osc.frequency.value=freq;
    const t=at??this.ctx.currentTime,{attack,decay,sustain}=this.adsr,pk=Math.min(1,vel*1.2);
    env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(pk,t+attack);
    env.gain.linearRampToValueAtTime(sustain*pk,t+attack+decay);
    osc.connect(env);env.connect(this.dryGain);env.connect(this.reverb);osc.start(t);
    this.activeNodes.set(id,{osc,env});
    if(this.onRecord){const delay=at?(at-this.ctx.currentTime)*1000:0;this.onRecord({type:'on',id,freq,vel,t:Date.now()+delay});}
  }
  noteOff(id,at=null){
    const node=this.activeNodes.get(id);if(!node)return;
    const {osc,env}=node,t=at??this.ctx.currentTime,{release}=this.adsr;
    env.gain.cancelScheduledValues(t);env.gain.setValueAtTime(env.gain.value,t);
    env.gain.linearRampToValueAtTime(0,t+release);osc.stop(t+release+0.05);
    this.activeNodes.delete(id);
    if(this.onRecord){const delay=at?(at-this.ctx.currentTime)*1000:0;this.onRecord({type:'off',id,t:Date.now()+delay});}
  }
  allNotesOff(){for(const id of this.activeNodes.keys())this.noteOff(id);}
}

// ─── Velocity tracker ─────────────────────────────────────────────────────────
class VelocityTracker {
  constructor(n=6){this.n=n;this.bufs={};}
  update(id,y){if(!this.bufs[id])this.bufs[id]=[];this.bufs[id].push({y,t:performance.now()});if(this.bufs[id].length>this.n)this.bufs[id].shift();}
  vel(id){const b=this.bufs[id];if(!b||b.length<2)return 0;const dt=(b[b.length-1].t-b[0].t)/1000;return dt<0.001?0:(b[b.length-1].y-b[0].y)/dt;}
}

// ─── Piano roll ───────────────────────────────────────────────────────────────
const MAX_ROLL=64;
function rollReducer(s,a){
  if(a.type==='ADD')return[{id:Date.now()+Math.random(),note:a.note,vel:a.vel},...s].slice(0,MAX_ROLL);
  if(a.type==='CLEAR')return[];return s;
}

// ─── Chord detection ──────────────────────────────────────────────────────────
const CHORD_PATS=[
  {name:'maj',i:[0,4,7]},{name:'min',i:[0,3,7]},{name:'dim',i:[0,3,6]},
  {name:'aug',i:[0,4,8]},{name:'sus2',i:[0,2,7]},{name:'sus4',i:[0,5,7]},
  {name:'maj7',i:[0,4,7,11]},{name:'min7',i:[0,3,7,10]},{name:'7',i:[0,4,7,10]},
];
function detectChord(semiSet){
  const semis=[...semiSet].sort((a,b)=>a-b);if(semis.length<2)return null;
  for(const root of semis){
    const norm=semis.map(s=>((s-root)%12+12)%12).sort((a,b)=>a-b);
    for(const pat of CHORD_PATS)if(pat.i.every((iv,i)=>norm[i]===iv)&&norm.length===pat.i.length)return`${CHROMATIC[root%12]} ${pat.name}`;
  }return null;
}

const FINGERTIP_IDS=[4,8,12,16,20];
const PRESS_VEL=0.35;

// ─── Main component ───────────────────────────────────────────────────────────
export default function AirPiano() {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const overlayRef  = useRef(null);
  const audio       = useRef(new AudioEngine());
  const velTrk      = useRef(new VelocityTracker());
  const pressedRef  = useRef(new Set());
  const sustainRef  = useRef(false);
  const sustainHeld = useRef(new Set());
  const knownMkrs   = useRef({});          // tagId→{cx,cy} — learned during scan
  const arpRef      = useRef(null);
  const detRef      = useRef(null);        // ArUco detector instance
  const fpsRef      = useRef({n:0,last:Date.now()});
  const scanRef     = useRef(false);
  const octUpDeb    = useRef(0);           // debounce for OCT_UP/DOWN objects
  const octDnDeb    = useRef(0);

  const [octave,setOctave]         = useState(4);
  const [waveform,setWaveform]     = useState('triangle');
  const [volume,setVolume]         = useState(0.75);
  const [reverbAmt,setReverbAmt]   = useState(0.25);
  const [bpm,setBpm]               = useState(120);
  const [adsr,setAdsr]             = useState({attack:0.02,decay:0.1,sustain:0.7,release:0.3});
  const [sustain,setSustain]       = useState(false);
  const [activeKeys,setActiveKeys] = useState(new Set());
  const [coveredTags,setCoveredTags]= useState(new Set());
  const [chordType,setChordType]   = useState(null);
  const [arpPattern,setArpPattern] = useState('off');
  const [arpRate,setArpRate]       = useState('eighth');
  const [ribbonMode,setRibbonMode] = useState('mod');
  const [ribbonValue,setRibbonValue]=useState(0);
  const [sustainObj,setSustainObj] = useState(false);
  const [status,setStatus]         = useState('loading');
  const [message,setMessage]       = useState('');
  const [scanning,setScanning]     = useState(false);
  const [camReady,setCamReady]     = useState(false);
  const [fps,setFps]               = useState(0);
  const [handCount,setHandCount]   = useState(0);
  const [showSettings,setShowSettings]=useState(false);
  const [chord,setChord]           = useState(null);
  const [roll,dispatch]            = useReducer(rollReducer,[]);

  // ── Recording slots ──
  const [recordings,setRecordings] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('pp_recordings')||'null')||Array(8).fill(null);}catch{return Array(8).fill(null);}
  });
  const [recArmed,setRecArmed]     = useState(false);
  const [recSlot,setRecSlot]       = useState(null);
  const [playSlot,setPlaySlot]     = useState(null);
  const recRef  = useRef({slot:null,start:0,events:[]});
  const playRef = useRef({timers:[],slot:null});

  // ── Tap tempo / metronome ──
  const tapTimesRef = useRef([]);
  const metroRef    = useRef(null);
  const [metroActive,setMetroActive] = useState(false);

  const oct1 = buildOctave(octave, 4);
  const oct2 = buildOctave(octave + 1, 5);
  oct2.whites.forEach((w, i) => w.whiteIdx = 7 + i);
  oct2.blacks.forEach(b => b.leftWhiteIdx += 7);
  const topC = {
    id:`C${octave+2}`, label:'C', freq:261.63*Math.pow(2,(octave+2)-4),
    semi:0, tagId:TAG.C6, whiteIdx:14,
  };
  const kb = { whites:[...oct1.whites,...oct2.whites,topC], blacks:[...oct1.blacks,...oct2.blacks], all:[...oct1.all,...oct2.all,topC] };

  // Ensure audio context is created/resumed on user gesture
  function ensureAudio() {
    if (!audio.current.ctx) {
      audio.current.init();
      arpRef.current = new ArpEngine(audio.current.ctx,
        (id,freq,vel,t)=>audio.current.noteOn(id,freq,vel,t),
        (id,t)=>audio.current.noteOff(id,t));
    } else if (audio.current.ctx.state === 'suspended') {
      audio.current.ctx.resume();
    }
  }

  // ── Recording functions ──
  function startRecording(slot){
    if(playSlot!==null)stopPlayback();
    recRef.current={slot,start:Date.now(),events:[]};
    audio.current.onRecord=(evt)=>{recRef.current.events.push({...evt,t:evt.t-recRef.current.start});};
    setRecSlot(slot);
  }
  function stopRecording(){
    audio.current.onRecord=null;
    const{slot,start,events}=recRef.current;
    if(slot===null||!events.length){setRecSlot(null);setRecArmed(false);return;}
    const duration=Date.now()-start;
    setRecordings(prev=>{
      const next=[...prev];next[slot]={events,duration};
      try{localStorage.setItem('pp_recordings',JSON.stringify(next));}catch{}
      return next;
    });
    setRecSlot(null);setRecArmed(false);
  }
  function playRecording(i){
    const rec=recordings[i];if(!rec)return;
    ensureAudio();stopPlayback();setPlaySlot(i);
    const timers=rec.events.map(evt=>
      setTimeout(()=>{if(evt.type==='on')audio.current.noteOn(evt.id,evt.freq,evt.vel);else audio.current.noteOff(evt.id);},evt.t)
    );
    timers.push(setTimeout(()=>{setPlaySlot(null);playRef.current={timers:[],slot:null};},rec.duration+200));
    playRef.current={timers,slot:i};
  }
  function stopPlayback(){
    playRef.current.timers.forEach(t=>clearTimeout(t));
    playRef.current={timers:[],slot:null};
    audio.current.allNotesOff();setPlaySlot(null);
  }
  function clearSlot(i){
    if(playSlot===i)stopPlayback();
    setRecordings(prev=>{
      const next=[...prev];next[i]=null;
      try{localStorage.setItem('pp_recordings',JSON.stringify(next));}catch{}
      return next;
    });
  }
  function handleSlotClick(i){
    if(recArmed){
      if(recSlot===i){stopRecording();}
      else{if(recSlot!==null)stopRecording();startRecording(i);}
    }else{
      if(playSlot===i)stopPlayback();
      else if(recordings[i])playRecording(i);
    }
  }

  // ── Tap tempo / metronome ──
  function metroClick(){
    if(!audio.current.ctx)return;
    const ctx=audio.current.ctx,osc=ctx.createOscillator(),g=ctx.createGain();
    osc.frequency.value=1000;osc.type='sine';
    g.gain.setValueAtTime(0.3,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.05);
    osc.connect(g);g.connect(audio.current.compressor);osc.start();osc.stop(ctx.currentTime+0.06);
  }
  function startMetronome(bpmVal){
    if(metroRef.current)clearInterval(metroRef.current);
    metroClick();
    metroRef.current=setInterval(metroClick,60000/bpmVal);
    setMetroActive(true);
  }
  function stopMetronome(){
    if(metroRef.current){clearInterval(metroRef.current);metroRef.current=null;}
    setMetroActive(false);
  }
  function handleTap(){
    ensureAudio();
    const now=Date.now();
    if(metroActive){stopMetronome();tapTimesRef.current=[];return;}
    tapTimesRef.current=tapTimesRef.current.filter(t=>now-t<2000);
    tapTimesRef.current.push(now);
    if(tapTimesRef.current.length>=2){
      const times=tapTimesRef.current,intervals=[];
      for(let i=1;i<times.length;i++)intervals.push(times[i]-times[i-1]);
      const avgMs=intervals.reduce((a,b)=>a+b,0)/intervals.length;
      const newBpm=Math.max(40,Math.min(240,Math.round(60000/avgMs)));
      setBpm(newBpm);startMetronome(newBpm);
    }
  }

  // Sync audio settings
  useEffect(()=>{audio.current.adsr=adsr;},[adsr]);
  useEffect(()=>{audio.current.waveform=waveform;},[waveform]);
  useEffect(()=>{audio.current.setVolume(volume);},[volume]);
  useEffect(()=>{if(audio.current.ctx)audio.current.setReverb(reverbAmt);},[reverbAmt]);

  // Arp engine sync
  const arpStateRef = useRef({pattern:'off',rate:'eighth',bpm:120});
  useEffect(()=>{
    arpStateRef.current={pattern:arpPattern,rate:arpRate,bpm};
    if(arpRef.current){
      arpRef.current.setPattern(arpPattern);arpRef.current.setRate(arpRate);arpRef.current.setBPM(bpm);
      if(arpPattern!=='off')arpRef.current.start();else arpRef.current.stop();
    }
  },[arpPattern,arpRate,bpm]);

  // Spacebar sustain
  useEffect(()=>{
    const dn=e=>{if(e.code==='Space'){e.preventDefault();sustainRef.current=true;setSustain(true);}};
    const up=e=>{if(e.code==='Space'){sustainRef.current=false;setSustain(false);
      for(const id of sustainHeld.current){if(!pressedRef.current.has(id))audio.current.noteOff(id);}
      sustainHeld.current.clear();
    }};
    window.addEventListener('keydown',dn);window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',dn);window.removeEventListener('keyup',up);};
  },[]);

  // Load libraries
  useEffect(()=>{
    const scripts=[];
    const addScript=(src,cb)=>{const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';s.onload=cb;s.onerror=cb;document.body.appendChild(s);scripts.push(s);};
    addScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',()=>
      addScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',()=>
        addScript('https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/aruco.min.js',()=>
          addScript('https://cdn.jsdelivr.net/npm/js-aruco2@1.0.4/src/dictionaries/aruco_4x4_1000.js',()=>setCamReady(true))
        )
      )
    );
    return()=>scripts.forEach(s=>{try{document.body.removeChild(s);}catch(_){}});
  },[]);

  const startCamera=useCallback(async()=>{
    for(const mode of[{facingMode:'environment'},{facingMode:'user'},{}]){
      try{
        const stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,...mode}});
        videoRef.current.srcObject=stream;await videoRef.current.play();initPipeline();return;
      }catch(_){}
    }
    setStatus('error');setMessage('Camera access denied.');
  },[]);

  useEffect(()=>{if(camReady)startCamera();},[camReady,startCamera]);

  function initPipeline(){
    // ArUco
    try{if(window.AR?.Detector){detRef.current=new window.AR.Detector({dictionaryName:'ARUCO_4X4_1000'});}}
    catch(e){console.warn('ArUco unavailable:',e);}

    // MediaPipe
    // eslint-disable-next-line no-undef
    const hands=new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
    hands.setOptions({maxNumHands:2,modelComplexity:0,minDetectionConfidence:0.72,minTrackingConfidence:0.55});
    hands.onResults(onResults);
    // eslint-disable-next-line no-undef
    new Camera(videoRef.current,{onFrame:async()=>{await hands.send({image:videoRef.current});},width:640,height:480}).start();

    // Restore scanned markers from localStorage
    try{
      const saved=JSON.parse(localStorage.getItem('airpiano_v3_markers')||'null');
      if(saved&&Object.keys(saved).length>=8){
        knownMkrs.current=saved;
        setStatus('ready');
        setMessage(`Restored ${Object.keys(saved).length} markers from last session. Ready to play!`);
        return;
      }
    }catch(_){}
    setStatus('scan_needed');
    setMessage('Point camera at template and click Scan to learn marker positions.');
  }

  function startScan(){
    ensureAudio();
    scanRef.current=true;knownMkrs.current={};setScanning(true);
    setMessage('Scanning\u2026 keep template visible and clear of objects for 2 seconds.');
    setTimeout(()=>{
      scanRef.current=false;setScanning(false);
      const n=Object.keys(knownMkrs.current).length;
      if(n>=8){
        try{localStorage.setItem('airpiano_v3_markers',JSON.stringify(knownMkrs.current));}catch(_){}
        setStatus('ready');
        setMessage(`Scan complete: ${n} markers learned. Place objects on buttons to activate modes!`);
      }else{
        setMessage(`Only ${n} markers found \u2014 need at least 8. Ensure template is visible and try again.`);
      }
    },2000);
  }

  function resetScan(){
    knownMkrs.current={};pressedRef.current.clear();
    sustainHeld.current.clear();audio.current.allNotesOff();arpRef.current?.stop();
    setActiveKeys(new Set());setCoveredTags(new Set());
    try{localStorage.removeItem('airpiano_v3_markers');}catch(_){}
    setStatus('scan_needed');setMessage('Markers cleared. Point camera at template and click Scan.');
  }

  // ArUco
  function runAruco(canvas){
    if(!detRef.current)return[];
    try{return detRef.current.detect(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height))||[];}
    catch{return[];}
  }

  // ─── Key detection (marker-based, nearest-marker with upper-zone black keys) ──
  function getKey(px,py,kb,mkrs,markerRowY,keyZoneDepth,avgKeyWidth){
    if(py<markerRowY||py>markerRowY+keyZoneDepth)return null;
    const relativeY=(py-markerRowY)/keyZoneDepth;

    // Black keys in upper 60% of key zone
    if(relativeY<0.60){
      const blackThreshold=avgKeyWidth*0.4;
      let nearest=null,nearestDist=Infinity;
      for(const bk of kb.blacks){
        if(!mkrs[bk.tagId])continue;
        const dist=Math.abs(px-mkrs[bk.tagId].cx);
        if(dist<blackThreshold&&dist<nearestDist){nearestDist=dist;nearest=bk;}
      }
      if(nearest)return nearest;
    }

    // White keys — nearest horizontally
    const whiteThreshold=avgKeyWidth*0.6;
    let nearest=null,nearestDist=Infinity;
    for(const wk of kb.whites){
      if(!mkrs[wk.tagId])continue;
      const dist=Math.abs(px-mkrs[wk.tagId].cx);
      if(dist<whiteThreshold&&dist<nearestDist){nearestDist=dist;nearest=wk;}
    }
    return nearest;
  }

  // ─── Ribbon detection (interpolated between ribbon markers) ──────────────────
  function getRibbon(px,py,mkrs){
    const ribbonIds=[13,14,15,16,17,18,19,20,21,22];
    const ribbonMkrs=ribbonIds.filter(id=>mkrs[id]).map(id=>({id,...mkrs[id]}));
    if(ribbonMkrs.length<2)return null;

    ribbonMkrs.sort((a,b)=>a.cy-b.cy); // top (small Y) to bottom (large Y)
    const ribbonX=ribbonMkrs.reduce((s,m)=>s+m.cx,0)/ribbonMkrs.length;

    // Threshold: half an average key width or 30px, whichever is reasonable
    if(Math.abs(px-ribbonX)>30)return null;

    const topY=ribbonMkrs[0].cy;
    const botY=ribbonMkrs[ribbonMkrs.length-1].cy;
    if(botY-topY<10)return null;

    return 1-Math.max(0,Math.min(1,(py-topY)/(botY-topY))); // 1 at top, 0 at bottom
  }

  // Note press (handles chord mode)
  function pressKey(key,vel,kb){
    if(chordType){
      const notes=buildChordNotes(key.freq,key.label,chordType);
      notes.forEach(n=>audio.current.noteOn(n.id,n.freq,vel));
      if(arpPattern!=='off'&&arpRef.current)arpRef.current.setNotes(notes);
    }else{
      audio.current.noteOn(key.id,key.freq,vel);
      if(arpPattern!=='off'&&arpRef.current)arpRef.current.setNotes([key]);
    }
    if(sustainRef.current||sustainObj)sustainHeld.current.add(key.id);
  }

  // Main detection loop
  function onResults(results){
    fpsRef.current.n++;
    const now=Date.now();
    if(now-fpsRef.current.last>=1000){setFps(fpsRef.current.n);fpsRef.current={n:0,last:now};}

    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.scale(-1,1);ctx.drawImage(results.image,-canvas.width,0,canvas.width,canvas.height);ctx.restore();
    setHandCount(results.multiHandLandmarks?.length||0);

    // ── ArUco ──────────────────────────────────────────────────────────────
    const markers=runAruco(canvas);
    const visible=new Set(markers.map(m=>m.id));

    // Scan pass: learn marker positions
    if(scanRef.current){
      for(const m of markers){
        const cx=m.corners.reduce((s,p)=>s+p.x,0)/4;
        const cy=m.corners.reduce((s,p)=>s+p.y,0)/4;
        knownMkrs.current[m.id]={cx,cy};
      }
    }

    // Draw marker overlays
    for(const m of markers){
      ctx.beginPath();ctx.moveTo(m.corners[0].x,m.corners[0].y);
      for(let i=1;i<4;i++)ctx.lineTo(m.corners[i].x,m.corners[i].y);
      ctx.closePath();ctx.strokeStyle='rgba(255,200,60,0.8)';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='rgba(255,200,60,0.10)';ctx.fill();
      ctx.fillStyle='rgba(255,210,70,0.9)';ctx.font='bold 8px monospace';ctx.textAlign='left';
      ctx.fillText(TAG_INV[m.id]||`#${m.id}`,m.corners[0].x+2,m.corners[0].y-4);
    }

    // Covered = known CONTROL marker not visible = object placed on it
    // Position markers (0-22) excluded — they flicker as hands pass but shouldn't trigger modes
    const covered=new Set();
    for(const id of Object.keys(knownMkrs.current)){
      const numId=Number(id);
      if(POSITION_TAGS.has(numId))continue;
      if(!visible.has(numId))covered.add(numId);
    }
    setCoveredTags(covered);

    // Derive mode state from covered tags
    let ct=null,ap='off',ar='eighth',rm='mod',so=false;
    const nowMs=Date.now();
    for(const id of covered){
      if(CHORD_TAG_MAP[id])ct=CHORD_TAG_MAP[id];
      if(ARP_PAT_TAG[id])ap=ARP_PAT_TAG[id];
      if(ARP_RATE_TAG[id])ar=ARP_RATE_TAG[id];
      if(id===TAG.MODE_MOD)rm='mod';
      if(id===TAG.MODE_VOL)rm='vol';
      if(id===TAG.SUSTAIN)so=true;
      if(id===TAG.OCT_UP&&nowMs-octUpDeb.current>1500){octUpDeb.current=nowMs;setOctave(o=>Math.min(5,o+1));}
      if(id===TAG.OCT_DOWN&&nowMs-octDnDeb.current>1500){octDnDeb.current=nowMs;setOctave(o=>Math.max(2,o-1));}
    }
    setChordType(ct);setSustainObj(so);setRibbonMode(rm);
    if(ap!==arpPattern)setArpPattern(ap);
    if(ar!==arpRate)setArpRate(ar);

    if(status!=='ready')return;
    const newlyPressed=new Set();

    // ── Compute key detection parameters from scanned markers ────────────
    const mkrs=knownMkrs.current;
    const whiteIds=[0,1,2,3,4,5,6,46,47,48,49,50,51,52,58];
    const blackIds=[8,9,10,11,12,53,54,55,56,57];
    const whiteMarkers=whiteIds.filter(id=>mkrs[id]);
    if(whiteMarkers.length<2)return; // not enough markers

    const whiteXs=whiteMarkers.map(id=>mkrs[id].cx).sort((a,b)=>a-b);
    const avgKeyWidth=(whiteXs[whiteXs.length-1]-whiteXs[0])/(whiteXs.length-1);
    const allKeyYs=[...whiteIds,...blackIds].filter(id=>mkrs[id]).map(id=>mkrs[id].cy);
    const markerRowY=allKeyYs.reduce((s,y)=>s+y,0)/allKeyYs.length;
    const keyZoneDepth=avgKeyWidth*2.5; // keys are ~2.5x as long as wide

    // ── Finger tracking ─────────────────────────────────────────────────────
    if(results.multiHandLandmarks){
      for(const lms of results.multiHandLandmarks){
        for(const tipId of FINGERTIP_IDS){
          const lm=lms[tipId];
          const lmx=1-lm.x,lmy=lm.y;
          velTrk.current.update(tipId,lmy);
          const vy=velTrk.current.vel(tipId);

          // Pixel coordinates (mirrored, matching canvas/ArUco space)
          const px=lmx*canvas.width,py=lmy*canvas.height;

          // Key detection
          const key=getKey(px,py,kb,mkrs,markerRowY,keyZoneDepth,avgKeyWidth);

          if(key){
            newlyPressed.add(key.id);
            if(vy>PRESS_VEL&&!pressedRef.current.has(key.id)){
              pressedRef.current.add(key.id);
              const vel=Math.min(1,vy/2.5);
              pressKey(key,vel,kb);
              dispatch({type:'ADD',note:key.label,vel});
            }
          }

          // Ribbon
          const rv=getRibbon(px,py,mkrs);
          if(rv!==null){
            setRibbonValue(rv);
            if(rm==='vol')audio.current.setVolume(rv);
          }

          // Draw fingertip
          const pressing=vy>PRESS_VEL;
          ctx.beginPath();ctx.arc(px,py,pressing?14:10,0,Math.PI*2);
          ctx.fillStyle=pressing?'rgba(255,80,50,0.9)':key?'rgba(255,200,60,0.8)':'rgba(100,200,255,0.7)';
          ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=2;ctx.stroke();
          if(key){ctx.fillStyle='#111';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText(key.label,px,py+4);}
          // Velocity bar
          if(Math.abs(vy)>0.05){const bh=Math.min(28,Math.abs(vy)*14);ctx.fillStyle=vy>0?'rgba(255,100,60,0.8)':'rgba(60,200,100,0.8)';ctx.fillRect(px-3,py-18-(vy>0?bh:0),6,bh);}
        }
        // Skeleton
        [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]].forEach(([a,b])=>{
          const la=lms[a],lb=lms[b];ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo((1-la.x)*canvas.width,la.y*canvas.height);ctx.lineTo((1-lb.x)*canvas.width,lb.y*canvas.height);ctx.stroke();
        });
      }
    }

    // Release lifted keys
    for(const id of [...pressedRef.current]){
      if(!newlyPressed.has(id)){
        pressedRef.current.delete(id);
        if(!sustainRef.current&&!so&&!sustainHeld.current.has(id))audio.current.noteOff(id);
      }
    }
    if(so)for(const id of pressedRef.current)sustainHeld.current.add(id);

    setActiveKeys(new Set([...newlyPressed,...sustainHeld.current]));

    // Chord name detection
    const ss=new Set([...newlyPressed].map(id=>{const k=kb.all.find(k=>k.id===id);return k?k.semi:null;}).filter(s=>s!==null));
    setChord(ct&&newlyPressed.size>0?null:detectChord(ss)); // show auto-detect only in free mode
  }

  useEffect(()=>{audio.current.allNotesOff();pressedRef.current.clear();sustainHeld.current.clear();setActiveKeys(new Set());},[octave]);

  // ── UI components ──────────────────────────────────────────────────────────
  function PianoSVG({w=600,h=140}){
    const N=kb.whites.length,wkW=w/N,bkW=wkW*0.58,bkH=h*0.62;
    return(
      <svg width={w} height={h} style={{display:'block',margin:'0 auto',filter:'drop-shadow(0 4px 20px rgba(0,0,0,0.6))'}}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5f0e8"/><stop offset="100%" stopColor="#e0d8c8"/></linearGradient>
          <linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffd166"/><stop offset="100%" stopColor="#ff9020"/></linearGradient>
          <linearGradient id="bkn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#222"/><stop offset="100%" stopColor="#0a0a0a"/></linearGradient>
          <linearGradient id="bka" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff8020"/><stop offset="100%" stopColor="#cc5010"/></linearGradient>
        </defs>
        {kb.whites.map((k,i)=>{
          const active=activeKeys.has(k.id);
          return(<g key={k.id}>
            <rect x={i*wkW+1} y={1} width={wkW-2} height={h-2} rx={4} fill={active?'url(#wa)':'url(#wg)'} stroke={active?'#e87010':'#444'} strokeWidth={active?2:1}/>
            {chordType&&activeKeys.has(k.id)&&<rect x={i*wkW+2} y={2} width={wkW-4} height={5} rx={2} fill="#ff4040"/>}
            <text x={i*wkW+wkW/2} y={h-11} textAnchor="middle" fontSize={12} fontFamily="Georgia,serif" fontWeight="bold" fill={active?'#7a3000':'#666'}>{k.label}</text>
          </g>);
        })}
        {kb.blacks.map(k=>{
          const active=activeKeys.has(k.id),x=(k.leftWhiteIdx+1)*wkW-bkW/2;
          return(<g key={k.id}>
            <rect x={x} y={0} width={bkW} height={bkH} rx={3} fill={active?'url(#bka)':'url(#bkn)'} stroke={active?'#ff6010':'#000'} strokeWidth={1}/>
            <text x={x+bkW/2} y={bkH-8} textAnchor="middle" fontSize={8} fontFamily="monospace" fill={active?'#fff':'#777'}>{k.label}</text>
          </g>);
        })}
      </svg>
    );
  }

  function RibbonViz(){
    return(
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
        <div style={{fontSize:'0.58rem',color:'#8a8090',letterSpacing:'0.08em'}}>{ribbonMode.toUpperCase()}</div>
        <div style={{width:20,height:90,background:'rgba(255,255,255,0.07)',borderRadius:10,
          border:'1px solid rgba(255,255,255,0.1)',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',bottom:0,left:0,right:0,
            height:`${Math.round(ribbonValue*100)}%`,
            background:`linear-gradient(to top,${ribbonMode==='mod'?'#60c0ff':'#ffa030'},transparent)`,
            transition:'height 0.04s'}}/>
        </div>
        <div style={{fontSize:'0.58rem',fontFamily:'monospace',color:'#9a9080'}}>{Math.round(ribbonValue*100)}%</div>
      </div>
    );
  }

  function PianoRoll(){
    const nc={'C':'#e8c97a','C#':'#d4884a','D':'#b8d4e8','D#':'#9090d0','E':'#7abe8a','F':'#e87878','F#':'#c06888','G':'#78c8d8','G#':'#a898e0','A':'#d8b878','A#':'#90c898','B':'#e8a878'};
    return(
      <div style={{background:'rgba(0,0,0,0.3)',borderRadius:8,padding:'6px 10px',border:'1px solid rgba(255,255,255,0.07)',height:64,overflow:'hidden'}}>
        <div style={{fontSize:'0.58rem',color:'#6a6080',letterSpacing:'0.1em',marginBottom:2}}>ROLL</div>
        <div style={{display:'flex',gap:2,alignItems:'flex-end',height:42,overflowX:'hidden'}}>
          {roll.map(e=>{const r=e.note.replace(/[#']/,'')[0]+(e.note.includes('#')?'#':'');return(
            <div key={e.id} style={{background:nc[r]||'#aaa',opacity:0.85,borderRadius:2,flexShrink:0,
              width:Math.max(7,e.vel*15),height:Math.max(10,e.vel*38),
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:'0.42rem',fontFamily:'monospace',color:'#111',fontWeight:'bold'}}>{e.note}</div>
          );})}
          {!roll.length&&<span style={{color:'#4a4060',fontSize:'0.68rem',fontStyle:'italic'}}>no notes yet</span>}
        </div>
      </div>
    );
  }

  function Knob({label,value,min,max,step,onChange,fmt}){
    return(<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
      <div style={{fontSize:'0.58rem',color:'#8a8090',textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))}
        style={{width:58,accentColor:'#e8a030',cursor:'pointer'}}/>
      <div style={{fontSize:'0.62rem',color:'#c8b890',fontFamily:'monospace'}}>{fmt?fmt(value):value}</div>
    </div>);
  }

  const sc={loading:'#8090a8',scan_needed:'#e8c97a',ready:'#7ad890',error:'#e87878'}[status]||'#aaa';
  const W=Math.min(600,typeof window!=='undefined'?window.innerWidth-24:560);

  return(
    <div onClick={ensureAudio} style={{minHeight:'100vh',background:'#0d0b14',color:'#d8d0e8',fontFamily:"'Georgia',serif",
      display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 10px',gap:9,
      backgroundImage:'radial-gradient(ellipse at 20% 20%,rgba(80,40,120,0.18) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(20,60,100,0.18) 0%,transparent 60%)'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',maxWidth:W}}>
        <div>
          <div style={{fontSize:'1.2rem',letterSpacing:'0.18em',color:'#e8c97a',textTransform:'uppercase'}}>Paper Piano</div>
          <div style={{fontSize:'0.6rem',color:'#6a6090',letterSpacing:'0.08em'}}>PepperHorn x CRF  ·  v3.1  ·  2-Octave Marker-Based + Chord + Arp + Ribbon</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{fontSize:'0.58rem',fontFamily:'monospace',color:'#4a4060',textAlign:'right',lineHeight:1.7}}>
            <div>{fps} fps</div><div>{handCount} hands</div>
          </div>
          <div style={{width:9,height:9,borderRadius:'50%',background:sc,boxShadow:`0 0 8px ${sc}`}}/>
        </div>
      </div>

      {/* Status */}
      <div style={{width:'100%',maxWidth:W,background:'rgba(255,255,255,0.04)',border:`1px solid ${sc}30`,borderRadius:6,padding:'6px 12px',fontSize:'0.76rem',color:'#b0a8c0'}}>
        {status==='loading'&&'Loading MediaPipe + js-aruco2\u2026'}
        {status==='error'&&message}
        {status==='scan_needed'&&message}
        {status==='ready'&&message}
      </div>

      {/* Camera + ribbon */}
      <div style={{width:'100%',maxWidth:W,display:'flex',gap:8,alignItems:'flex-start'}}>
        {/* Camera */}
        <div ref={overlayRef} style={{flex:1,position:'relative',aspectRatio:'4/3',
          borderRadius:10,overflow:'hidden',background:'#000',
          border:`2px solid ${status==='ready'?'rgba(232,201,122,0.3)':'rgba(255,255,255,0.1)'}`}}>
          <video ref={videoRef} style={{display:'none'}} playsInline muted/>
          <canvas ref={canvasRef} width={640} height={480} style={{width:'100%',height:'100%',display:'block'}}/>
          {/* Mode pills */}
          <div style={{position:'absolute',top:6,left:6,display:'flex',gap:4,flexWrap:'wrap'}}>
            {chordType&&<div style={{background:'rgba(140,50,200,0.75)',borderRadius:4,padding:'2px 8px',fontSize:'0.65rem',color:'#e8d0ff'}}>● {CHORD_TYPES[chordType]?.label}</div>}
            {arpPattern!=='off'&&<div style={{background:'rgba(40,100,180,0.75)',borderRadius:4,padding:'2px 8px',fontSize:'0.65rem',color:'#c0d8ff'}}>♩ {ARP_PATTERNS[arpPattern]?.label} {ARP_RATES[arpRate]?.label}</div>}
          </div>
          {chord&&!chordType&&<div style={{position:'absolute',bottom:8,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.8)',borderRadius:6,padding:'3px 12px',fontSize:'0.95rem',fontWeight:'bold',color:'#e8c97a',fontFamily:'Georgia,serif',pointerEvents:'none'}}>{chord}</div>}
          {chordType&&activeKeys.size>0&&<div style={{position:'absolute',bottom:8,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.8)',borderRadius:6,padding:'3px 12px',fontSize:'0.95rem',fontWeight:'bold',color:'#d0a0ff',fontFamily:'Georgia,serif',pointerEvents:'none'}}>
            {[...activeKeys][0]?.split(/\d/)[0]}{CHORD_TYPES[chordType]?.symbol}
          </div>}
          {(sustain||sustainObj)&&<div style={{position:'absolute',top:6,right:6,background:'rgba(100,180,255,0.3)',border:'1px solid rgba(100,180,255,0.6)',borderRadius:4,padding:'2px 7px',fontSize:'0.62rem',color:'#90d0ff',pointerEvents:'none'}}>{sustainObj?'OBJ HOLD':'SUSTAIN'}</div>}
        </div>

        {/* Right sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:7,alignItems:'center'}}>
          <RibbonViz/>
          {coveredTags.size>0&&(
            <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,padding:'5px 7px',width:58}}>
              <div style={{fontSize:'0.52rem',color:'#6a6080',marginBottom:2}}>ACTIVE</div>
              {[...coveredTags].slice(0,6).map(tid=>(
                <div key={tid} style={{fontSize:'0.5rem',color:'#c0b080',fontFamily:'monospace',lineHeight:1.6}}>{TAG_INV[tid]||`#${tid}`}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Piano */}
      <div style={{width:'100%',maxWidth:W}}><PianoSVG w={W} h={130}/></div>

      {/* Roll */}
      <div style={{width:'100%',maxWidth:W}}><PianoRoll/></div>

      {/* Recording slots + Tap tempo */}
      <div style={{width:'100%',maxWidth:W,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <button onClick={()=>{if(recSlot!==null)stopRecording();setRecArmed(a=>!a);}} style={{...BS,background:recArmed?'rgba(255,60,60,0.25)':'rgba(255,60,60,0.08)',border:`1px solid ${recArmed?'rgba(255,60,60,0.7)':'rgba(255,60,60,0.3)'}`,color:recArmed?'#ff6060':'#c08080',borderRadius:5,padding:'3px 9px',fontSize:'0.68rem',fontWeight:'bold'}}>
          {recArmed?'● REC':'REC'}
        </button>
        {recordings.map((rec,i)=>{
          const isRec=recSlot===i;const isPlay=playSlot===i;const filled=!!rec;
          return(
            <button key={i} onClick={()=>handleSlotClick(i)} onContextMenu={e=>{e.preventDefault();if(filled)clearSlot(i);}}
              style={{...BS,minWidth:28,padding:'3px 6px',borderRadius:5,fontSize:'0.68rem',fontFamily:'monospace',
                background:isRec?'rgba(255,60,60,0.3)':isPlay?'rgba(100,200,100,0.25)':filled?'rgba(232,201,122,0.12)':'rgba(255,255,255,0.05)',
                border:`1px solid ${isRec?'rgba(255,60,60,0.7)':isPlay?'rgba(100,200,100,0.6)':filled?'rgba(232,201,122,0.3)':'rgba(255,255,255,0.1)'}`,
                color:isRec?'#ff6060':isPlay?'#90d890':filled?'#e8c97a':'#6a6080'}}>
              {isRec?'●':isPlay?'▶':i+1}
            </button>
          );
        })}
        <div style={{marginLeft:'auto',display:'flex',gap:5,alignItems:'center'}}>
          {metroActive&&<span style={{fontSize:'0.62rem',fontFamily:'monospace',color:'#90d890'}}>{bpm} bpm</span>}
          <button onClick={handleTap} style={{...BS,background:metroActive?'rgba(100,200,100,0.2)':'rgba(255,255,255,0.05)',border:`1px solid ${metroActive?'rgba(100,200,100,0.5)':'rgba(255,255,255,0.1)'}`,color:metroActive?'#90d890':'#8a8090',borderRadius:5,padding:'3px 9px',fontSize:'0.68rem',fontWeight:'bold'}}>
            {metroActive?'■ TAP':'TAP'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:W}}>
        <div style={{display:'flex',alignItems:'center',gap:3,background:'rgba(255,255,255,0.05)',borderRadius:6,padding:'3px 9px'}}>
          <span style={{fontSize:'0.62rem',color:'#8a8090'}}>OCT</span>
          <button onClick={()=>setOctave(o=>Math.max(2,o-1))} style={BS}>−</button>
          <span style={{fontFamily:'monospace',color:'#e8c97a',minWidth:14,textAlign:'center',fontSize:'0.9rem'}}>{octave}</span>
          <button onClick={()=>setOctave(o=>Math.min(5,o+1))} style={BS}>+</button>
        </div>
        {['sine','triangle','sawtooth','square'].map(w=>(
          <button key={w} onClick={()=>setWaveform(w)} style={{...BS,background:waveform===w?'rgba(232,201,122,0.2)':'rgba(255,255,255,0.05)',border:`1px solid ${waveform===w?'rgba(232,201,122,0.5)':'rgba(255,255,255,0.1)'}`,color:waveform===w?'#e8c97a':'#8a8090',padding:'3px 8px',borderRadius:5,fontSize:'0.68rem'}}>{w}</button>
        ))}
        <div style={{display:'flex',alignItems:'center',gap:3,background:'rgba(255,255,255,0.05)',borderRadius:6,padding:'3px 7px'}}>
          <span style={{fontSize:'0.62rem',color:'#8a8090'}}>BPM</span>
          <input type="number" value={bpm} min={40} max={240} onChange={e=>setBpm(Number(e.target.value))} style={{width:38,background:'transparent',border:'none',color:'#e8c97a',fontFamily:'monospace',fontSize:'0.82rem',textAlign:'center',outline:'none'}}/>
        </div>
        {(status==='ready'||status==='scan_needed')&&<button onClick={startScan} style={{...BS,background:scanning?'rgba(100,200,100,0.2)':'rgba(100,180,100,0.1)',border:'1px solid rgba(100,180,100,0.4)',color:'#90d890',borderRadius:5,padding:'3px 9px',fontSize:'0.68rem'}}>{scanning?'Scanning\u2026':'Scan'}</button>}
        <button onClick={()=>setShowSettings(s=>!s)} style={{...BS,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,padding:'3px 9px',fontSize:'0.68rem'}}>{showSettings?'\u25B2':'settings'}</button>
        {status==='ready'&&<button onClick={resetScan} style={{...BS,background:'rgba(255,100,80,0.1)',border:'1px solid rgba(255,100,80,0.3)',color:'#e89080',borderRadius:5,padding:'3px 9px',fontSize:'0.68rem'}}>reset</button>}
      </div>

      {/* Settings */}
      {showSettings&&(
        <div style={{width:'100%',maxWidth:W,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'11px 13px',display:'flex',flexDirection:'column',gap:11}}>
          <div style={{display:'flex',gap:14,flexWrap:'wrap',justifyContent:'center'}}>
            <Knob label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} fmt={v=>`${Math.round(v*100)}%`}/>
            <Knob label="Reverb" value={reverbAmt} min={0} max={1} step={0.01} onChange={setReverbAmt} fmt={v=>`${Math.round(v*100)}%`}/>
          </div>
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:9}}>
            <div style={{fontSize:'0.58rem',color:'#6a6080',letterSpacing:'0.1em',textAlign:'center',marginBottom:7}}>ADSR ENVELOPE</div>
            <div style={{display:'flex',gap:11,flexWrap:'wrap',justifyContent:'center'}}>
              <Knob label="Atk" value={adsr.attack}  min={0.005} max={2}  step={0.005} onChange={v=>setAdsr(a=>({...a,attack:v}))}  fmt={v=>`${v.toFixed(2)}s`}/>
              <Knob label="Dec" value={adsr.decay}   min={0.01}  max={2}  step={0.01}  onChange={v=>setAdsr(a=>({...a,decay:v}))}   fmt={v=>`${v.toFixed(2)}s`}/>
              <Knob label="Sus" value={adsr.sustain} min={0}     max={1}  step={0.01}  onChange={v=>setAdsr(a=>({...a,sustain:v}))} fmt={v=>`${Math.round(v*100)}%`}/>
              <Knob label="Rel" value={adsr.release} min={0.05}  max={4}  step={0.05}  onChange={v=>setAdsr(a=>({...a,release:v}))} fmt={v=>`${v.toFixed(2)}s`}/>
            </div>
          </div>
          <div style={{display:'flex',gap:5,justifyContent:'center',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:9}}>
            <button onClick={()=>dispatch({type:'CLEAR'})} style={{...BS,padding:'4px 11px',borderRadius:5,fontSize:'0.68rem',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>Clear roll</button>
            <button onClick={()=>audio.current.allNotesOff()} style={{...BS,padding:'4px 11px',borderRadius:5,fontSize:'0.68rem',background:'rgba(255,100,80,0.1)',border:'1px solid rgba(255,100,80,0.3)',color:'#e89080'}}>All notes off</button>
          </div>
        </div>
      )}

      {/* Guide */}
      <div style={{width:'100%',maxWidth:W,background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'9px 13px',fontSize:'0.7rem',color:'#6a6080',lineHeight:1.9,borderLeft:'2px solid rgba(232,201,122,0.2)'}}>
        <div style={{color:'#9a90b0',fontSize:'0.62rem',letterSpacing:'0.08em',marginBottom:2}}>WORKFLOW</div>
        1. Print <strong style={{color:'#b0a8c0'}}>piano_template_v3.html</strong> at 100% A4 landscape, no scaling<br/>
        2. Point camera at template and click <strong style={{color:'#90d890'}}>Scan</strong> — app learns all marker positions in 2 sec<br/>
        3. Place <strong style={{color:'#b0a8c0'}}>any object</strong> (coin, LEGO, eraser) on a chord or arp button to activate it<br/>
        4. Place object on <strong style={{color:'#b0a8c0'}}>MOD</strong> or <strong style={{color:'#b0a8c0'}}>VOL</strong> then slide finger up/down the ribbon strip<br/>
        5. Touch piano keys — downward velocity = note on, speed = loudness<br/>
        <span style={{color:'#5a5070'}}>No calibration needed — markers define key positions directly  ·  Spacebar = sustain  ·  OCT buttons: place object to shift</span>
      </div>
    </div>
  );
}

const BS={background:'transparent',border:'none',color:'#c8c0d8',cursor:'pointer',padding:'2px 5px',fontSize:'0.84rem',borderRadius:3};
