import { useEffect } from 'react';

// Attaches IntersectionObserver to all .reveal elements on any page
export const useScrollReveal = () => {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
};
