import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { skillsAPI, requestsAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useScrollReveal } from '../hooks/useScrollReveal';
import Toast from '../components/common/Toast';

const CATEGORIES = [
  'Web Development','Graphic Design','Photography','Public Speaking',
  'Video Editing','Data Analysis','Music / Guitar','Content Writing','Digital Marketing',
];
const EMOJIS = {
  'Web Development':'💻','Graphic Design':'🎨','Photography':'📸','Public Speaking':'🎤',
  'Video Editing':'🎬','Data Analysis':'📊','Music / Guitar':'🎸','Content Writing':'✍️',
  'Digital Marketing':'📣','Other':'🔧',
};

export default function SkillsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  useScrollReveal();

  const [skills,     setSkills]     = useState([]);
  const [requested,  setRequested]  = useState(new Set()); // Set of skill IDs I've requested
  const [mySkillIds, setMySkillIds] = useState(new Set()); // Set of skill IDs I own
  const [loading,    setLoading]    = useState(true);

  // Toolbar state
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('');
  const [sort,     setSort]     = useState('newest');

  // Add-skill form state
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm]         = useState({ name:'', category:'', desc:'', wantLearn:'', avail:'Weekends' });
  const [formMsg, setFormMsg]   = useState({ text:'', type:'' });
  const [formLoading, setFormLoading] = useState(false);

  // Requests badge
  const [reqCount, setReqCount] = useState(0);

  // ── Load skills ──────────────────────────────────────────────────────────
  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)   params.search   = search;
      if (category) params.category = category;
      if (sort)     params.sort     = sort;

      const res = await skillsAPI.getAll(params);
      setSkills(res.data.skills);
    } catch {
      showToast('Failed to load skills', 'orange');
    } finally {
      setLoading(false);
    }
  }, [search, category, sort]);

  // ── Load my sent requests (to mark buttons as "Requested") ───────────────
  const loadMyRequests = useCallback(async () => {
    if (!user) return;
    try {
      const [sentRes, mySkillsRes] = await Promise.all([
        requestsAPI.getSent(),
        skillsAPI.getAll({}),
      ]);
      const sentIds = new Set(sentRes.data.requests.map(r => String(r.skill)));
      setRequested(sentIds);

      const myIds = new Set(
        mySkillsRes.data.skills
          .filter(s => s.username === user.username)
          .map(s => String(s._id || s.id))
      );
      setMySkillIds(myIds);
      setReqCount(sentRes.data.requests.length);
    } catch {}
  }, [user]);

  useEffect(() => { loadSkills(); }, [loadSkills]);
  useEffect(() => { loadMyRequests(); }, [loadMyRequests]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(loadSkills, 350);
    return () => clearTimeout(t);
  }, [search]);

  // ── Request a skill ──────────────────────────────────────────────────────
  const requestSkill = async (skillId, skillName) => {
    if (!user) {
      showToast('🔒 Please login to request a skill', 'orange');
      setTimeout(() => navigate('/signup'), 1200);
      return;
    }
    try {
      await requestsAPI.send(skillId);
      setRequested(prev => new Set([...prev, String(skillId)]));
      setReqCount(c => c + 1);
      showToast(`✅ Swap requested for "${skillName}"!`, 'green');
    } catch (err) {
      showToast(err.response?.data?.message || 'Request failed', 'orange');
    }
  };

  // ── Delete skill ─────────────────────────────────────────────────────────
  const deleteSkill = async (id) => {
    if (!confirm('Remove this skill listing?')) return;
    try {
      await skillsAPI.remove(id);
      showToast('🗑 Skill removed.', 'orange');
      loadSkills();
      loadMyRequests();
    } catch {
      showToast('Failed to remove skill', 'orange');
    }
  };

  // ── Add skill ────────────────────────────────────────────────────────────
  const addSkill = async () => {
    if (!form.name || !form.category || !form.desc || !form.wantLearn) {
      return setFormMsg({ text: 'Please fill in all fields.', type: 'error' });
    }
    setFormLoading(true);
    setFormMsg({ text: '', type: '' });
    try {
      await skillsAPI.create(form);
      setFormMsg({ text: '✓ Skill published!', type: 'success' });
      setTimeout(() => {
        setFormOpen(false);
        setForm({ name:'', category:'', desc:'', wantLearn:'', avail:'Weekends' });
        setFormMsg({ text:'', type:'' });
        loadSkills();
        loadMyRequests();
      }, 900);
      showToast('🎉 Your skill is now live!', 'green');
    } catch (err) {
      setFormMsg({ text: err.response?.data?.message || 'Failed to publish.', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const ff = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <>
      {/* ── HEADER ── */}
      <header>
        <Link to="/" className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24"><polyline points="7 16 3 12 7 8"/><polyline points="17 8 21 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/></svg>
          </div>
          SkillSwap
        </Link>
        <div className="nav-right">
          {user ? (
            <>
              <span style={{ fontSize:'13px', color:'var(--muted)' }}>Hi, <strong style={{ color:'var(--text)' }}>{user.username}</strong></span>
              <Link to="/" style={{ fontSize:'13px', color:'var(--muted)', textDecoration:'none' }}>Home</Link>
              <Link to="/dashboard" style={{ fontSize:'13px', color:'var(--accent1)', textDecoration:'none', padding:'7px 13px', border:'1px solid rgba(249,115,22,0.25)', borderRadius:'8px', fontWeight:600 }}>Dashboard</Link>
              <button onClick={logout} style={{ padding:'7px 13px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', borderRadius:'8px', fontFamily:"'DM Sans',sans-serif", fontSize:'13px', cursor:'pointer' }}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/">Home</Link>
              <Link to="/signup" className="btn" style={{ padding:'8px 16px', fontSize:'13px' }}>Login / Sign Up</Link>
            </>
          )}
        </div>
      </header>

      {/* ── PAGE HEADER ── */}
      <div className="page-header">
        <div>
          <h1>Browse <span>Skills</span></h1>
          <p>Discover people willing to swap expertise with you.</p>
        </div>
        {user && reqCount > 0 && (
          <div>
            <Link to="/dashboard" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'9px 18px', background:'transparent', border:'1px solid var(--border2)', borderRadius:10, color:'var(--muted)', textDecoration:'none', fontSize:14 }}>
              <i className="fas fa-bell" /> My Requests ({reqCount})
            </Link>
          </div>
        )}
      </div>

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        <div className="search-box">
          <i className="fas fa-search" />
          <input type="text" placeholder="Search skills, people…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={category} onChange={e => { setCategory(e.target.value); loadSkills(); }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="sort-select" value={sort} onChange={e => { setSort(e.target.value); loadSkills(); }}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>

      {/* ── ADD SKILL ── */}
      {user && (
        <div className="add-skill-section">
          {!formOpen && (
            <div className="add-skill-toggle" onClick={() => setFormOpen(true)}>
              <i className="fas fa-plus-circle" />
              <span>List your skill — start swapping</span>
            </div>
          )}
          {formOpen && (
            <div className="add-skill-form open">
              <div className="form-field">
                <label>Skill Name</label>
                <input type="text" placeholder="e.g. Web Development" value={form.name} onChange={ff('name')} />
              </div>
              <div className="form-field">
                <label>Category</label>
                <select value={form.category} onChange={ff('category')}>
                  <option value="">Select…</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  <option>Other</option>
                </select>
              </div>
              <div className="form-field full">
                <label>Description</label>
                <textarea placeholder="What will you teach? What experience do you have?" value={form.desc} onChange={ff('desc')} />
              </div>
              <div className="form-field">
                <label>Wants to Learn (in exchange)</label>
                <select value={form.wantLearn} onChange={ff('wantLearn')}>
                  <option value="">Select…</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  <option>Other</option>
                </select>
              </div>
              <div className="form-field">
                <label>Availability</label>
                <select value={form.avail} onChange={ff('avail')}>
                  <option>Weekends</option>
                  <option>Weekday Evenings</option>
                  <option>Flexible</option>
                  <option>Weekdays</option>
                </select>
              </div>
              {formMsg.text && <div className={`form-msg ${formMsg.type}`}>{formMsg.text}</div>}
              <div className="form-field full" style={{ flexDirection:'row', gap:10, alignItems:'center' }}>
                <button className="btn" onClick={addSkill} disabled={formLoading} style={{ flex:1 }}>
                  <i className="fas fa-plus" /> {formLoading ? 'Publishing…' : 'Publish Skill'}
                </button>
                <button onClick={() => { setFormOpen(false); setFormMsg({ text:'', type:'' }); }}
                  style={{ padding:'12px 18px', border:'1px solid var(--border2)', background:'transparent', color:'var(--muted)', borderRadius:10, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SKILLS GRID ── */}
      <div className="skills-wrap">
        <div className="skills-grid">
          {loading ? (
            <div className="empty-state" style={{ gridColumn:'1/-1' }}>
              <p style={{ color:'var(--muted)' }}>Loading skills…</p>
            </div>
          ) : skills.length === 0 ? (
            <div className="empty-state" style={{ gridColumn:'1/-1' }}>
              <i className="fas fa-search" />
              <p>No skills found. Try a different search or be the first to list one!</p>
            </div>
          ) : skills.map(s => {
            const sid = String(s._id || s.id);
            const isOwn      = user && s.username === user.username;
            const hasReq     = requested.has(sid);

            let btnClass = 'request-btn';
            let btnText  = '⚡ Request Swap';
            let btnDisabled = false;
            let onBtnClick = () => requestSkill(sid, s.name);

            if (isOwn)    { btnClass = 'request-btn own-skill';  btnText = '✓ Your Listing'; btnDisabled = true; onBtnClick = null; }
            else if (hasReq) { btnClass = 'request-btn requested'; btnText = '✅ Requested';    btnDisabled = true; onBtnClick = null; }

            return (
              <div className="skill-card" key={sid}>
                <div className="card-top">
                  <div>
                    <div className="skill-category">{s.category}</div>
                    <div className="skill-name">{s.name}</div>
                  </div>
                  <div className="skill-icon">{s.emoji || EMOJIS[s.category] || '🔧'}</div>
                </div>
                <div className="skill-desc">{s.desc}</div>
                <div className="card-meta">
                  <div className="meta-row"><i className="fas fa-user" /><span className="label">Offered by</span><span className="value">{s.offeredBy}</span></div>
                  <div className="meta-row"><i className="fas fa-calendar" /><span className="label">Available</span><span className="value">{s.avail}</span></div>
                  <div className="meta-row" style={{ marginTop:2 }}>
                    <span className="swap-tag">↔ Wants: {s.wantLearn}</span>
                    {isOwn && (
                      <button onClick={() => deleteSkill(sid)}
                        style={{ marginLeft:'auto', padding:'4px 10px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#fca5a5', borderRadius:6, fontSize:11, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <button className={btnClass} disabled={btnDisabled} onClick={onBtnClick}>{btnText}</button>
              </div>
            );
          })}
        </div>
      </div>

      <Toast toast={toast} />
    </>
  );
}
