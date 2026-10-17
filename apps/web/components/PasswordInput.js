'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from './ui.js';

// Password field with a show/hide toggle.
export function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-group">
      <input id={id} className="input" type={visible ? 'text' : 'password'} {...props} />
      <IconButton
        label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={id}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </IconButton>
    </div>
  );
}
