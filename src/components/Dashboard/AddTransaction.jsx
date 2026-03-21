import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { supabase } from '../../services/supabase';
import { fmt } from '../../utils/formatters';

export function AddTransaction({ onSave, onCancel }) {
  const { categories, userId, fetchAll, exchangeRate, haptic } = useApp();
  const [type, setType] = useState('expense');
  const [cat, setCat] = useState(null);
  const [amount, setAmount] = useState('');
  const [isUsd, setIsUsd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-select first category if none selected
  useEffect(() => {
    if (!cat && categories[type]?.[0]) {
      setCat(categories[type][0]);
    }
  }, [type, categories, cat]);

  const handleSave = async () => {
    if (!amount || isNaN(amount) || !cat) return;
    setLoading(true);
    haptic?.('medium');
    
    try {
      let finalAmount = parseFloat(amount);
      let categoryName = cat.name;

      if (isUsd) {
        finalAmount = Math.round(finalAmount * exchangeRate);
        categoryName = `${cat.name} ($${amount})`;
      }

      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        amount: finalAmount,
        category: categoryName,
        type: type,
        date: new Date().toISOString()
      });

      if (error) throw error;
      
      haptic?.('success');
      await fetchAll();
      if (onSave) onSave();
    } catch (e) {
      console.error(e);
      alert('Saqlashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view active" id="view-add" style={{ paddingBottom: '100px' }}>
      <div className="add-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>Amal qo'shish</h2>
          <p>Mablag'lar harakatini kiriting</p>
        </div>
        <button className="header-btn" onClick={onCancel}><X size={20}/></button>
      </div>

      {/* Type Toggle */}
      <div className="filter-row" style={{ marginBottom: '25px' }}>
        <div 
          className={`fp ${type === 'income' ? 'on' : ''}`} 
          style={{ flex: 1, textAlign: 'center' }}
          onClick={() => { setType('income'); setCat(null); haptic?.('light'); }}
        >📈 Kirim</div>
        <div 
          className={`fp ${type === 'expense' ? 'on' : ''}`} 
          style={{ flex: 1, textAlign: 'center' }}
          onClick={() => { setType('expense'); setCat(null); haptic?.('light'); }}
        >📉 Chiqim</div>
      </div>

      {/* Amount Input */}
      <div className="panel" style={{ padding: '25px', marginBottom: '25px', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', fontWeight: 600, letterSpacing: '1px' }}>
          SUMMANI KIRITING
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
          <input 
            type="number" 
            placeholder="0"
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: '42px', 
              fontWeight: 800, 
              color: 'var(--text)', 
              textAlign: 'center',
              width: '200px',
              outline: 'none'
            }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          <button 
            className={`cur-btn ${isUsd ? 'on' : ''}`} 
            onClick={() => { setIsUsd(!isUsd); haptic?.('light'); }}
            style={{ padding: '8px 15px', borderRadius: '12px' }}
          >
            {isUsd ? 'USD' : 'UZS'}
          </button>
        </div>
        {isUsd && (
          <div style={{ marginTop: '10px', color: 'var(--accent)', fontWeight: 600 }}>
            ≈ {fmt(Math.round(parseFloat(amount || 0) * exchangeRate))} so'm
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="panel-ttl">Kategoriyani tanlang</div>
      <div className="cat-grid-form" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '12px',
        marginBottom: '30px'
      }}>
        {(categories[type] || []).map(c => (
          <div 
            key={c.id} 
            className={`ci ${cat?.id === c.id ? 'active' : ''}`} 
            onClick={() => { setCat(c); haptic?.('light'); }}
            style={{
              padding: '15px 10px',
              borderRadius: '16px',
              border: cat?.id === c.id ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: cat?.id === c.id ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.03)',
              textAlign: 'center',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: cat?.id === c.id ? 'var(--accent)' : 'var(--text)' }}>
              {c.name}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed Save Button */}
      <div style={{ 
        position: 'fixed', 
        bottom: '80px', 
        left: '20px', 
        right: '20px',
        zIndex: 100
      }}>
        <button 
          className="save-b" 
          onClick={handleSave} 
          disabled={loading || !amount}
          style={{ width: '100%', padding: '18px', borderRadius: '18px', boxShadow: '0 10px 30px rgba(168, 85, 247, 0.3)' }}
        >
          {loading ? 'Saqlanmoqda...' : <><Check size={20} style={{ marginRight: '8px' }}/> SAQLASH</>}
        </button>
      </div>
    </div>
  );
}
