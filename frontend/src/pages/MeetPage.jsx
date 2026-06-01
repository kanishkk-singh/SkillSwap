// frontend/src/pages/MeetPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestsAPI } from '../services/api';
import { io } from 'socket.io-client';

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const RING_TIMEOUT = 30000; // 30s → missed call

// ─────────────────────────────────────────────────────────────────────────────
//  Ring sound  (Web Audio API — no file needed)
// ─────────────────────────────────────────────────────────────────────────────
let ringCtx = null;
function startRing() {
  try {
    stopRing();
    ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playBeep = (t) => {
      const o = ringCtx.createOscillator();
      const g = ringCtx.createGain();
      o.connect(g); g.connect(ringCtx.destination);
      o.frequency.value = 480; o.type = 'sine';
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      o.start(t); o.stop(t + 0.55);
    };
    playBeep(ringCtx.currentTime);
    playBeep(ringCtx.currentTime + 0.7);
    playBeep(ringCtx.currentTime + 1.4);
  } catch (_) {}
}
function stopRing() {
  try { ringCtx?.close(); } catch (_) {}
  ringCtx = null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Styles — inline so no CSS file dependency
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  // Overlays
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.92)',
  },
  card: {
    background: '#141414', border: '1px solid #2a2a2a',
    borderRadius: 24, padding: '44px 52px',
    textAlign: 'center', minWidth: 320,
    boxShadow: '0 8px 60px rgba(0,0,0,0.6)',
  },
  bigName: { fontSize: 22, fontWeight: 700, color: '#f5f5f5', margin: '12px 0 4px' },
  sub:     { fontSize: 14, color: '#888', marginBottom: 32 },

  // Avatar ring animation
  avatarWrap: {
    width: 88, height: 88, borderRadius: '50%', margin: '0 auto 4px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#f97316,#facc15)',
    fontSize: 34, fontWeight: 800, color: '#111',
    animation: 'ringPulse 1.3s ease-in-out infinite',
  },

  // Buttons
  btnRow:    { display: 'flex', gap: 14, justifyContent: 'center' },
  btnGreen: {
    padding: '14px 30px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(90deg,#22c55e,#16a34a)',
    color: '#fff', fontSize: 15, fontWeight: 700,
  },
  btnRed: {
    padding: '14px 30px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: '#ef4444', color: '#fff', fontSize: 15, fontWeight: 700,
  },
  btnGray: {
    padding: '12px 26px', borderRadius: 12, border: '1px solid #333', cursor: 'pointer',
    background: 'transparent', color: '#aaa', fontSize: 14, fontWeight: 600,
  },

  // Status badge
  badge: (color) => ({
    display: 'inline-block', padding: '4px 14px',
    borderRadius: 99, fontSize: 12, fontWeight: 700,
    background: color === 'green' ? '#052e16' : color === 'yellow' ? '#1c1a00' : '#1a0a0a',
    color:      color === 'green' ? '#22c55e' : color === 'yellow' ? '#facc15' : '#ef4444',
    border: `1px solid ${color === 'green' ? '#166534' : color === 'yellow' ? '#713f12' : '#7f1d1d'}`,
    marginBottom: 24,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────────────────────
export default function MeetPage() {
  const { id }   = useParams();   // swap request _id = room id
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [request,   setRequest]   = useState(null);
  const [screen,    setScreen]    = useState('lobby');
  // screens: lobby | outgoing | incoming | connected | declined | missed | ended | full

  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [notesOpen,    setNotesOpen]    = useState(false);
  const [notes,        setNotes]        = useState('');
  const [callSecs,     setCallSecs]     = useState(0);
  const [isSharing,    setIsSharing]    = useState(false);
  const [partnerName,  setPartnerName]  = useState('');
  const [incomingInfo, setIncomingInfo] = useState(null); // { peerId, name, offer }
  const [statusMsg,    setStatusMsg]    = useState('');

  // ── Refs ────────────────────────────────────────────────────────────────────
  const localRef   = useRef(null);
  const remoteRef  = useRef(null);
  const localStream  = useRef(null);
  const screenStream = useRef(null);
  const peerConn     = useRef(null);
  const socketRef    = useRef(null);
  const timerRef     = useRef(null);
  const ringTimer    = useRef(null);  // 30s missed-call timeout
  const ringLoop     = useRef(null);  // repeat ring every 3s
  const notesKey     = `ss_notes_${id}`;

  // ── Load request ────────────────────────────────────────────────────────────
  useEffect(() => {
    requestsAPI.getById(id).then(res => {
      const r = res.data.request;
      setRequest(r);
      const isSender = r.requestedBy === user?.username;
      setPartnerName(isSender ? r.offeredBy : (r.requestedByName || r.requestedBy));
    }).catch(() => {});
    setNotes(localStorage.getItem(notesKey) || '');
  }, [id]);

  useEffect(() => () => fullCleanup(), []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  const saveNotes = (v) => { setNotes(v); localStorage.setItem(notesKey, v); };

  const attach = (ref, stream) => {
    if (ref.current && stream) ref.current.srcObject = stream;
  };

  const startRingLoop = () => {
    startRing();
    ringLoop.current = setInterval(startRing, 3200);
  };

  const stopRingAll = () => {
    stopRing();
    clearInterval(ringLoop.current);
    clearTimeout(ringTimer.current);
  };

  const fullCleanup = () => {
    stopRingAll();
    clearInterval(timerRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current?.getTracks().forEach(t => t.stop());
    peerConn.current?.close();
    socketRef.current?.disconnect();
    localStream.current  = null;
    screenStream.current = null;
    peerConn.current     = null;
    socketRef.current    = null;
  };

  // ── Get user media ──────────────────────────────────────────────────────────
  const getMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.current = stream;
    attach(localRef, stream);
    return stream;
  };

  // ── RTCPeerConnection ───────────────────────────────────────────────────────
  const createPeer = useCallback((peerId) => {
    peerConn.current?.close();
    const pc = new RTCPeerConnection(ICE_CONFIG);

    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current));

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socketRef.current?.emit('ice-candidate', { to: peerId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      attach(remoteRef, e.streams[0]);
      stopRingAll();
      setScreen('connected');
      setStatusMsg('Connected');
      // Start call timer
      setCallSecs(0);
      timerRef.current = setInterval(() => setCallSecs(s => s + 1), 1000);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'disconnected' || st === 'failed') {
        setStatusMsg('Connection lost…');
      }
    };

    peerConn.current = pc;
    return pc;
  }, []);

  // ── Socket setup ────────────────────────────────────────────────────────────
  const connectSocket = useCallback(() => {
    const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '')
                 || 'https://skillswap-1-nhi4.onrender.com';

    const socket = io(BACKEND, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-meet', { roomId: id, username: user?.username || 'User' });
    });

    // ── Room full (3rd person) ──────────────────────────────────────────────
    socket.on('room-full', () => {
      stopRingAll();
      setScreen('full');
      fullCleanup();
    });

    // ── Caller: existing peer found → send offer ────────────────────────────
    socket.on('room-peers', async (peers) => {
      if (peers.length === 0) return; // callee joined first, wait
      const peer = peers[0];
      // Already on outgoing screen, just send offer
      try {
        const pc = createPeer(peer.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: peer.id, offer });
      } catch (_) {}
    });

    socket.on('peer-joined', ({ id: peerId, username }) => {
      // Callee arrived — if I'm already on outgoing screen, send offer
      if (screen === 'outgoing' || socketRef.current) {
        // offer will be triggered from room-peers on callee side
      }
      setStatusMsg(`${username} joined…`);
    });

    // ── Callee: received offer → show incoming ──────────────────────────────
    socket.on('offer', async ({ from, offer, username: callerName }) => {
      setIncomingInfo({ peerId: from, name: callerName || 'Partner', offer });
      setScreen('incoming');
      startRingLoop();
      // Missed call timeout
      ringTimer.current = setTimeout(() => {
        stopRingAll();
        socket.emit('call-missed', { to: from });
        setScreen('missed');
      }, RING_TIMEOUT);
    });

    socket.on('answer', async ({ answer }) => {
      await peerConn.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (candidate && peerConn.current) {
        try { await peerConn.current.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (_) {}
      }
    });

    // ── Call declined ───────────────────────────────────────────────────────
    socket.on('call-rejected', () => {
      stopRingAll();
      setScreen('declined');
      localStream.current?.getTracks().forEach(t => t.stop());
    });

    // ── Caller missed ───────────────────────────────────────────────────────
    socket.on('call-missed', () => {
      stopRingAll();
      setScreen('missed');
      localStream.current?.getTracks().forEach(t => t.stop());
    });

    // ── Partner ended / disconnected ────────────────────────────────────────
    socket.on('peer-left', ({ username: who }) => {
      stopRingAll();
      clearInterval(timerRef.current);
      fullCleanup();
      setScreen('ended');
      setStatusMsg(`${who || 'Partner'} ended the call`);
    });

  }, [id, user, createPeer]);

  // ─────────────────────────────────────────────────────────────────────────
  //  Actions
  // ─────────────────────────────────────────────────────────────────────────

  // User A: start outgoing call
  const startOutgoing = async () => {
    try { await getMedia(); } catch {
      alert('Camera/Mic permission denied.'); return;
    }
    setScreen('outgoing');
    startRingLoop();
    connectSocket();
    // Missed if no answer in 30s
    ringTimer.current = setTimeout(() => {
      stopRingAll();
      socketRef.current?.emit('call-missed', { roomId: id });
      setScreen('missed');
      localStream.current?.getTracks().forEach(t => t.stop());
    }, RING_TIMEOUT);
  };

  // User A: cancel outgoing call
  const cancelCall = () => {
    stopRingAll();
    socketRef.current?.emit('end-call', { roomId: id, username: user?.username });
    fullCleanup();
    setScreen('lobby');
  };

  // User B: accept incoming
  const acceptCall = async () => {
    stopRingAll();
    try { await getMedia(); } catch {
      alert('Camera/Mic permission denied.'); return;
    }
    setScreen('connecting');
    const { peerId, offer } = incomingInfo;
    setIncomingInfo(null);
    try {
      const pc = createPeer(peerId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('answer', { to: peerId, answer });
    } catch (_) {}
  };

  // User B: decline incoming
  const declineCall = () => {
    stopRingAll();
    socketRef.current?.emit('call-rejected', { to: incomingInfo.peerId });
    setIncomingInfo(null);
    fullCleanup();
    setScreen('lobby');
  };

  // Either user: end connected call
  const endCall = () => {
    if (!confirm('End the call?')) return;
    socketRef.current?.emit('end-call', { roomId: id, username: user?.username });
    fullCleanup();
    navigate(`/chat/${id}`);
  };

  // Mic
  const toggleMic = () => {
    const t = localStream.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  };

  // Camera
  const toggleCam = () => {
    const t = localStream.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  };

  // Screen share
  const toggleShare = async () => {
    if (!isSharing) {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.current = ss;
        const st = ss.getVideoTracks()[0];
        const sender = peerConn.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(st);
        if (localRef.current) localRef.current.srcObject = ss;
        setIsSharing(true);
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
    setIsSharing(false);
  };

  // User B: if they land on meet page but haven't "started" yet, auto-connect socket
  // so they receive the incoming offer
  useEffect(() => {
    if (screen === 'lobby' && request) {
      // Connect socket silently to receive offer
      if (!socketRef.current) connectSocket();
    }
  }, [screen, request]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const myInit = (user?.fname || user?.username || '?')[0].toUpperCase();
  const ptInit = (partnerName || 'P')[0].toUpperCase();

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const GlobalStyle = () => (
    <style>{`
      @keyframes ringPulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.5); }
        50%      { box-shadow: 0 0 0 22px rgba(249,115,22,0); transform: scale(1.06); }
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .meet-ctrl-btn {
        width:52px; height:52px; border-radius:50%; border:1px solid #333;
        background:#1a1a1a; color:#f5f5f5; font-size:18px;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; transition:.15s; flex-shrink:0;
      }
      .meet-ctrl-btn:hover { background:#2a2a2a; transform:scale(1.06); }
      .meet-ctrl-btn.off   { color:#ef4444; border-color:#ef4444; background:#1a0a0a; }
      .meet-ctrl-btn.active{ color:#facc15; border-color:#facc15; }
      .meet-ctrl-btn.end   { background:#ef4444; color:#fff; border-color:#ef4444; width:58px; height:58px; font-size:20px; }
      .meet-ctrl-btn.end:hover { background:#dc2626; }
    `}</style>
  );

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (screen === 'lobby') return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:24, textAlign:'center' }}>
      <GlobalStyle />
      <div className="meet-icon">🎥</div>
      <div className="meet-title">Video Meeting Room</div>
      <div className="meet-sub">
        {request ? `Ready to connect with ${partnerName} to learn ${request.skillName}?` : 'Get ready to connect!'}
      </div>
      <div className="partner-chip">
        <div className="dot" /><span>{partnerName}</span>
        <span style={{ color:'var(--muted)', fontSize:12 }}>· Skill Swap Partner</span>
      </div>
      <div className="info-row">
        <span><i className="fas fa-lock" style={{ color:'var(--accent1)' }} /> Private</span>
        <span><i className="fas fa-clock" style={{ color:'var(--accent1)' }} /> No limit</span>
        <span><i className="fas fa-shield-alt" style={{ color:'var(--accent1)' }} /> Secure</span>
      </div>
      <button className="join-btn" onClick={startOutgoing}>
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
  );

  // ── Room full ───────────────────────────────────────────────────────────────
  if (screen === 'full') return (
    <div style={{ ...S.overlay, background:'var(--bg)', position:'relative' }}>
      <GlobalStyle />
      <div style={S.card}>
        <div style={{ fontSize:48, marginBottom:16 }}>🚫</div>
        <div style={S.bigName}>Room Full</div>
        <div style={{ ...S.sub, marginBottom:28 }}>This meeting already has 2 participants.</div>
        <button style={S.btnGray} onClick={() => navigate(`/chat/${id}`)}>← Back to Chat</button>
      </div>
    </div>
  );

  // ── Outgoing call ───────────────────────────────────────────────────────────
  if (screen === 'outgoing') return (
    <div style={{ minHeight:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
      <GlobalStyle />
      {/* Small local preview */}
      <video ref={localRef} autoPlay muted playsInline
        style={{ position:'fixed', bottom:100, right:20, width:120, height:90, borderRadius:12, objectFit:'cover', background:'#111', border:'2px solid #333', transform:'scaleX(-1)' }}
      />
      <div style={{ ...S.avatarWrap }}>{ptInit}</div>
      <div style={S.bigName}>{partnerName}</div>
      <div style={{ ...S.badge('yellow') }}>📞 Calling…</div>
      <div style={{ color:'#555', fontSize:13, fontFamily:'monospace' }}>Waiting for {partnerName} to answer</div>
      <button style={{ ...S.btnRed, marginTop:12, display:'flex', alignItems:'center', gap:8 }} onClick={cancelCall}>
        <i className="fas fa-phone-slash" /> Cancel
      </button>
    </div>
  );

  // ── Incoming call ───────────────────────────────────────────────────────────
  if (screen === 'incoming') return (
    <div style={{ minHeight:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
      <GlobalStyle />
      <div style={{ ...S.avatarWrap }}>{incomingInfo?.name?.[0]?.toUpperCase() || 'P'}</div>
      <div style={S.bigName}>{incomingInfo?.name || 'Partner'}</div>
      <div style={{ ...S.badge('yellow') }}>📞 Incoming Call</div>
      <div style={S.btnRow}>
        <div style={{ textAlign:'center' }}>
          <button style={{ ...S.btnRed, width:64, height:64, borderRadius:'50%', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={declineCall}>
            <i className="fas fa-phone-slash" />
          </button>
          <div style={{ fontSize:11, color:'#888', marginTop:6 }}>Decline</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <button style={{ ...S.btnGreen, width:64, height:64, borderRadius:'50%', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={acceptCall}>
            <i className="fas fa-phone" />
          </button>
          <div style={{ fontSize:11, color:'#888', marginTop:6 }}>Accept</div>
        </div>
      </div>
    </div>
  );

  // ── Connecting spinner ──────────────────────────────────────────────────────
  if (screen === 'connecting') return (
    <div style={{ minHeight:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <GlobalStyle />
      <div style={{ width:48, height:48, border:'3px solid #333', borderTop:'3px solid #f97316', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ color:'#facc15', fontSize:14, fontFamily:'monospace' }}>Connecting…</div>
    </div>
  );

  // ── Call declined ───────────────────────────────────────────────────────────
  if (screen === 'declined') return (
    <div style={{ minHeight:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
      <GlobalStyle />
      <div style={{ fontSize:52 }}>📵</div>
      <div style={S.bigName}>Call Declined</div>
      <div style={{ ...S.badge('red') }}>{partnerName} declined the call</div>
      <button style={S.btnGray} onClick={() => { setScreen('lobby'); }}>← Back</button>
    </div>
  );

  // ── Missed call ─────────────────────────────────────────────────────────────
  if (screen === 'missed') return (
    <div style={{ minHeight:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
      <GlobalStyle />
      <div style={{ fontSize:52 }}>📵</div>
      <div style={S.bigName}>Missed Call</div>
      <div style={{ ...S.badge('yellow') }}>No answer from {partnerName}</div>
      <button style={S.btnGray} onClick={() => setScreen('lobby')}>← Back</button>
    </div>
  );

  // ── Ended ───────────────────────────────────────────────────────────────────
  if (screen === 'ended') return (
    <div style={{ minHeight:'100vh', background:'#060606', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
      <GlobalStyle />
      <div style={{ fontSize:52 }}>📴</div>
      <div style={S.bigName}>Call Ended</div>
      <div style={{ ...S.badge('red') }}>{statusMsg}</div>
      <div style={{ color:'#555', fontSize:13, fontFamily:'monospace' }}>Duration: {fmt(callSecs)}</div>
      <button style={S.btnGray} onClick={() => navigate(`/chat/${id}`)}>← Back to Chat</button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONNECTED — main call UI
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'#050505', overflow:'hidden' }}>
      <GlobalStyle />

      {/* Status bar */}
      <div style={{ background:'#0f0f0f', borderBottom:'1px solid #1e1e1e', padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e', display:'inline-block', boxShadow:'0 0 6px #22c55e', animation:'ringPulse 2s infinite' }} />
          <span style={{ fontSize:13, fontFamily:'monospace', color:'#22c55e' }}>Connected</span>
        </div>
        <span style={{ fontSize:14, fontFamily:'monospace', color:'#facc15', letterSpacing:2 }}>{fmt(callSecs)}</span>
        <span style={{ fontSize:12, color:'#555', fontFamily:'monospace' }}>{partnerName}</span>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* Videos + Controls */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>

          {/* Video grid */}
          <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, background:'#000', minHeight:0, overflow:'hidden' }}>

            {/* Local */}
            <div style={{ position:'relative', background:'#0d0d0d', overflow:'hidden' }}>
              <video ref={localRef} autoPlay muted playsInline
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', transform: isSharing ? 'none' : 'scaleX(-1)' }}
              />
              {!camOn && !isSharing && (
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#111' }}>
                  <div className="cam-avatar">{myInit}</div>
                  <div className="cam-label">Camera Off</div>
                </div>
              )}
              <div className="tile-name">
                <span className={micOn ? 'mic-on' : 'mic-off'} /> You
                {isSharing && <span style={{ color:'#facc15', marginLeft:6, fontSize:10 }}>● Screen</span>}
              </div>
            </div>

            {/* Remote */}
            <div style={{ position:'relative', background:'#0d0d0d', overflow:'hidden' }}>
              <video ref={remoteRef} autoPlay playsInline
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
              />
              <div className="tile-name"><span className="mic-on" /> {partnerName}</div>
            </div>
          </div>

          {/* Controls */}
          <div className="controls" style={{ flexShrink:0 }}>
            <button className={`meet-ctrl-btn ${micOn ? '' : 'off'}`} onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'}>
              <i className={`fas fa-microphone${micOn ? '' : '-slash'}`} />
            </button>
            <button className={`meet-ctrl-btn ${camOn ? '' : 'off'}`} onClick={toggleCam} title={camOn ? 'Cam off' : 'Cam on'}>
              <i className={`fas fa-video${camOn ? '' : '-slash'}`} />
            </button>
            <button className={`meet-ctrl-btn ${isSharing ? 'active' : ''}`} onClick={toggleShare} title={isSharing ? 'Stop share' : 'Share screen'}>
              <i className="fas fa-desktop" />
            </button>
            <button className="meet-ctrl-btn end" onClick={endCall} title="End call">
              <i className="fas fa-phone-slash" />
            </button>
            <button className={`meet-ctrl-btn ${notesOpen ? 'active' : ''}`} onClick={() => setNotesOpen(n => !n)} title="Notes">
              <i className="fas fa-sticky-note" />
            </button>
          </div>
        </div>

        {/* Notes */}
        {notesOpen && (
          <div className="notes-panel">
            <div className="notes-header">📝 Session Notes</div>
            <div className="notes-body">
              <textarea
                placeholder={`Take notes…\n\n• Topics covered\n• Resources shared\n• Action items`}
                value={notes}
                onChange={e => saveNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}