import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { chatAPI, requestsAPI } from '../services/api';

const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const avatar = (name) => (name || '?')[0].toUpperCase();

export default function ChatPage() {
  const { id }      = useParams();
  const { user }    = useAuth();
  const navigate    = useNavigate();

  const [request,  setRequest]  = useState(null);
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');

  const msgsRef    = useRef(null);
  const pollRef    = useRef(null);

  // ── Load swap request meta ────────────────────────────────────────────────
  useEffect(() => {
    requestsAPI.getById(id)
      .then(res => setRequest(res.data.request))
      .catch(() => setError('Request not found or you are not a participant.'));
  }, [id]);

  // ── Load messages (and poll every 3s) ───────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!id) return;
    try {
      const res = await chatAPI.getMessages(id);
      setMessages(res.data.messages);
    } catch {}
  }, [id]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]);

  // ── Auto-scroll to bottom ────────────────────────────────────────────────
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMsg = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await chatAPI.send(id, trimmed);
      setText('');
      await loadMessages();
    } catch {}
    setSending(false);
  };

  if (error) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16 }}>
        <p style={{ color:'var(--muted)' }}>{error}</p>
        <Link to="/dashboard" style={{ color:'var(--accent1)' }}>← Dashboard</Link>
      </div>
    );
  }

  const isSender    = request?.requestedBy === user?.username;
  const partnerName = request ? (isSender ? request.offeredBy : request.requestedByName) : '…';

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* TOPBAR */}
      <div className="topbar">
        <button className="back-btn" onClick={() => navigate(-1)}><i className="fas fa-arrow-left" /></button>
        <div className="chat-partner">
          <div className="name">{partnerName}</div>
          <div className="sub"><span className="online-dot" />Active now · Skill Swap</div>
        </div>
        <div className="topbar-actions">
          <Link to={`/meet/${id}`} className="top-btn meet"><i className="fas fa-video" /><span>Video Meet</span></Link>
          <Link to={`/review/${id}`} className="top-btn"><i className="fas fa-star" /><span>Review</span></Link>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="messages" ref={msgsRef}>
        {request && (
          <>
            <div className="sys-msg">🎉 Swap accepted! Say hello to start learning together.</div>
            <div className="sys-msg">📌 Skill: <strong>{request.skillName}</strong></div>
          </>
        )}
        {messages.map((m, i) => {
          const mine = m.from === user?.username;
          return (
            <div key={m._id || i} className={`msg-row ${mine ? 'mine' : ''}`}>
              <div className="avatar">{avatar(mine ? (user?.fname || user?.username) : partnerName)}</div>
              <div className="bubble">
                {m.text}
                <div className="time">{fmt(m.at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* INPUT BAR */}
      <div className="input-bar">
        <input
          type="text"
          placeholder="Type a message…"
          maxLength={500}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMsg()}
        />
        <button className="send-btn" onClick={sendMsg} disabled={sending}>
          <i className="fas fa-paper-plane" />
        </button>
      </div>
    </div>
  );
}
