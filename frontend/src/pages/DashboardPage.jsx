import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestsAPI, skillsAPI, reviewsAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useScrollReveal } from '../hooks/useScrollReveal';
import Toast from '../components/common/Toast';

const timeAgo = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
};
const avatar = (name) => (name || '?')[0].toUpperCase();

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  useScrollReveal();

  const [section,  setSection]  = useState('incoming');
  const [incoming, setIncoming] = useState([]);
  const [sent,     setSent]     = useState([]);
  const [active,   setActive]   = useState([]);
  const [mySkills, setMySkills] = useState([]);
  const [reviewed, setReviewed] = useState(new Set());
  const [loading,  setLoading]  = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [inRes, sentRes, actRes, skillRes] = await Promise.all([
        requestsAPI.getIncoming(),
        requestsAPI.getSent(),
        requestsAPI.getActive(),
        skillsAPI.getAll({}),
      ]);
      setIncoming(inRes.data.requests);
      setSent(sentRes.data.requests);
      setActive(actRes.data.requests);
      setMySkills(skillRes.data.skills.filter(s => s.username === user.username));

      // Check which active swaps I've already reviewed
      const reviewChecks = await Promise.all(
        actRes.data.requests.map(r =>
          reviewsAPI.get(r._id).then(res => res.data.review ? r._id : null).catch(() => null)
        )
      );
      setReviewed(new Set(reviewChecks.filter(Boolean)));
    } catch {
      showToast('Failed to load dashboard data', 'orange');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const respond = async (reqId, status) => {
    try {
      await requestsAPI.updateStatus(reqId, status);
      showToast(status === 'accepted' ? '✅ Swap accepted! Chat is now available.' : '❌ Request declined.', status === 'accepted' ? 'green' : 'red');
      loadAll();
    } catch {
      showToast('Action failed', 'orange');
    }
  };

  const deleteSkill = async (id) => {
    if (!confirm('Remove this skill?')) return;
    try {
      await skillsAPI.remove(id);
      showToast('🗑 Skill removed.', 'red');
      loadAll();
    } catch {
      showToast('Failed to remove skill', 'orange');
    }
  };

  const pendingCount = incoming.filter(r => r.status === 'pending').length;

  return (
    <>
      <header>
        <Link to="/" className="logo">
          <div className="logo-icon"><svg viewBox="0 0 24 24"><polyline points="7 16 3 12 7 8"/><polyline points="17 8 21 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/></svg></div>
          SkillSwap
        </Link>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/skills">Browse Skills</Link>
          <span style={{ fontSize:13, color:'var(--muted)' }}>Hi, {user?.fname || user?.username}</span>
          <button onClick={logout} style={{ padding:'7px 13px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer' }}>Logout</button>
        </div>
      </header>

      <div className="container">
        <div className="page-title">Dashboard <span>⚡</span></div>
        <div className="page-sub">Welcome back, {user?.fname || user?.username}! Here are your latest swap activities.</div>

        {/* TABS */}
        <div className="dash-tabs">
          {[
            { id:'incoming', icon:'fa-inbox',       label:'Incoming',    count: pendingCount },
            { id:'sent',     icon:'fa-paper-plane', label:'Sent',        count: sent.length },
            { id:'active',   icon:'fa-handshake',   label:'Active Swaps',count: active.length },
            { id:'myskills', icon:'fa-layer-group', label:'My Skills',   count: null },
          ].map(t => (
            <button key={t.id} className={`dash-tab ${section === t.id ? 'active' : ''}`}
              onClick={() => setSection(t.id)}>
              <i className={`fas ${t.icon}`} /> {t.label}
              {t.count !== null && <span className="badge">{t.count}</span>}
            </button>
          ))}
        </div>

        {loading ? <p style={{ color:'var(--muted)', padding:'24px 0' }}>Loading…</p> : (
          <>
            {/* INCOMING */}
            {section === 'incoming' && (
              <div>
                {incoming.length === 0 ? (
                  <div className="empty"><i className="fas fa-inbox" /><p>No incoming requests yet.</p></div>
                ) : incoming.map(r => (
                  <div className="req-card" key={r._id}>
                    <div className="req-avatar">{avatar(r.requestedByName)}</div>
                    <div className="req-info">
                      <div className="name">{r.requestedByName}</div>
                      <div className="detail">@{r.requestedBy} wants to learn</div>
                      <div className="skill-pill">⚡ {r.skillName}</div>
                    </div>
                    <div className="req-time">{timeAgo(r.createdAt)}</div>
                    <div className="req-actions">
                      {r.status === 'pending' ? (
                        <>
                          <button className="btn-accept" onClick={() => respond(r._id, 'accepted')}><i className="fas fa-check" /> Accept</button>
                          <button className="btn-decline" onClick={() => respond(r._id, 'declined')}><i className="fas fa-times" /> Decline</button>
                        </>
                      ) : (
                        <>
                          <span className={`status-badge status-${r.status}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
                          {r.status === 'accepted' && <Link to={`/chat/${r._id}`} className="btn-chat"><i className="fas fa-comments" /> Chat</Link>}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SENT */}
            {section === 'sent' && (
              <div>
                {sent.length === 0 ? (
                  <div className="empty"><i className="fas fa-paper-plane" /><p>You haven't sent any requests yet. <Link to="/skills" style={{ color:'var(--accent1)' }}>Browse skills</Link>!</p></div>
                ) : sent.map(r => (
                  <div className="req-card" key={r._id}>
                    <div className="req-avatar" style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--accent1)' }}>⚡</div>
                    <div className="req-info">
                      <div className="name">{r.skillName}</div>
                      <div className="detail">Offered by {r.offeredBy}</div>
                      <div className="skill-pill">{r.status === 'pending' ? '⏳ Awaiting response' : r.status === 'accepted' ? '✅ Accepted' : '❌ Declined'}</div>
                    </div>
                    <div className="req-time">{timeAgo(r.createdAt)}</div>
                    <div className="req-actions">
                      <span className={`status-badge status-${r.status}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
                      {r.status === 'accepted' && <Link to={`/chat/${r._id}`} className="btn-chat"><i className="fas fa-comments" /> Chat</Link>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ACTIVE SWAPS */}
            {section === 'active' && (
              <div>
                {active.length === 0 ? (
                  <div className="empty"><i className="fas fa-handshake" /><p>No active swaps yet. Accept a request or get yours accepted!</p></div>
                ) : active.map(r => {
                  const isSender = r.requestedBy === user.username;
                  const partner  = isSender ? r.offeredBy : r.requestedByName;
                  const hasRev   = reviewed.has(r._id);
                  return (
                    <div className="req-card" key={r._id} style={{ borderColor:'rgba(34,197,94,0.2)' }}>
                      <div className="req-avatar">{avatar(partner)}</div>
                      <div className="req-info">
                        <div className="name">{partner}</div>
                        <div className="detail">Swapping: <strong style={{ color:'var(--text)' }}>{r.skillName}</strong></div>
                        <div className="skill-pill" style={{ background:'rgba(34,197,94,0.1)', borderColor:'rgba(34,197,94,0.2)', color:'#86efac' }}>✅ Active Swap</div>
                      </div>
                      <div className="req-time">{timeAgo(r.createdAt)}</div>
                      <div className="req-actions" style={{ gap:8 }}>
                        <Link to={`/chat/${r._id}`} className="btn-chat"><i className="fas fa-comments" /> Chat</Link>
                        <Link to={`/meet/${r._id}`} className="btn-chat" style={{ background:'rgba(250,204,21,0.1)', borderColor:'rgba(250,204,21,0.25)', color:'var(--accent2)' }}><i className="fas fa-video" /> Meet</Link>
                        {hasRev
                          ? <span className="status-badge status-accepted">Reviewed ✓</span>
                          : <Link to={`/review/${r._id}`} className="btn-chat" style={{ background:'rgba(255,255,255,0.05)', borderColor:'var(--border2)', color:'var(--muted)' }}><i className="fas fa-star" /> Review</Link>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MY SKILLS */}
            {section === 'myskills' && (
              <div>
                {mySkills.length === 0 ? (
                  <div className="empty"><i className="fas fa-layer-group" /><p>You haven't listed any skills yet.</p></div>
                ) : mySkills.map(s => (
                  <div className="my-skill-card" key={s._id || s.id}>
                    <div className="skill-emoji">{s.emoji || '🔧'}</div>
                    <div className="my-skill-info">
                      <h4>{s.name}</h4>
                      <p>{s.desc.slice(0, 80)}… | Wants: <strong style={{ color:'var(--accent1)' }}>{s.wantLearn}</strong></p>
                    </div>
                    <button onClick={() => deleteSkill(s._id || s.id)}
                      style={{ padding:'7px 12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', color:'#fca5a5', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginLeft:'auto' }}>
                      Remove
                    </button>
                  </div>
                ))}
                <Link to="/skills" className="btn btn-sm" style={{ marginTop:16, display:'inline-flex' }}>
                  <i className="fas fa-plus" /> Add New Skill
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      <Toast toast={toast} />
    </>
  );
}
