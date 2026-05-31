// frontend/src/pages/MeetPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestsAPI } from '../services/api';
import { io } from 'socket.io-client';

// ── ICE servers (Google STUN — free) ─────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function MeetPage() {
  const { id }   = useParams();          // swap request _id = room id
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [request,   setRequest]   = useState(null);
  const [inCall,    setInCall]    = useState(false);
  const [micOn,     setMicOn]     = useState(true);
  const [camOn,     setCamOn]     = useState(true);
  const [callSecs,  setCallSecs]  = useState(0);
  const [notes,     setNotes]     = useState('');
  const [notesOpen, setNotesOpen] = useState(true);
  const [status,    setStatus]    = useState('Waiting for partner…');
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [isScreenSharing,  setIsScreenSharing]  = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStream    = useRef(null);
  const screenStream   = useRef(null);
  const peerConn       = useRef(null);
  const socketRef      = useRef(null);
  const timerRef       = useRef(null);
  const remotePeerId   = useRef(null);
  const notesKey       = `ss_notes_${id}`;

  // ── Load request info ──────────────────────────────────────────────────────
  useEffect(() => {
    requestsAPI.getById(id)
      .then(res => setRequest(res.data.request))
      .catch(() => {});
    setNotes(localStorage.getItem(notesKey) || '');
  }, [id]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const saveNotes = (val) => {
    setNotes(val);
    localStorage.setItem(notesKey, val);
  };

  const cleanupCall = () => {
    clearInterval(timerRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current?.getTracks().forEach(t => t.stop());
    peerConn.current?.close();
    socketRef.current?.disconnect();
    localStream.current = null;
    peerConn.current    = null;
    socketRef.current   = null;
  };

  // ── Create RTCPeerConnection ───────────────────────────────────────────────
  const createPeer = useCallback((peerId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    remotePeerId.current = peerId;

    // Add local tracks
    localStream.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStream.current);
    });

    // Send ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('ice-candidate', {
          to: peerId,
          candidate: e.candidate,
        });
      }
    };

    // Receive remote stream
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
      setPartnerConnected(true);
      setStatus('Connected ✓');
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

  // ── Setup Socket.io events ─────────────────────────────────────────────────
  const setupSocket = useCallback((stream) => {
    const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '')
                 || 'http://localhost:5000';

    const socket = io(BACKEND, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-meet', {
        roomId:   id,
        username: user?.username || 'User',
      });
    });

    // Existing peers in room → I initiate offer
    socket.on('room-peers', async (peers) => {
      if (peers.length === 0) {
        setStatus('Waiting for partner…');
        return;
      }
      const peer = peers[0];
      setStatus(`Calling ${peer.username}…`);
      const pc = createPeer(peer.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: peer.id, offer });
    });

    // New peer joined → they will send offer to me
    socket.on('peer-joined', ({ id: peerId, username }) => {
      setStatus(`${username} joined, connecting…`);
    });

    // Received offer → send answer
    socket.on('offer', async ({ from, offer, username }) => {
      setStatus(`Connecting with ${username}…`);
      const pc = createPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    });

    // Received answer
    socket.on('answer', async ({ answer }) => {
      await peerConn.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    // ICE candidate
    socket.on('ice-candidate', async ({ candidate }) => {
      if (candidate && peerConn.current) {
        try {
          await peerConn.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (_) {}
      }
    });

    // Partner left
    socket.on('peer-left', ({ username }) => {
      setPartnerConnected(false);
      setStatus(`${username} left the call`);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      peerConn.current?.close();
      peerConn.current = null;
    });
  }, [id, user, createPeer]);

  // ── Start Call ─────────────────────────────────────────────────────────────
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Camera/Mic access denied. Please allow permissions and try again.');
      return;
    }

    setInCall(true);
    timerRef.current = setInterval(() => setCallSecs(s => s + 1), 1000);
    setupSocket(localStream.current);
  };

  // ── End Call ───────────────────────────────────────────────────────────────
  const endCall = () => {
    if (!confirm('End the meeting?')) return;
    cleanupCall();
    setInCall(false);
    setCallSecs(0);
    setPartnerConnected(false);
    setStatus('Waiting for partner…');
  };

  // ── Toggle Mic ─────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  };

  // ── Toggle Camera ──────────────────────────────────────────────────────────
  const toggleCam = () => {
    const videoTrack = localStream.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamOn(videoTrack.enabled);
    }
  };

  // ── Screen Share ───────────────────────────────────────────────────────────
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStream.current = sStream;
        const screenTrack = sStream.getVideoTracks()[0];

        // Replace video track in peer connection
        const sender = peerConn.current
          ?.getSenders()
          .find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);

        // Show screen in local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = sStream;
        }
        setIsScreenSharing(true);

        // When user stops screen share from browser UI
        screenTrack.onended = stopScreenShare;
      } catch (_) {}
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    const camTrack = localStream.current?.getVideoTracks()[0];
    const sender = peerConn.current
      ?.getSenders()
      .find(s => s.track?.kind === 'video');
    if (sender && camTrack) sender.replaceTrack(camTrack);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
    screenStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current = null;
    setIsScreenSharing(false);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const isSender    = request?.requestedBy === user?.username;
  const partnerName = request
    ? (isSender ? request.offeredBy : request.requestedByName)
    : '…';
  const myInitial      = (user?.fname || user?.username || '?')[0].toUpperCase();
  const partnerInitial = (partnerName || 'P')[0].toUpperCase();

  // ══════════════════════════════════════════════════════════════════════════
  //  LOBBY VIEW
  // ══════════════════════════════════════════════════════════════════════════
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
        {request
          ? `Ready to connect with ${partnerName} to learn ${request.skillName}?`
          : 'Get ready to connect!'}
      </div>

      <div className="partner-chip">
        <div className="dot" />
        <span>{partnerName}</span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          · Skill Swap Partner
        </span>
      </div>

      <div className="info-row">
        <span>
          <i className="fas fa-lock" style={{ color: 'var(--accent1)' }} />{' '}
          Private room
        </span>
        <span>
          <i className="fas fa-clock" style={{ color: 'var(--accent1)' }} />{' '}
          No time limit
        </span>
        <span>
          <i className="fas fa-shield-alt" style={{ color: 'var(--accent1)' }} />{' '}
          Secure
        </span>
      </div>

      <button className="join-btn" onClick={startCall}>
        <i className="fas fa-video" /> Start Meeting
      </button>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          to={`/chat/${id}`}
          style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="fas fa-comments" /> Back to Chat
        </Link>
        <Link
          to="/dashboard"
          style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="fas fa-tachometer-alt" /> Dashboard
        </Link>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  IN-CALL VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div id="call-view" className="active" style={{
      height: '100vh', display: 'flex', flexDirection: 'column', background: '#050505',
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

          {/* ── Timer + Status ── */}
          <div className="call-timer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="rec-dot" />
            <span>{fmtTime(callSecs)}</span>
            <span style={{
              fontSize: 12, color: partnerConnected ? '#22c55e' : '#facc15',
              fontFamily: 'monospace', marginLeft: 8,
            }}>
              {status}
            </span>
          </div>

          {/* ── Video Grid ── */}
          <div className="video-grid">

            {/* Local video */}
            <div className="video-tile" style={{ position: 'relative' }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', display: 'block',
                  background: '#0d0d0d',
                  transform: 'scaleX(-1)', // mirror effect
                }}
              />
              {/* Fallback avatar when cam is off */}
              {!camOn && (
                <div className="cam-off" style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  background: '#111',
                }}>
                  <div className="cam-avatar">{myInitial}</div>
                  <div className="cam-label">Camera Off</div>
                </div>
              )}
              <div className="tile-name">
                <span className={micOn ? 'mic-on' : 'mic-off'} />
                You
              </div>
            </div>

            {/* Remote video */}
            <div className="video-tile" style={{ position: 'relative' }}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', display: 'block',
                  background: '#0d0d0d',
                }}
              />
              {/* Waiting placeholder */}
              {!partnerConnected && (
                <div className="cam-off" style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  background: '#111',
                }}>
                  <div className="cam-avatar">{partnerInitial}</div>
                  <div className="cam-label">
                    {status === 'Connected ✓'
                      ? `${partnerName} (camera off)`
                      : status}
                  </div>
                </div>
              )}
              <div className="tile-name">
                <span className="mic-on" />
                {partnerName}
              </div>
            </div>
          </div>

          {/* ── Controls ── */}
          <div className="controls">
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

            <button
              className="ctrl-btn end-call"
              onClick={endCall}
              title="End Call"
            >
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

        {/* ── Notes Panel ── */}
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