import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { reviewsAPI, requestsAPI } from '../services/api';

const CAT_KEYS = ['knowledge', 'communication', 'punctuality'];

export default function ReviewPage() {
  const { id }   = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [request,   setRequest]   = useState(null);
  const [existing,  setExisting]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  const [overall,   setOverall]   = useState(0);
  const [catScores, setCatScores] = useState({ knowledge:0, communication:0, punctuality:0 });
  const [tags,      setTags]      = useState([]);
  const [text,      setText]      = useState('');
  const [msg,       setMsg]       = useState({ text:'', type:'' });
  const [submitting, setSubmitting] = useState(false);

  const TAG_OPTIONS = ['👍 Great Teacher','🎯 Very Focused','💬 Clear Communicator','⏰ Always on Time','📚 Knowledgeable','🔄 Would Swap Again','🌟 Highly Recommend'];

  useEffect(() => {
    Promise.all([requestsAPI.getById(id), reviewsAPI.get(id)])
      .then(([reqRes, revRes]) => {
        setRequest(reqRes.data.request);
        setExisting(revRes.data.review);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const toggleTag = (tag) => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  const setCat = (cat, val) => setCatScores(s => ({ ...s, [cat]: val }));

  const submit = async () => {
    if (!overall) return setMsg({ text: 'Please select an overall star rating.', type: 'error' });
    if (!text.trim()) return setMsg({ text: 'Please write a short review.', type: 'error' });
    setSubmitting(true);
    setMsg({ text:'', type:'' });
    try {
      await reviewsAPI.submit(id, { overall, categories: catScores, tags, text: text.trim() });
      setMsg({ text: '✅ Review submitted! Thank you for your feedback.', type: 'success' });
      setTimeout(() => navigate('/dashboard'), 1400);
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Submission failed.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--muted)' }}>Loading…</div>;

  const isSender    = request?.requestedBy === user?.username;
  const partnerName = request ? (isSender ? request.offeredBy : request.requestedByName) : '';

  return (
    <>
      <div className="bg-glow" />
      <div className="card">
        <Link to="/" className="logo">
          <div className="logo-icon"><svg viewBox="0 0 24 24"><polyline points="7 16 3 12 7 8"/><polyline points="17 8 21 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/></svg></div>
          SkillSwap
        </Link>

        {/* Already reviewed */}
        {existing ? (
          <div className="already-reviewed">
            <div className="stars">{'⭐'.repeat(existing.overall)}</div>
            <h3>Review Submitted!</h3>
            <p>You gave this swap <strong>{existing.overall}/5 stars</strong>.<br />Thank you for helping our community.</p>
            <div className="back-link" style={{ marginTop:20 }}><Link to="/dashboard">← Back to Dashboard</Link></div>
          </div>
        ) : (
          <>
            {/* Partner row */}
            {request && (
              <div className="partner-row">
                <div className="partner-av">{partnerName[0]?.toUpperCase()}</div>
                <div className="partner-av-info">
                  <div className="pname">{partnerName}</div>
                  <div className="pskill">⚡ {request.skillName} Swap</div>
                </div>
              </div>
            )}

            <h2>How was your swap? ⭐</h2>
            <div className="sub">Your honest feedback helps the community grow.</div>

            {/* Overall stars */}
            <div className="field">
              <label>Overall Rating</label>
              <div className="star-group">
                {[5,4,3,2,1].map(v => (
                  <React.Fragment key={v}>
                    <input type="radio" name="stars" id={`s${v}`} value={v} checked={overall === v} onChange={() => setOverall(v)} />
                    <label htmlFor={`s${v}`} style={{ color: overall >= v ? 'var(--accent2)' : 'var(--border2)' }}>★</label>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Category ratings */}
            <div className="cat-ratings">
              {CAT_KEYS.map(cat => (
                <div className="cat-row" key={cat}>
                  <span className="cat-label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                  <div className="mini-stars">
                    {[1,2,3,4,5].map(v => (
                      <span key={v} className={`mini-star ${catScores[cat] >= v ? 'lit' : ''}`} onClick={() => setCat(cat, v)}>★</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Tags */}
            <div className="field">
              <label>Highlights (select all that apply)</label>
              <div className="tags-wrap">
                {TAG_OPTIONS.map(t => (
                  <div key={t} className={`tag ${tags.includes(t) ? 'selected' : ''}`} onClick={() => toggleTag(t)}>{t}</div>
                ))}
              </div>
            </div>

            {/* Text */}
            <div className="field">
              <label>Your Review</label>
              <textarea placeholder="Share your experience — what did you learn? What went well?" value={text} onChange={e => setText(e.target.value)} />
            </div>

            {msg.text && <div className={`msg ${msg.type}`}>{msg.text}</div>}

            <button className="submit-btn" onClick={submit} disabled={submitting}>
              <i className="fas fa-star" /> {submitting ? 'Submitting…' : 'Submit Review'}
            </button>

            <div className="back-link"><Link to="/dashboard">← Back to Dashboard</Link></div>
          </>
        )}
      </div>
    </>
  );
}
