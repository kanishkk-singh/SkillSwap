import React from 'react';
import { Link } from 'react-router-dom';

const Logo = () => (
  <Link to="/" className="logo">
    <div className="logo-icon">
      <svg viewBox="0 0 24 24">
        <polyline points="7 16 3 12 7 8" />
        <polyline points="17 8 21 12 17 16" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    </div>
    SkillSwap
  </Link>
);

export default Logo;
