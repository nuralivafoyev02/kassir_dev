import React, { useState } from 'react';
import { TrendingUp, TrendingDown, X, ChevronRight, Plus, DollarSign } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { supabase } from '../../services/supabase';

export function AddTransaction({ onSave }) {
  const { categories, userId, fetchAll, exchangeRate, haptic } = useApp();
  const [step, setStep] = useState('type'); // type, cat, input
  const [type, setType] = useState('expense');
  const [cat, setCat] = useState(null);
  const [amount, setAmount] = useState('');
  const [isUsd, setIsUsd] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!amount || isNaN(amount)) return;
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
      
      // Reset flow
      setStep('type');
      setType('expense');
      setCat(null);
      setAmount('');
      setIsUsd(false);
      
      await fetchAll();
      if (onSave) onSave();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view active" id="view-add">
      <div className="add-hdr">
        <h2>Yangi tranzaksiya</h2>
        <p>{step === 'type' ? 'Turini tanlang' : step === 'cat' ? 'Kategoriyani tanlang' : 'Summani kiriting'}</p>
      </div>

      <div id="chat-area">
        <div className="msg">Kiyim, tushlik yoki oylik... hammasini shu yerda qayd eting.</div>
        {cat && <div className="msg u">{cat.name} ({type === 'income' ? 'Kirim' : 'Chiqim'})</div>}
      </div>

      <div className="add-ctrl">
        {step === 'type' && (
          <div id="flow-start">
            <button className="fbtn i" onClick={() => { setType('income'); setStep('cat'); haptic?.('light'); }}>
              <TrendingUp /> Kirim
            </button>
            <button className="fbtn e" onClick={() => { setType('expense'); setStep('cat'); haptic?.('light'); }}>
              <TrendingDown /> Chiqim
            </button>
          </div>
        )}

        {step === 'cat' && (
          <div id="flow-cats" style={{ display: 'flex', flexDirection: 'column' }}>
             <div className="cats-hdr">
               <span>Kategoriyalar</span>
               <button className="add-cat-b"><Plus size={12}/> Yangi</button>
             </div>
             <div id="cat-grid">
               {(categories[type] || []).map(c => (
                 <div key={c.id} className="ci" onClick={() => { setCat(c); setStep('input'); haptic?.('light'); }}>
                   <span>{c.name}</span>
                 </div>
               ))}
               {!categories[type]?.length && <div style={{ color: 'var(--muted)', fontSize: '12px', padding: '10px' }}>Kategoriyalar topilmadi</div>}
             </div>
             <button className="cflow-cancel" onClick={() => setStep('type')}>Orqaga</button>
          </div>
        )}

        {step === 'input' && (
          <div id="flow-input" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="in-row">
              <button 
                className={`cur-btn ${isUsd ? 'on' : ''}`} 
                onClick={() => setIsUsd(!isUsd)}
              >
                {isUsd ? 'USD' : 'UZS'}
              </button>
              <input 
                id="amt-in" 
                type="number" 
                placeholder="0.00" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                inputMode="decimal"
              />
            </div>
            {isUsd && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', textAlign: 'right' }}>
                ≈ {Math.round(parseFloat(amount || 0) * exchangeRate).toLocaleString()} so'm
              </div>
            )}
            <div className="act-row">
              <button className="cancel-x" onClick={() => setStep('cat')}><X /></button>
              <button 
                className="save-b" 
                onClick={handleSave}
                disabled={loading || !amount}
              >
                {loading ? 'Saqlanmoqda...' : '💾 Saqlash'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
