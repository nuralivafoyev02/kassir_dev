import React, { useState } from 'react';
import { X, Moon, Sun, Download, Upload, Trash2, Key } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { supabase } from '../../services/supabase';

export function SettingsModal({ isOpen, onClose }) {
  const { exchangeRate, setExchangeRate, pin, setPin, userId, fetchAll } = useApp();
  const [localRate, setLocalRate] = useState(exchangeRate);

  if (!isOpen) return null;

  const handleSaveRate = async (val) => {
    const rate = parseFloat(val);
    if (isNaN(rate)) return;
    try {
      const { error } = await supabase.from('users').update({ exchange_rate: rate }).eq('user_id', userId);
      if (error) throw error;
      setExchangeRate(rate);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Barcha ma'lumotlarni o'chirishni tasdiqlaysizmi?")) return;
    try {
      await supabase.from('transactions').delete().eq('user_id', userId);
      await fetchAll();
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="ov on" onClick={(e) => e.target.className === 'ov on' && onClose()}>
      <div className="sheet" style={{ paddingBottom: '40px' }}>
        <div className="sh-hdl"></div>
        <div className="sh-ttl">⚙️ Sozlamalar</div>
        
        <div className="si">
          <div>
            <div className="si-l">Valyuta kursi</div>
            <div className="si-s">1 USD = ? UZS</div>
          </div>
          <input 
            className="si-i" 
            type="number" 
            value={localRate} 
            onChange={(e) => setLocalRate(e.target.value)}
            onBlur={() => handleSaveRate(localRate)}
          />
        </div>

        <div className="si">
          <div>
            <div className="si-l">PIN Kod</div>
            <div className="si-s">{pin ? 'Oʻrnatilgan' : 'Oʻrnatilmagan'}</div>
          </div>
          <button className="si-a" onClick={() => {
            const newPin = window.prompt("Yangi PIN kiriting (4 raqam):");
            if (newPin && newPin.length === 4) {
              localStorage.setItem('kassa_pin', newPin);
              setPin(newPin);
            }
          }}>{pin ? 'Oʻzgartirish' : 'Oʻrnatish'}</button>
        </div>

        {pin && (
          <div style={{ padding: '4px 0 8px' }}>
            <button className="pin-rm" onClick={() => {
              localStorage.removeItem('kassa_pin');
              setPin(null);
            }}>— PIN ni oʻchirish</button>
          </div>
        )}

        <div className="si">
          <div>
            <div className="si-l">Mavzu</div>
            <div className="si-s">Tungi / Kunduzgi</div>
          </div>
          <button className="si-a"><Moon size={14}/> Almashtirish</button>
        </div>

        <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }}></div>
        
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '12px' }}>
          Ma'lumotlar
        </div>

        <button className="dbtn"><Download size={16}/> JSON Eksport</button>
        <button className="dbtn"><Upload size={16}/> JSON Import</button>
        <button className="dbtn red" onClick={handleReset}><Trash2 size={16}/> Barcha ma'lumotlarni o'chirish</button>
        
        <button className="bcl" style={{ marginTop: '16px', width: '100%' }} onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}
