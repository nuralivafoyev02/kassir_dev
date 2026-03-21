import React, { useState } from 'react';
import { X, Moon, Sun, Download, Upload, Trash2 } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { supabase } from '../../services/supabase';
import { generatePDF } from '../../utils/reports';

export function SettingsModal({ isOpen, onClose }) {
  const { 
    exchangeRate, setExchangeRate, 
    pin, setPin, 
    userId, fetchAll, 
    transactions 
  } = useApp();
  
  const [localRate, setLocalRate] = useState(exchangeRate);
  const [theme, setTheme] = useState(localStorage.getItem('kassa_theme') || 'dark');

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

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('kassa_theme', newTheme);
    document.body.className = newTheme;
  };

  const handleExport = () => {
    const data = JSON.stringify(transactions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kassa_Backup_${new Date().getTime()}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (Array.isArray(data)) {
            const { error } = await supabase.from('transactions').insert(
              data.map(t => ({ ...t, id: undefined, user_id: userId }))
            );
            if (error) throw error;
            await fetchAll();
            alert("Ma'lumotlar muvaffaqiyatli yuklandi!");
          }
        } catch (err) {
          alert("Faylni o'qishda xato!");
        }
      };
      reader.readAsText(file);
    };
    input.click();
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

        <div className="si">
          <div>
            <div className="si-l">Mavzu</div>
            <div className="si-s">{theme === 'dark' ? 'Tungi' : 'Kunduzgi'}</div>
          </div>
          <button className="si-a" onClick={toggleTheme}>
            {theme === 'dark' ? <Moon size={14}/> : <Sun size={14}/>} Almashtirish
          </button>
        </div>

        <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }}></div>
        
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '12px' }}>
          Ma'lumotlar
        </div>

        <button className="dbtn" onClick={() => generatePDF(transactions)} style={{ background: 'rgba(168, 85, 247, 0.1)', color: 'var(--accent)' }}>
          <Download size={16}/> PDF Hisobot (Barchasi)
        </button>
        <button className="dbtn" onClick={handleExport}><Download size={16}/> JSON Eksport</button>
        <button className="dbtn" onClick={handleImport}><Upload size={16}/> JSON Import</button>
        <button className="dbtn red" onClick={handleReset}><Trash2 size={16}/> Barcha ma'lumotlarni o'chirish</button>
        
        <button className="bcl" style={{ marginTop: '16px', width: '100%' }} onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}
