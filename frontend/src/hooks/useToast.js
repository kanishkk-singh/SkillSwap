import { useState, useCallback, useRef } from 'react';

export const useToast = () => {
  const [toast, setToast] = useState({ visible: false, msg: '', type: 'green' });
  const timerRef = useRef(null);

  const showToast = useCallback((msg, type = 'green') => {
    clearTimeout(timerRef.current);
    setToast({ visible: true, msg, type });
    timerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 3200);
  }, []);

  return { toast, showToast };
};
