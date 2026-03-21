import React from 'react';
import { useApp } from '../../store/AppContext';
import { fmt } from '../../utils/formatters';

export function CategoryPanel() {
  const { filteredTransactions, typeFilter } = useApp();

  // Aggregate by category
  const catMap = {};
  filteredTransactions.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
  });

  const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel">
      <div className="panel-ttl">Kategoriyalar</div>
      <div id="cat-table">
        {sortedCats.length > 0 ? (
          sortedCats.map(([name, val]) => (
            <div key={name} className="si">
              <div className="si-l">📁 {name}</div>
              <div className="si-val" style={{ fontWeight: 800, color: 'var(--text)' }}>
                {fmt(val)} so'm
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            Ma'lumot topilmadi
          </div>
        )}
      </div>
    </div>
  );
}
