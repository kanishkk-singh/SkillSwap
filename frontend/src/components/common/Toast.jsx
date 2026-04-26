import React from 'react';

const Toast = ({ toast }) => (
  <div className={`toast ${toast.type} ${toast.visible ? 'show' : ''}`}>
    {toast.msg}
  </div>
);

export default Toast;
