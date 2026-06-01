// frontend/src/pages/MeetPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestsAPI } from '../services/api';
import { io } from 'socket.io-client';

// ─────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
const RING_TIMEOUT_MS = 30000;
const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '')
             || 'https://skillswap-1-nhi4.onrender.com';

// ─────────────────────────────────────────────────────────────────
//  Ring sound  (Web Audio — no file needed)
// ─────────────────────────────────────────────────────────────────
let _ringCtx = null;
function _playBeeps() {
  try {
    _ringCtx?.close();
    _ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (t) => {
      const o = _ringCtx.createOscillator();
      const g = _ringCtx.createGain();
      o.connect(g); g.connect(_ringCtx.destination);
      o.frequency.value = 480; o.type = 'sine';
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.start(t); o.stop(t + 0.5);
    };
    beep(_ringCtx.currentTime);
    beep(_ringCtx.currentTime + 0.65);
    beep(_ringCtx.currentTime + 1.3);
  } catch (_) {}
}
function _stopRing() {
  try { _ringCtx?.close(); } catch (_) {}
  _ringCtx = null;
}

// ─────────────────────────────────────────────────────────────────
//  Shared CSS injected once
// ─────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes meetPulse {
    0%,100% { box-shadow:0 0 0 0 rgba(249,115,22,.5); }
    50%      { box-shadow:0 0 0 20px rgba(249,115,22,0); transform:scale(1.07); }
  }
  @keyframes meetSpin { to { transform:rotate(360deg); } }
  .mctrl {
    width:52px;height:52px;border-radius:50%;border:1px solid #2e2e2e;
    background:#181818;color:#e5e5e5;font-size:17px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0;
  }
  .mctrl:hover{background:#262626;transform:scale(1.07);}
  .mctrl.off {color:#ef4444;border-color:#ef4444;background:#1c0a0a;}
  .mctrl.act {color:#facc15;border-color:#facc15;}
  .mctrl.end{background:#ef4444;color:#fff;border-color:#ef4444;width:60px;height:60px;font-size:20px;}
  .mctrl.end:hover{background:#dc2626;}
  .mbar{display:flex;align-items:center;justify-content:center;gap:14px;
        padding:14px 0;background:#0e0e0e;border-top:1px solid #1e1e1e;flex-shrink:0;}
  .mvid{position:relative;background:#0d0d0d;overflow:hidden;}
  .mvid video{width:100%;height:100%;object-fit:cover;display:block;}
  .mlabel{position:absolute;bottom:10px;left:12px;background:rgba(0,0,0,.65);
          backdrop-filter:blur(4px);padding:3px 10px;border-radius:99px;
          font-size:12px;color:#e5e5e5;font-family:monospace;border:1px solid #333;}
  .mplc{position:absolute;inset:0;display:flex;flex-direction:column;
        align-items:center;justify-content:center;background:#111;gap:8px;}
  .mavt{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#f97316,#facc15);
        display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#111;}
  .msub{font-size:13px;color:#666;font-family:monospace;}
`;

export default function MeetPage() {
  const { id }   = useParams();        // swap request _id = room id
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── screen states ──────────────────────────────────────────────
  // lobby | outgoing | incoming | connecting | connected
  // declined | missed | ended | full
  const [screen,   setScreen]   = useState('lobby');
  const [request,  setRequest]  = useState(null);
  const [partner,  setPartner]  = useState('');   // partner username/name

  // call UI
  const [micOn,    setMicOn]    = useState(true);
  const [camOn,    setCamOn]    = useState(true);
  const [sharing,  setSharing]  = useState(false);
  const [callSecs, setCallSecs] = useState(0);
  const [notes,    setNotes]    = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [statusTx, setStatusTx] = useState('');

  // incoming info (callee side)
  const incomingRef = useRef(null); // { callerId, callerName, offer? }

  // WebRTC / media
  const localRef   = useRef(null);
  const remoteRef  = useRef(null);
  const localStream  = useRef(null);
  const screenStream = useRef(null);
  const peerConn     = useRef(null);
  const sockRef      = useRef(null);

  // timers
  const timerRef   = useRef(null);   // call duration
  const ringLoop   = useRef(null);   // repeat ring
  const missedTmr  = useRef(null);   // 30s no-answer

  const notesKey = `ss_notes_${id}`;

  // ── load request ───────────────────────────────────────────────
  useEffect(() => {
    requestsAPI.getById(id).then(r => {
      const req = r.data.request;
      setRequest(req);
      const isSender = req.requestedBy === user?.username;
      setPartner(isSender ? req.offeredBy : (req.requestedByName || req.requestedBy));
    }).catch(() => {});
    setNotes(localStorage.getItem(notesKey) || '');
  }, [id]);

  // ── cleanup on unmount ─────────────────────────────────────────
  useEffect(() => () => _hardCleanup(), []);

  // ── helpers ────────────────────────────────────────────────────
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const saveNote = v => { setNotes(v); localStorage.setItem(notesKey, v); };

  const attach = (ref, stream) => {
    if (ref.current) ref.current.srcObject = stream || null;
  };

  const startRingLoop = () => {
    _playBeeps();
    ringLoop.current = setInterval(_playBeeps, 3500);
  };
  const stopRingLoop = () => {
    _stopRing();
    clearInterval(ringLoop.current);
    clearTimeout(missedTmr.current);
  };

  const _hardCleanup = () => {
    stopRingLoop();
    clearInterval(timerRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current?.getTracks().forEach(t => t.stop());
    peerConn.current?.close();
    sockRef.current?.disconnect();
    localStream.current  = null;
    screenStream.current = null;
    peerConn.current     = null;
    sockRef.current      = null;
  };

  // ── get camera + mic ───────────────────────────────────────────
  const getMedia = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.current = s;
    // Show local preview immediately
    if (localRef.current) localRef.current.srcObject = s;
    return s;
  };

  // ── create RTCPeerConnection ───────────────────────────────────
  const createPeer = useCallback((remoteId) => {
    peerConn.current?.close();
    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Add all local tracks
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current));

    // Send ICE to remote
    pc.onicecandidate = e => {
      if (e.candidate)
        sockRef.current?.emit('ice-candidate', { to: remoteId, candidate: e.candidate });
    };

    // Remote stream arrived → show it, mark connected
    pc.ontrack = e => {
      attach(remoteRef, e.streams[0]);
      stopRingLoop();
      setScreen('connected');
      setCallSecs(0);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setCallSecs(s => s + 1), 1000);
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected','failed'].includes(pc.connectionState))
        setStatusTx('Connection lost…');
    };

    peerConn.current = pc;
    return pc;
  }, []);

  // ─────────────────────────────────────────────────────────────────
  //  CALLER side — Kanishk clicks "Start Video Call"
  // ─────────────────────────────────────────────────────────────────
  const startCall = async () => {
    // 1. Get camera first — show preview on outgoing screen
    try {
      await getMedia();
    } catch {
      alert('Camera/Mic permission denied.'); return;
    }

    // 2. Show outgoing screen immediately (Kanishk sees his camera)
    setScreen('outgoing');

    // 3. Connect socket as CALLER
    const sock = io(BACKEND, { transports: ['websocket'] });
    sockRef.current = sock;

    sock.on('connect', () => {
      // Register as caller
      sock.emit('caller-join', { roomId: id, username: user?.username });
      // Ring Rahul
      sock.emit('ring-callee', { roomId: id, callerName: user?.fname || user?.username });
    });

    // Callee (Rahul) accepted → he joined → now create offer
    sock.on('callee-ready', async ({ calleeId, username }) => {
      setStatusTx(`${username} accepted…`);
      try {
        const pc = createPeer(calleeId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sock.emit('offer', { to: calleeId, offer });
      } catch (_) {}
    });

    // Signaling
    sock.on('answer', async ({ answer }) => {
      await peerConn.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });
    sock.on('ice-candidate', async ({ candidate }) => {
      if (candidate && peerConn.current)
        try { await peerConn.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    });

    // Rahul declined
    sock.on('call-rejected', () => {
      stopRingLoop();
      localStream.current?.getTracks().forEach(t => t.stop());
      setScreen('declined');
    });

    // No answer in 30s
    sock.on('call-missed', () => {
      stopRingLoop();
      localStream.current?.getTracks().forEach(t => t.stop());
      setScreen('missed');
    });

    // Rahul ended call
    sock.on('peer-left', ({ username }) => {
      stopRingLoop();
      clearInterval(timerRef.current);
      setStatusTx(`${username} ended the call`);
      _hardCleanup();
      setScreen('ended');
    });

    // Start ring on caller side (outgoing ring sound)
    startRingLoop();

    // 30s → missed if Rahul doesn't answer
    missedTmr.current = setTimeout(() => {
      sock.emit('call-missed', { to: 'room' });
      stopRingLoop();
      localStream.current?.getTracks().forEach(t => t.stop());
      setScreen('missed');
    }, RING_TIMEOUT_MS);
  };

  // Cancel outgoing call
  const cancelCall = () => {
    stopRingLoop();
    sockRef.current?.emit('end-call', { roomId: id, username: user?.username });
    _hardCleanup();
    setScreen('lobby');
  };

  // ─────────────────────────────────────────────────────────────────
  //  CALLEE side — Rahul's page receives incoming call
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!request) return;                 // wait for request to load
    if (sockRef.current) return;          // already connected

    // Rahul opens /meet/:id → connect socket silently to receive ring
    const sock = io(BACKEND, { transports: ['websocket'] });
    sockRef.current = sock;

    sock.on('connect', () => {
      sock.emit('callee-listen', { roomId: id, username: user?.username });
    });

    // Incoming call from Kanishk
    sock.on('incoming-call', ({ callerId, callerName }) => {
      incomingRef.current = { callerId, callerName };
      setScreen('incoming');
      startRingLoop();
      // 30s → auto missed
      missedTmr.current = setTimeout(() => {
        stopRingLoop();
        sock.emit('call-missed', { to: callerId });
        incomingRef.current = null;
        setScreen('lobby');
      }, RING_TIMEOUT_MS);
    });

    // Kanishk cancelled before Rahul answered
    sock.on('peer-left', () => {
      stopRingLoop();
      incomingRef.current = null;
      if (['incoming'].includes(screen)) setScreen('lobby');
    });

  }, [request]);

  // Accept call (Rahul)
  const acceptCall = async () => {
    stopRingLoop();
    const { callerId, callerName } = incomingRef.current;
    incomingRef.current = null;
    setScreen('connecting');

    // Get Rahul's camera
    try {
      await getMedia();
    } catch {
      alert('Camera/Mic permission denied.'); return;
    }

    // Re-register as callee (upgrade from 'listening' role)
    sockRef.current?.emit('callee-join', { roomId: id, username: user?.username });

    // Setup signaling for callee
    sockRef.current?.on('offer', async ({ from, offer }) => {
      try {
        const pc = createPeer(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sockRef.current?.emit('answer', { to: from, answer });
      } catch (_) {}
    });

    sockRef.current?.on('ice-candidate', async ({ candidate }) => {
      if (candidate && peerConn.current)
        try { await peerConn.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    });

    sockRef.current?.on('peer-left', ({ username }) => {
      stopRingLoop();
      clearInterval(timerRef.current);
      setStatusTx(`${username} ended the call`);
      _hardCleanup();
      setScreen('ended');
    });
  };

  // Decline call (Rahul)
  const declineCall = () => {
    stopRingLoop();
    sockRef.current?.emit('call-rejected', { to: incomingRef.current?.callerId });
    incomingRef.current = null;
    setScreen('lobby');
  };

  // ─────────────────────────────────────────────────────────────────
  //  In-call controls (both users)
  // ─────────────────────────────────────────────────────────────────
  const endCall = () => {
    if (!confirm('End the call?')) return;
    sockRef.current?.emit('end-call', { roomId: id, username: user?.username });
    _hardCleanup();
    navigate(`/chat/${id}`);
  };

  const toggleMic = () => {
    const t = localStream.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  };

  const toggleCam = () => {
    const t = localStream.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  };

  const toggleShare = async () => {
    if (!sharing) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.current = ss;
        const st = ss.getVideoTracks()[0];
        const sender = peerConn.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(st);
        if (localRef.current) localRef.current.srcObject = ss;
        setSharing(true);
        st.onended = stopShare;
      } catch (_) {}
    } else stopShare();
  };

  const stopShare = () => {
    screenStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current = null;
    const ct = localStream.current?.getVideoTracks()[0];
    const sender = peerConn.current?.getSenders().find(s => s.track?.kind === 'video');
    if (sender && ct) sender.replaceTrack(ct);
    if (localRef.current && localStream.current) localRef.current.srcObject = localStream.current;
    setSharing(false);
  };

  // ── derived ────────────────────────────────────────────────────
  const myInit = (user?.fname || user?.username || '?')[0].toUpperCase();
  const ptInit = (partner || 'P')[0].toUpperCase();

  // ═════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{CSS}</style>

      {/* ── LOBBY ─────────────────────────────────────────────── */}
      {screen === 'lobby' && (
        <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:24, textAlign:'center' }}>
          <div className="meet-icon">🎥</div>
          <div className="meet-title">Video Meeting Room</div>
          <div className="meet-sub">
            {request ? `Ready to connect with ${partner} to learn ${request.skillName}?` : 'Loading…'}
          </div>
          <div className="partner-chip">
            <div className="dot" /><span>{partner}</span>
            <span style={{ color:'var(--muted)', fontSize:12 }}>· Skill Swap Partner</span>
          </div>
          <div className="info-row">
            <span><i className="fas fa-lock" style={{ color:'var(--accent1)' }} /> Private</span>
            <span><i className="fas fa-clock" style={{ color:'var(--accent1)' }} /> No limit</span>
            <span><i className="fas fa-shield-alt" style={{ color:'var(--accent1)' }} /> Secure</span>
          </div>
          <button className="join-btn" onClick={startCall}>
            <i className="fas fa-video" /> Start Video Call
          </button>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center' }}>
            <Link to={`/chat/${id}`} style={{ fontSize:13, color:'var(--muted)', textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
              <i className="fas fa-comments" /> Back to Chat
            </Link>
            <Link to="/dashboard" style={{ fontSize:13, color:'var(--muted)', textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
              <i className="fas fa-tachometer-alt" /> Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* ── OUTGOING (Kanishk sees his camera + "Calling Rahul…") ── */}
      {screen === 'outgoing' && (
        <div style={{ height:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:0, overflow:'hidden' }}>
          {/* Full screen local preview */}
          <video ref={localRef} autoPlay muted playsInline
            style={{ position:'fixed', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', zIndex:0, opacity:0.55 }}
          />
          {/* Overlay */}
          <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:20, textAlign:'center', padding:32 }}>
            <div style={{ width:88, height:88, borderRadius:'50%', background:'linear-gradient(135deg,#f97316,#facc15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, fontWeight:800, color:'#111', animation:'meetPulse 1.3s ease-in-out infinite' }}>
              {ptInit}
            </div>
            <div style={{ fontSize:22, fontWeight:700, color:'#fff' }}>{partner}</div>
            <div style={{ fontSize:14, color:'#aaa', fontFamily:'monospace' }}>Calling…</div>
            <div style={{ fontSize:12, color:'#555', fontFamily:'monospace' }}>Waiting for {partner} to answer</div>
            <button onClick={cancelCall} style={{ marginTop:12, padding:'14px 32px', borderRadius:99, border:'none', background:'#ef4444', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
              <i className="fas fa-phone-slash" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── INCOMING (Rahul sees notification) ────────────────── */}
      {screen === 'incoming' && (
        <div style={{ height:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, textAlign:'center', padding:24 }}>
          <div style={{ width:88, height:88, borderRadius:'50%', background:'linear-gradient(135deg,#f97316,#facc15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, fontWeight:800, color:'#111', animation:'meetPulse 1.3s ease-in-out infinite' }}>
            {incomingRef.current?.callerName?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:'#fff' }}>{incomingRef.current?.callerName}</div>
          <div style={{ fontSize:14, color:'#aaa', fontFamily:'monospace' }}>Incoming Video Call</div>
          <div style={{ display:'flex', gap:40, marginTop:8 }}>
            {/* Decline */}
            <div style={{ textAlign:'center' }}>
              <button onClick={declineCall} style={{ width:68, height:68, borderRadius:'50%', border:'none', background:'#ef4444', color:'#fff', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="fas fa-phone-slash" />
              </button>
              <div style={{ fontSize:12, color:'#888', marginTop:6 }}>Decline</div>
            </div>
            {/* Accept */}
            <div style={{ textAlign:'center' }}>
              <button onClick={acceptCall} style={{ width:68, height:68, borderRadius:'50%', border:'none', background:'#22c55e', color:'#fff', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', animation:'meetPulse 1s infinite' }}>
                <i className="fas fa-phone" />
              </button>
              <div style={{ fontSize:12, color:'#888', marginTop:6 }}>Accept</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONNECTING ─────────────────────────────────────────── */}
      {screen === 'connecting' && (
        <div style={{ height:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
          {/* Rahul can see his own camera while connecting */}
          <video ref={localRef} autoPlay muted playsInline
            style={{ position:'fixed', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', zIndex:0, opacity:0.45 }}
          />
          <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, border:'3px solid #333', borderTop:'3px solid #f97316', borderRadius:'50%', animation:'meetSpin .8s linear infinite' }} />
            <div style={{ color:'#facc15', fontSize:14, fontFamily:'monospace' }}>Connecting…</div>
          </div>
        </div>
      )}

      {/* ── STATUS SCREENS ─────────────────────────────────────── */}
      {['declined','missed','ended','full'].includes(screen) && (
        <div style={{ height:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, textAlign:'center', padding:24 }}>
          <div style={{ fontSize:56 }}>
            {screen === 'declined' ? '📵' : screen === 'missed' ? '📵' : screen === 'ended' ? '📴' : '🚫'}
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:'#fff' }}>
            {screen === 'declined' ? 'Call Declined'
              : screen === 'missed' ? 'Missed Call'
              : screen === 'ended'  ? 'Call Ended'
              : 'Room Full'}
          </div>
          <div style={{ fontSize:13, color:'#666', fontFamily:'monospace' }}>
            {screen === 'declined' ? `${partner} declined the call`
              : screen === 'missed' ? `${partner} didn't answer`
              : screen === 'ended'  ? statusTx || 'The call has ended'
              : 'This meeting already has 2 participants'}
          </div>
          {screen === 'ended' && (
            <div style={{ fontSize:13, color:'#555', fontFamily:'monospace' }}>Duration: {fmt(callSecs)}</div>
          )}
          <div style={{ display:'flex', gap:12, marginTop:4 }}>
            {(screen === 'declined' || screen === 'missed') && (
              <button onClick={startCall} style={{ padding:'12px 24px', borderRadius:10, border:'none', background:'linear-gradient(90deg,#f97316,#facc15)', color:'#111', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                <i className="fas fa-phone" /> Call Again
              </button>
            )}
            <button onClick={() => navigate(`/chat/${id}`)} style={{ padding:'12px 24px', borderRadius:10, border:'1px solid #333', background:'transparent', color:'#aaa', fontSize:14, cursor:'pointer' }}>
              ← Back to Chat
            </button>
          </div>
        </div>
      )}

      {/* ── CONNECTED — main call UI ───────────────────────────── */}
      {screen === 'connected' && (
        <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'#050505', overflow:'hidden' }}>

          {/* Status bar */}
          <div style={{ background:'#0e0e0e', borderBottom:'1px solid #1a1a1a', padding:'7px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e', display:'inline-block' }} />
              <span style={{ fontSize:13, color:'#22c55e', fontFamily:'monospace' }}>Connected</span>
            </div>
            <span style={{ fontSize:14, color:'#facc15', fontFamily:'monospace', letterSpacing:2 }}>{fmt(callSecs)}</span>
            <span style={{ fontSize:12, color:'#555', fontFamily:'monospace' }}>{partner}</span>
          </div>

          <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

            {/* Videos + controls */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>

              {/* Video grid — 2 tiles side by side */}
              <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, background:'#000', minHeight:0, overflow:'hidden' }}>

                {/* MY camera (local) */}
                <div className="mvid">
                  <video ref={localRef} autoPlay muted playsInline
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block',
                             transform: sharing ? 'none' : 'scaleX(-1)' }}
                  />
                  {!camOn && !sharing && (
                    <div className="mplc">
                      <div className="mavt">{myInit}</div>
                      <div className="msub">Camera Off</div>
                    </div>
                  )}
                  <div className="mlabel">
                    {micOn ? '🎤' : '🔇'} You {sharing && <span style={{ color:'#facc15' }}>● Screen</span>}
                  </div>
                </div>

                {/* PARTNER camera (remote) */}
                <div className="mvid">
                  <video ref={remoteRef} autoPlay playsInline
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                  />
                  <div className="mlabel">🎤 {partner}</div>
                </div>
              </div>

              {/* Controls bar — always visible */}
              <div className="mbar">
                <button className={`mctrl ${micOn ? '' : 'off'}`} onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'}>
                  <i className={`fas fa-microphone${micOn ? '' : '-slash'}`} />
                </button>
                <button className={`mctrl ${camOn ? '' : 'off'}`} onClick={toggleCam} title={camOn ? 'Cam off' : 'Cam on'}>
                  <i className={`fas fa-video${camOn ? '' : '-slash'}`} />
                </button>
                <button className={`mctrl ${sharing ? 'act' : ''}`} onClick={toggleShare} title={sharing ? 'Stop share' : 'Share screen'}>
                  <i className="fas fa-desktop" />
                </button>
                <button className="mctrl end" onClick={endCall} title="End call">
                  <i className="fas fa-phone-slash" />
                </button>
                <button className={`mctrl ${noteOpen ? 'act' : ''}`} onClick={() => setNoteOpen(n => !n)} title="Notes">
                  <i className="fas fa-sticky-note" />
                </button>
              </div>
            </div>

            {/* Notes panel */}
            {noteOpen && (
              <div className="notes-panel">
                <div className="notes-header">📝 Session Notes</div>
                <div className="notes-body">
                  <textarea
                    placeholder={`Take notes…\n\n• Topics covered\n• Resources shared\n• Action items`}
                    value={notes}
                    onChange={e => saveNote(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}