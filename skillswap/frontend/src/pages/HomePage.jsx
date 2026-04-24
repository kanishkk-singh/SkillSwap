import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { statsAPI } from '../services/api';
import { useScrollReveal } from '../hooks/useScrollReveal';

// ── Counter animation (mirrors original animateCounter JS) ───────────────────
function animateCounter(el, target) {
  if (!el) return;
  let start = null;
  const dur = 1800;
  const step = (ts) => {
    if (!start) start = ts;
    const prog = Math.min((ts - start) / dur, 1);
    const val = Math.floor(prog * target);
    el.textContent = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val;
    if (prog < 1) requestAnimationFrame(step);
    else el.textContent = target >= 1000 ? (target / 1000).toFixed(1) + 'k' : target;
  };
  requestAnimationFrame(step);
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [scrolled, setScrolled]   = useState(false);
  useScrollReveal();
  const [stats, setStats]          = useState({ users: 1240, skills: 48, swaps: 890 });

  const usersRef  = useRef(null);
  const skillsRef = useRef(null);
  const swapsRef  = useRef(null);
  const statsBar  = useRef(null);
  const animated  = useRef(false);

  // Fetch real stats from backend
  useEffect(() => {
    statsAPI.get().then(res => setStats(res.data.stats)).catch(() => {});
  }, []);

  // Header shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Smooth scroll for anchor links
  const scrollTo = (e, id) => {
    e.preventDefault();
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // IntersectionObserver for counter animation
  useEffect(() => {
    if (!statsBar.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !animated.current) {
          animated.current = true;
          animateCounter(usersRef.current,  stats.users);
          animateCounter(skillsRef.current, stats.skills);
          animateCounter(swapsRef.current,  stats.swaps);
          obs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(statsBar.current);
    return () => obs.disconnect();
  }, [stats]);

  return (
    <>
      {/* ── HEADER ── */}
      <header id="site-header" style={{ boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.6)' : 'none' }}>
        <Link to="/" className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M7 16l-4-4 4-4M17 8l4 4-4 4M14 4l-4 16" /></svg>
          </div>
          SkillSwap
        </Link>

        <nav>
          <ul>
            <li><a href="#home"   onClick={e => scrollTo(e, '#home')}>Home</a></li>
            <li><a href="#about"  onClick={e => scrollTo(e, '#about')}>Features</a></li>
            <li><a href="#how"    onClick={e => scrollTo(e, '#how')}>How It Works</a></li>
            <li><Link to="/skills">Browse Skills</Link></li>
            <li><a href="#contact" onClick={e => scrollTo(e, '#contact')}>Contact</a></li>
          </ul>
        </nav>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {user ? (
            <>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Hi, <strong style={{ color: 'var(--text)' }}>{user.username}</strong>
              </span>
              <Link to="/dashboard" style={{ fontSize: '13px', color: 'var(--accent1)', textDecoration: 'none', padding: '7px 14px', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '8px', fontWeight: 600 }}>
                Dashboard
              </Link>
              <button onClick={logout} style={{ padding: '7px 14px', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/signup" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', padding: '7px 14px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                Login
              </Link>
              <Link to="/signup?mode=register" className="btn" style={{ padding: '8px 18px', fontSize: '13px' }}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ── HERO ── */}
      <section id="home" className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="hero-badge">✦ Community-Powered Learning</div>
          <h1>Exchange Skills,<br /><span className="highlight">Learn &amp; Grow</span></h1>
          <p>Trade what you know for what you want to learn. Connect with real people, build real skills — no money needed.</p>
          <div className="hero-btns">
            <Link to="/skills" className="btn"><i className="fas fa-compass" /> Explore Skills</Link>
            {user
              ? <Link to="/skills" className="btn-outline"><i className="fas fa-arrow-right" /> Browse Skills</Link>
              : <Link to="/signup" className="btn-outline" id="hero-cta"><i className="fas fa-arrow-right" /> Join Free</Link>
            }
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <div className="stats-bar" ref={statsBar}>
        <div className="stat-item">
          <span className="num" ref={usersRef}>0</span>
          <span className="label">Members</span>
        </div>
        <div className="stat-item">
          <span className="num" ref={skillsRef}>0</span>
          <span className="label">Skills Listed</span>
        </div>
        <div className="stat-item">
          <span className="num" ref={swapsRef}>0</span>
          <span className="label">Swaps Completed</span>
        </div>
        <div className="stat-item">
          <span className="num">4.9★</span>
          <span className="label">Avg Rating</span>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="about" className="features">
        <div className="feature reveal">
          <div className="feature-icon"><i className="fas fa-users" style={{ color: 'var(--accent1)' }} /></div>
          <h3>Find Experts</h3>
          <p>Connect with skilled professionals across 50+ categories — from coding to cooking.</p>
        </div>
        <div className="feature reveal">
          <div className="feature-icon"><i className="fas fa-exchange-alt" style={{ color: 'var(--accent1)' }} /></div>
          <h3>Swap Skills</h3>
          <p>Trade your expertise directly. No money, no middleman — just mutual growth.</p>
        </div>
        <div className="feature reveal">
          <div className="feature-icon"><i className="fas fa-graduation-cap" style={{ color: 'var(--accent1)' }} /></div>
          <h3>Learn &amp; Grow</h3>
          <p>Gain new knowledge every day from real practitioners, not just course creators.</p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="how-it-works">
        <p className="section-label">Process</p>
        <h2 className="section-title">How SkillSwap Works</h2>
        <div className="steps">
          {[
            ['1', 'Create Profile',   'Sign up and list the skills you can teach and want to learn.'],
            ['2', 'Browse & Request', 'Find someone with the skill you need and send a swap request.'],
            ['3', 'Connect & Learn',  'Chat, schedule, and start learning from each other.'],
            ['4', 'Rate & Grow',      'Leave feedback and build your reputation in the community.'],
          ].map(([n, title, desc]) => (
            <div className="step reveal" key={n}>
              <div className="step-num">{n}</div>
              <h4>{title}</h4>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact">
        <h2>Get In Touch</h2>
        <p style={{ marginTop: '12px' }}>
          Questions? Reach us at{' '}
          <a href="mailto:kanishkkumarsingh337@gmail.com">kanishkkumarsingh337@gmail.com</a>
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <p>© 2025 SkillSwap · All rights reserved.</p>
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <Link to="/skills">Skills</Link>
          <Link to="/signup">Sign Up</Link>
        </div>
      </footer>
    </>
  );
}
