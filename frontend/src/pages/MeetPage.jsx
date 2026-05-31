// frontend/src/pages/MeetPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestsAPI } from '../services/api';
import { io } from 'socket.io-client';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ── Ring sound (Web Audio API — no file needed) ──────────────────────────────
function playRing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ring = (t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 480;
      o.type = 'sine';
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.start(t); o.stop(t + 0.6);
    };
    ring(ctx.currentTime);
    ring(ctx.currentTime + 0.8);
    ring(ctx.currentTime + 1.6);
  } catch (_) {}
}

export default function MeetPage() {
  const { id }   = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [request,          setRequest]          = useState(null);
  const [inCall,           setInCall]           = useState(false);
  const [micOn,            setMicOn]            = useState(true);
  const [camOn,            setCamOn]            = useState(true);
  const [callSecs,         setCallSecs]         = useState(0);
  const [notes,            setNotes]            = useState('');
  const [notesOpen,        setNotesOpen]        = useState(true);
  const [status,           setStatus]           = useState('Waiting for partner…');
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [isScreenSharing,  setIsScreenSharing]  = useState(false);
  const [incomingCall,     setIncomingCall]     = useState(null); // { peerId, name }

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStream    = useRef(null);
  const screenStream   = useRef(null);
  const peerConn       = useRef(null);
  const socketRef      = useRef(null);
  const timerRef       = useRef(null);
  const remotePeerId   = useRef(null);
  const ringInterval   = useRef(null);
  const notesKey       = `ss_notes_${id}`;

  useEffect(() => {
    requestsAPI.getById(id)
      .then(res => setRequest(res.data.request))
      .catch(() => {});
    setNotes(localStorage.getItem(notesKey) || '');
  }, [id]);

  useEffect(() => () => cleanupCall(), []);

  const fmtTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const saveNotes = (val) => {
    setNotes(val);
    localStorage.setItem(notesKey, val);
  };

  // ── Attach stream to video element safely ────────────────────────────────
  const attachStream = (ref, stream) => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  };

  const cleanupCall = () => {
    clearInterval(timerRef.current);
    clearInterval(ringInterval.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current?.getTracks().forEach(t => t.stop());
    peerConn.current?.close();
    socketRef.current?.disconnect();
    localStream.current = null;
    peerConn.current    = null;
    socketRef.current   = null;
  };

  // ── Create RTCPeerConnection ─────────────────────────────────────────────
  const createPeer = useCallback((peerId) => {
    if (peerConn.current) {
      peerConn.current.close();
    }
    const pc = new RTCPeerConnection(ICE_CONFIG);
    remotePeerId.current = peerId;

    localStream.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStream.current);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('ice-candidate', { to: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      attachStream(remoteVideoRef, e.streams[0]);
      setPartnerConnected(true);
      setStatus('Connected ✓');
      // Stop ring when connected
      clearInterval(ringInterval.current);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'disconnected' || state === 'failed') {
        setPartnerConnected(false);
        setStatus('Partner disconnected');
      }
    };

    peerConn.current = pc;
    return pc;
  }, []);

  // ── Setup Socket ─────────────────────────────────────────────────────────
  const setupSocket = useCallback((stream) => {
    const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '')
                 || 'https://skillswap-1-nhi4.onrender.com';
                 
    const socket = io(BACKEND, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-meet', { roomId: id, username: user?.username || 'User' });
    });

    // Existing peers → I call them
    socket.on('room-peers', async (peers) => {
      if (peers.length === 0) {
        setStatus('Waiting for partner…');
        return;
      }
      const peer = peers[0];
      setStatus(`Calling ${peer.username}…`);
      // Start ring for caller too
      playRing();
      ringInterval.current = setInterval(playRing, 4000);

      const pc = createPeer(peer.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: peer.id, offer });
    });

    // New peer joined
    socket.on('peer-joined', ({ id: peerId, username }) => {
      setStatus(`${username} is joining…`);
    });

    // Received offer → show incoming call UI + ring
    socket.on('offer', async ({ from, offer, username }) => {
      setIncomingCall({ peerId: from, name: username || 'Partner', offer });
      // Ring!
      playRing();
      ringInterval.current = setInterval(playRing, 4000);
      setStatus(`Incoming call from ${username}…`);
    });

    // Received answer
    socket.on('answer', async ({ answer }) => {
      await peerConn.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // ICE
    socket.on('ice-candidate', async ({ candidate }) => {
      if (candidate && peerConn.current) {
        try { await peerConn.current.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (_) {}
      }
    });

    // ── Partner ended call → navigate away ──────────────────────────────
    socket.on('peer-left', ({ username }) => {
      clearInterval(ringInterval.current);
      alert(`${username || 'Partner'} ended the call.`);
      cleanupCall();
      navigate(`/chat/${id}`);
    });

    // Call rejected
    socket.on('call-rejected', () => {
      clearInterval(ringInterval.current);
      setIncomingCall(null);
      setStatus('Call declined');
    });

  }, [id, user, createPeer, navigate]);

  // ── Accept incoming call ─────────────────────────────────────────────────
  const acceptCall = async () => {
    clearInterval(ringInterval.current);
    const { peerId, offer } = incomingCall;
    setIncomingCall(null);
    const pc = createPeer(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('answer', { to: peerId, answer });
    setStatus('Connecting…');
  };

  // ── Reject incoming call ─────────────────────────────────────────────────
  const rejectCall = () => {
    clearInterval(ringInterval.current);
    if (incomingCall) {
      socketRef.current?.emit('call-rejected', { to: incomingCall.peerId });
    }
    setIncomingCall(null);
    setStatus('Waiting for partner…');
  };

  // ── Start Call ───────────────────────────────────────────────────────────
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = stream;
      // ✅ FIX: Always show local camera preview
      attachStream(localVideoRef, stream);
    } catch (err) {
      alert('Camera/Mic access denied. Please allow permissions.');
      return;
    }
    setInCall(true);
    timerRef.current = setInterval(() => setCallSecs(s => s + 1), 1000);
    setupSocket(localStream.current);
  };

  // ── End Call — navigate both users away ──────────────────────────────────
  const endCall = () => {
    if (!confirm('End the meeting?')) return;
    // Tell partner
    socketRef.current?.emit('end-call', { roomId: id, username: user?.username });
    cleanupCall();
    navigate(`/chat/${id}`);
  };

  // ── Toggle Mic ───────────────────────────────────────────────────────────
  const toggleMic = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  // ── Toggle Camera ────────────────────────────────────────────────────────
  const toggleCam = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };

  // ── Screen Share ─────────────────────────────────────────────────────────
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.current = sStream;
        const screenTrack = sStream.getVideoTracks()[0];

        // Replace in peer connection
        const sender = peerConn.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);

        // ✅ Show screen in local preview (NOT replacing localStream)
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = sStream;
        }
        setIsScreenSharing(true);

        // ✅ FIX: When screen share stops — restore camera immediately
        screenTrack.onended = () => stopScreenShare();
      } catch (_) {
        // User cancelled
      }
    } else {
      stopScreenShare();
    }
  };

  // ✅ FIX: Properly restore camera after screen share
  const stopScreenShare = () => {
    screenStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current = null;

    // Restore camera track in peer connection
    const camTrack = localStream.current?.getVideoTracks()[0];
    const sender = peerConn.current?.getSenders().find(s => s.track?.kind === 'video');
    if (sender && camTrack) {
      sender.replaceTrack(camTrack);
    }

    // ✅ Restore local preview to camera
    if (localVideoRef.current && localStream.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
    setIsScreenSharing(false);
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const isSender    = request?.requestedBy === user?.username;
  const partnerName = request ? (isSender ? request.offeredBy : request.requestedByName) : '…';
  const myInitial      = (user?.fname || user?.username || '?')[0].toUpperCase();
  const partnerInitial = (partnerName || 'P')[0].toUpperCase();

  // ════════════════════════════════════════════════════════════════════════
  //  INCOMING CALL OVERLAY
  // ════════════════════════════════════════════════════════════════════════
  if (inCall && incomingCall) return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, flexDirection: 'column', gap: 24,
    }}>
      <div style={{
        background: '#1a1a1a', border: '1px solid #333', borderRadius: 20,
        padding: '40px 48px', textAlign: 'center',
        boxShadow: '0 0 60px rgba(249,115,22,0.3)',
      }}>
        {/* Animated ring */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg,#f97316,#facc15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          animation: 'ring-pulse 1s infinite',
          fontSize: 32,
        }}>
          📞
        </div>
        <style>{`
          @keyframes ring-pulse {
            0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
            50% { transform: scale(1.08); box-shadow: 0 0 0 20px rgba(249,115,22,0); }
          }
        `}</style>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f5f5f5', marginBottom: 6 }}>
          Incoming Call
        </div>
        <div style={{ color: '#facc15', fontSize: 16, marginBottom: 32 }}>
          {incomingCall.name} wants to connect
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button onClick={rejectCall} style={{
            padding: '14px 28px', borderRadius: 10, border: 'none',
            background: '#ef4444', color: '#fff', fontSize: 16,
            fontWeight: 700, cursor: 'pointer',
          }}>
            ✕ Decline
          </button>
          <button onClick={acceptCall} style={{
            padding: '14px 28px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(90deg,#22c55e,#16a34a)',
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>
            ✓ Accept
          </button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════
  //  LOBBY
  // ════════════════════════════════════════════════════════════════════════
  if (!inCall) return (
    <div id="lobby" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, padding: 24, textAlign: 'center',
      minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div className="meet-icon">🎥</div>
      <div className="meet-title">Video Meeting Room</div>
      <div className="meet-sub">
        {request ? `Ready to connect with ${partnerName} to learn ${request.skillName}?` : 'Get ready to connect!'}
      </div>
      <div className="partner-chip">
        <div className="dot" />
        <span>{partnerName}</span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>· Skill Swap Partner</span>
      </div>
      <div className="info-row">
        <span><i className="fas fa-lock" style={{ color: 'var(--accent1)' }} /> Private room</span>
        <span><i className="fas fa-clock" style={{ color: 'var(--accent1)' }} /> No time limit</span>
        <span><i className="fas fa-shield-alt" style={{ color: 'var(--accent1)' }} /> Secure</span>
      </div>
      <button className="join-btn" onClick={startCall}>
        <i className="fas fa-video" /> Start Meeting
      </button>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to={`/chat/${id}`} style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fas fa-comments" /> Back to Chat
        </Link>
        <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fas fa-tachometer-alt" /> Dashboard
        </Link>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════
  //  IN-CALL VIEW  — ✅ FIX: controls always visible, video never overflows
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#050505',
      overflow: 'hidden',   // ✅ prevent overflow
    }}>
      {/* ── Status bar ── */}
      <div style={{
        background: '#111', padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #222', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="rec-dot" />
          <span style={{ fontSize: 13, fontFamily: 'monospace', color: partnerConnected ? '#22c55e' : '#facc15' }}>
            {status}
          </span>
        </div>
        <span className="call-timer" style={{ fontSize: 14, fontFamily: 'monospace', color: '#facc15' }}>
          {fmtTime(callSecs)}
        </span>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Video area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* ✅ Video grid — takes remaining space, never overlaps controls */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 2,
            background: '#000',
            minHeight: 0,
            overflow: 'hidden',
          }}>
            {/* Local video */}
            <div style={{ position: 'relative', background: '#0d0d0d', overflow: 'hidden' }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  // ✅ Mirror only camera (not screen share)
                  transform: isScreenSharing ? 'none' : 'scaleX(-1)',
                }}
              />
              {!camOn && !isScreenSharing && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', background: '#111',
                }}>
                  <div className="cam-avatar">{myInitial}</div>
                  <div className="cam-label">Camera Off</div>
                </div>
              )}
              <div className="tile-name">
                <span className={micOn ? 'mic-on' : 'mic-off'} /> You
                {isScreenSharing && <span style={{ color: '#facc15', marginLeft: 6, fontSize: 11 }}>● Sharing</span>}
              </div>
            </div>

            {/* Remote video */}
            <div style={{ position: 'relative', background: '#0d0d0d', overflow: 'hidden' }}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {!partnerConnected && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', background: '#111',
                }}>
                  <div className="cam-avatar">{partnerInitial}</div>
                  <div className="cam-label">{status}</div>
                </div>
              )}
              <div className="tile-name">
                <span className="mic-on" /> {partnerName}
              </div>
            </div>
          </div>

          {/* ✅ Controls — always at bottom, never hidden */}
          <div className="controls" style={{ flexShrink: 0 }}>
            <button
              className={`ctrl-btn ${micOn ? '' : 'off'}`}
              onClick={toggleMic}
              title={micOn ? 'Mute' : 'Unmute'}
            >
              <i className={`fas fa-microphone${micOn ? '' : '-slash'}`} />
            </button>

            <button
              className={`ctrl-btn ${camOn ? '' : 'off'}`}
              onClick={toggleCam}
              title={camOn ? 'Camera Off' : 'Camera On'}
            >
              <i className={`fas fa-video${camOn ? '' : '-slash'}`} />
            </button>

            <button
              className={`ctrl-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              style={isScreenSharing ? { color: '#facc15', borderColor: '#facc15' } : {}}
            >
              <i className="fas fa-desktop" />
            </button>

            <button className="ctrl-btn end-call" onClick={endCall} title="End Call">
              <i className="fas fa-phone-slash" />
            </button>

            <button
              className="ctrl-btn"
              onClick={() => setNotesOpen(n => !n)}
              title="Notes"
              style={notesOpen ? { color: '#facc15', borderColor: '#facc15' } : {}}
            >
              <i className="fas fa-sticky-note" />
            </button>
          </div>
        </div>

        {/* ── Notes panel ── */}
        {notesOpen && (
          <div className="notes-panel">
            <div className="notes-header">📝 Session Notes</div>
            <div className="notes-body">
              <textarea
                placeholder={`Take notes during your session…\n\n• Topics covered\n• Resources shared\n• Action items`}
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