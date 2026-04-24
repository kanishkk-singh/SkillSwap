import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SKILLS = [
  'Web Development','Graphic Design','Photography','Public Speaking',
  'Video Editing','Data Analysis','Music / Guitar','Content Writing',
  'Digital Marketing','Other',
];

// Password strength — mirrors original pwdStrength()
function calcStrength(v) {
  let score = 0;
  if (v.length >= 6)           score++;
  if (v.length >= 10)          score++;
  if (/[A-Z]/.test(v))         score++;
  if (/[0-9]/.test(v))         score++;
  if (/[^a-zA-Z0-9]/.test(v)) score++;
  return score;
}
const STRENGTH_COLORS = ['','#ef4444','#f97316','#facc15','#22c55e','#22c55e'];

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab]   = useState(searchParams.get('mode') === 'register' ? 'register' : 'login');

  // Login state
  const [loginForm, setLoginForm]     = useState({ username: '', password: '' });
  const [loginMsg,  setLoginMsg]      = useState({ text: '', type: '' });
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [regForm, setRegForm]         = useState({ fname:'', lname:'', username:'', email:'', offer:'', want:'', password:'' });
  const [regMsg,  setRegMsg]          = useState({ text: '', type: '' });
  const [regLoading, setRegLoading]   = useState(false);
  const [pwdScore, setPwdScore]       = useState(0);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  // ── Login submit ──────────────────────────────────────────────────────────
  const doLogin = async (e) => {
    e?.preventDefault();
    if (!loginForm.username || !loginForm.password) {
      return setLoginMsg({ text: 'Please fill in all fields.', type: 'error' });
    }
    setLoginLoading(true);
    setLoginMsg({ text: '', type: '' });
    try {
      await login({ username: loginForm.username.trim().toLowerCase(), password: loginForm.password });
      setLoginMsg({ text: 'Login successful! Redirecting…', type: 'success' });
      setTimeout(() => navigate('/skills'), 900);
    } catch (err) {
      setLoginMsg({ text: err.response?.data?.message || 'Incorrect username or password.', type: 'error' });
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Register submit ───────────────────────────────────────────────────────
  const doRegister = async (e) => {
    e?.preventDefault();
    const { fname, username, email, offer, want, password } = regForm;
    if (!fname || !username || !email || !password || !offer || !want) {
      return setRegMsg({ text: 'Please fill in all required fields.', type: 'error' });
    }
    if (password.length < 6) {
      return setRegMsg({ text: 'Password must be at least 6 characters.', type: 'error' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return setRegMsg({ text: 'Please enter a valid email address.', type: 'error' });
    }
    setRegLoading(true);
    setRegMsg({ text: '', type: '' });
    try {
      await register({ ...regForm, username: regForm.username.trim().toLowerCase(), email: regForm.email.trim().toLowerCase() });
      setRegMsg({ text: 'Account created! Redirecting…', type: 'success' });
      setTimeout(() => navigate('/skills'), 900);
    } catch (err) {
      setRegMsg({ text: err.response?.data?.message || 'Registration failed. Please try again.', type: 'error' });
    } finally {
      setRegLoading(false);
    }
  };

  // Enter key support
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Enter') return;
      if (tab === 'login') doLogin();
      else doRegister();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, loginForm, regForm]);

  const lf = (field) => (e) => setLoginForm(f => ({ ...f, [field]: e.target.value }));
  const rf = (field) => (e) => {
    const val = e.target.value;
    setRegForm(f => ({ ...f, [field]: val }));
    if (field === 'password') setPwdScore(calcStrength(val));
  };

  return (
    <>
      <div className="bg-glow" />
      <div className="bg-grid" />

      <div className="card">
        <Link to="/" className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24"><polyline points="7 16 3 12 7 8"/><polyline points="17 8 21 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/></svg>
          </div>
          SkillSwap
        </Link>

        {/* TABS */}
        <div className="tabs">
          <button className={`tab-btn ${tab === 'login' ? 'active' : ''}`}    onClick={() => setTab('login')}>Login</button>
          <button className={`tab-btn ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Create Account</button>
        </div>

        {/* ── LOGIN TAB ── */}
        {tab === 'login' && (
          <div className="tab-content active">
            <div className="form-title">Welcome back 👋</div>
            <div className="form-sub">Log in to your SkillSwap account</div>

            {loginMsg.text && <div className={`msg ${loginMsg.type}`}>{loginMsg.text}</div>}

            <div className="field">
              <label>Username</label>
              <input type="text" placeholder="your_username" autoComplete="username"
                value={loginForm.username} onChange={lf('username')} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" placeholder="••••••••" autoComplete="current-password"
                value={loginForm.password} onChange={lf('password')} />
            </div>

            <button className="btn" onClick={doLogin} disabled={loginLoading}>
              <span>{loginLoading ? 'Logging in…' : 'Login'}</span>
              {loginLoading && <div className="spinner" style={{ display: 'block' }} />}
            </button>

            <div className="back-link" style={{ marginTop: '14px' }}>
              No account?{' '}
              <a href="#" onClick={e => { e.preventDefault(); setTab('register'); }}>Create one free</a>
            </div>
          </div>
        )}

        {/* ── REGISTER TAB ── */}
        {tab === 'register' && (
          <div className="tab-content active">
            <div className="form-title">Join SkillSwap ✦</div>
            <div className="form-sub">Create your free account in seconds</div>

            {regMsg.text && <div className={`msg ${regMsg.type}`}>{regMsg.text}</div>}

            <div className="input-row">
              <div className="field">
                <label>First Name</label>
                <input type="text" placeholder="Rahul" value={regForm.fname} onChange={rf('fname')} />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input type="text" placeholder="Sharma" value={regForm.lname} onChange={rf('lname')} />
              </div>
            </div>

            <div className="field">
              <label>Username</label>
              <input type="text" placeholder="rahul_sharma" value={regForm.username} onChange={rf('username')} />
            </div>

            <div className="field">
              <label>Email</label>
              <input type="email" placeholder="you@email.com" value={regForm.email} onChange={rf('email')} />
            </div>

            <div className="field">
              <label>Skill You Offer</label>
              <select value={regForm.offer} onChange={rf('offer')}>
                <option value="">Select a skill…</option>
                {SKILLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Skill You Want to Learn</label>
              <select value={regForm.want} onChange={rf('want')}>
                <option value="">Select a skill…</option>
                {SKILLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Password</label>
              <input type="password" placeholder="Min 6 characters" value={regForm.password} onChange={rf('password')} />
              <div className="pwd-strength">
                <div className="pwd-strength-fill" style={{ width: `${pwdScore * 20}%`, background: STRENGTH_COLORS[pwdScore] || 'transparent' }} />
              </div>
            </div>

            <button className="btn" onClick={doRegister} disabled={regLoading}>
              <span>{regLoading ? 'Creating account…' : 'Create Account'}</span>
              {regLoading && <div className="spinner" style={{ display: 'block' }} />}
            </button>

            <div className="back-link">
              Already have an account?{' '}
              <a href="#" onClick={e => { e.preventDefault(); setTab('login'); }}>Log in</a>
            </div>
          </div>
        )}

        <div className="back-link" style={{ marginTop: '20px' }}>
          <Link to="/">← Back to home</Link>
        </div>
      </div>
    </>
  );
}
