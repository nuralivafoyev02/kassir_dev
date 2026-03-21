import React, { useState, useEffect } from 'react';
import { Fingerprint, Delete } from 'lucide-react';
import { useApp } from '../../store/AppContext';

export function PINScreen({ onUnlock, mode = 'unlock' }) {
  const { pin, haptic } = useApp();
  const [pinBuf, setPinBuf] = useState('');
  const [isError, setIsError] = useState(false);

  const handleKey = (n) => {
    if (pinBuf.length >= 4) return;
    haptic?.('light');
    const newBuf = pinBuf + n.toString();
    setPinBuf(newBuf);
    if (newBuf.length === 4) {
      if (newBuf === pin) {
        haptic?.('success');
        onUnlock();
      } else {
        haptic?.('error');
        setIsError(true);
        setTimeout(() => {
          setPinBuf('');
          setIsError(false);
        }, 500);
      }
    }
  };

  const handleDelete = () => {
    haptic?.('light');
    setPinBuf(pinBuf.slice(0, -1));
  };

  return (
    <div id="pin-screen" className="on">
      <div id="pin-ttl">{mode === 'unlock' ? 'PIN Kod' : 'Yangi PIN'}</div>
      <div id="pin-sub">Kirish uchun 4 xonali kod</div>
      
      <div id="pin-dots" className={isError ? 'shk' : ''}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`pd ${i < pinBuf.length ? 'on' : ''}`} />
        ))}
      </div>

      <div className="pin-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button key={n} className="pk" onClick={() => handleKey(n)}>{n}</button>
        ))}
        <button className="pk" style={{ visibility: 'hidden' }}></button>
        <button className="pk" onClick={() => handleKey(0)}>0</button>
        <button className="pk" onClick={handleDelete}>
          <Delete size={20} />
        </button>
      </div>
      
      {mode === 'unlock' && (
        <button id="pin-bio-b" style={{ display: 'flex' }}>
           <Fingerprint />
           <span>Biometrika</span>
        </button>
      )}
    </div>
  );
}
