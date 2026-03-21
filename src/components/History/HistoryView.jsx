import React, { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { TransactionItem } from './TransactionItem';
import { TransactionActionSheet } from '../Layout/TransactionActionSheet';

export function HistoryView() {
  const { filteredTransactions, deleteTransaction } = useApp();
  const [filter, setFilter] = useState('all');
  const [selectedTx, setSelectedTx] = useState(null);

  const filtered = filteredTransactions.filter(t => {
    if (filter === 'all') return true;
    return t.type === filter;
  });

  return (
    <div className="view active">
      <div className="view-hist-hdr">
        <div className="vh-top">
          <h2>Tarix</h2>
          <div className="hist-filter-row">
            <button className={`fp ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Barchasi</button>
            <button className={`fp ${filter === 'income' ? 'on' : ''}`} onClick={() => setFilter('income')}>Kirim</button>
            <button className={`fp ${filter === 'expense' ? 'on' : ''}`} onClick={() => setFilter('expense')}>Chiqim</button>
          </div>
        </div>
      </div>

      <div id="tx-list">
        {filtered.map(t => (
          <TransactionItem 
            key={t.id} 
            transaction={t} 
            onClick={() => setSelectedTx(t)} 
          />
        ))}
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '40px' }}>Ma'lumot topilmadi</p>
        )}
      </div>

      {selectedTx && (
        <TransactionActionSheet 
          transaction={selectedTx} 
          onClose={() => setSelectedTx(null)}
          onDelete={(id) => { deleteTransaction(id); setSelectedTx(null); }}
          onEdit={(tx) => { console.log('Edit', tx); setSelectedTx(null); }}
        />
      )}
    </div>
  );
}
