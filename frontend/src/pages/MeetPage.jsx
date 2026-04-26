import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestsAPI } from '../services/api';

export default function MeetPage() {
  const { id }   = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [request,    setRequest]    = useState(null);
  const [inCall,     setInCall]     = useState(false);
  const [micOn,      setMicOn]      = useState(true);
  const [camOn,      setCamOn]      = useState(false);
  const [notesOpen,  setNotesOpen]  = useState(true);
  const [callSecs,   setCallSecs]   = useState(0);
  const [notes,      setNotes]      = useState('');

  const timerRef   = useRef(null);
  const notesKey   = `ss_notes_${id}`;

  useEffect(() => {
    requestsAPI.getById(id).then(res => setRequest(res.data.request)).catch(() => {});
    setNotes(localStorage.getItem(notesKey) || '');
  }, [id]);

  const startCall = () => {
    setInCall(true);
    timerRef.current = setInterval(() => setCallSecs(s => s + 1), 1000);
  };

  const endCall = () => {
    if (!confirm('End the meeting?')) return;
    clearInterval(timerRef.current);
    setInCall(false);
    setCallSecs(0);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const isSender    = request?.requestedBy === user?.username;
  const partnerName = request ? (isSender ? request.offeredBy : request.requestedByName) : '…';
  const myInitial   = (user?.fname || user?.username || '?')[0].toUpperCase();
  const partnerInit = partnerName[0]?.toUpperCase() || 'P';

  const saveNotes = (val) => {
    setNotes(val);
    localStorage.setItem(notesKey, val);
  };

  /* ── LOBBY ── */
  if (!inCall) return (
    <div id="lobby" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:24, textAlign:'center', minHeight:'100vh', background:'var(--bg)' }}>
      <div className="meet-icon">🎥</div>
      <div className="meet-title">Video Meeting Room</div>
      <div className="meet-sub">
        {request ? `Ready to connect with ${partnerName} to learn ${request.skillName}?` : 'Get ready to connect!'}
      </div>

      <div className="partner-chip">
        <div className="dot" />
        <span>{partnerName}</span>
        <span style={{ color:'var(--muted)', fontSize:12 }}>· Skill Swap Partner</span>
      </div>

      <div className="info-row">
        <span><i className="fas fa-lock" style={{ color:'var(--accent1)' }} /> Private room</span>
        <span><i className="fas fa-clock" style={{ color:'var(--accent1)' }} /> No time limit</span>
        <span><i className="fas fa-shield-alt" style={{ color:'var(--accent1)' }} /> Secure</span>
      </div>

      <button className="join-btn" onClick={startCall}>
        <i className="fas fa-video" /> Start Meeting
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

  /* ── IN-CALL VIEW ── */
  return (
    <div id="call-view" className="active" style={{ height:'100vh', display:'flex', flexDirection:'column', background:'#050505' }}>
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', position:'relative' }}>

          {/* Timer */}
          <div className="call-timer">
            <span className="rec-dot" />
            <span>{fmtTime(callSecs)}</span>
          </div>

          {/* Video grid */}
          <div className="video-grid">
            <div className="video-tile">
              <div className="cam-off">
                <div className="cam-avatar">{myInitial}</div>
                <div className="cam-label">Camera Off (Preview)</div>
              </div>
              <div className="tile-name"><span className="mic-on" />You</div>
            </div>
            <div className="video-tile">
              <div className="cam-off">
                <div className="cam-avatar">{partnerInit}</div>
                <div className="cam-label">{partnerName} (camera off)</div>
              </div>
              <div className="tile-name"><span className="mic-on" />{partnerName}</div>
            </div>
          </div>

          {/* Controls */}
          <div className="controls">
            <button className={`ctrl-btn ${micOn ? '' : 'off'}`} onClick={() => setMicOn(m => !m)} title="Mute/Unmute">
              <i className={`fas fa-microphone${micOn ? '' : '-slash'}`} />
            </button>
            <button className={`ctrl-btn ${camOn ? '' : 'off'}`} onClick={() => setCamOn(c => !c)} title="Camera">
              <i className={`fas fa-video${camOn ? '' : '-slash'}`} />
            </button>
            <button className="ctrl-btn" onClick={() => alert('Screen share available in WebRTC integration.')} title="Share Screen">
              <i className="fas fa-desktop" />
            </button>
            <button className="ctrl-btn end-call" onClick={endCall} title="End Call">
              <i className="fas fa-phone-slash" />
            </button>
            <button className="ctrl-btn" onClick={() => setNotesOpen(n => !n)} title="Notes">
              <i className="fas fa-sticky-note" />
            </button>
          </div>
        </div>

        {/* Notes panel */}
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
