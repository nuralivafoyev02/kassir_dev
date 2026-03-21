import React from 'react';
import { BalanceCard } from './BalanceCard';
import { CategoryPanel } from './CategoryPanel';
import { CategoryChart } from './CategoryChart';
import { useApp } from '../../store/AppContext';
import { fmt } from '../../utils/formatters';

export function Dashboard() {
  const { dateFilter, setDateFilter, typeFilter, setTypeFilter, filteredTransactions } = useApp();

  const totalAmount = filteredTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
  const avgAmount = filteredTransactions.length ? totalAmount / filteredTransactions.length : 0;

  return (
    <div className="view active">
      <BalanceCard />

      <div className="filter-row">
        {['all', 'today', 'week', 'month'].map(f => (
          <div 
            key={f}
            className={`fp ${dateFilter === f ? 'on' : ''}`} 
            onClick={() => setDateFilter(f)}
          >
            {f === 'all' ? 'Hammasi' : f === 'today' ? 'Bugun' : f === 'week' ? 'Hafta' : 'Oy'}
          </div>
        ))}
      </div>

      <div className="type-cards">
        <div 
          className={`tc ${typeFilter === 'income' ? 'active' : ''}`} 
          onClick={() => setTypeFilter(typeFilter === 'income' ? 'all' : 'income')}
        >
          <div className="tc-ico">📈</div>
          <div>
            <div className="tc-ttl">Kirimlar</div>
            <div className="tc-sub">Filterlash</div>
          </div>
        </div>
        <div 
          className={`tc ${typeFilter === 'expense' ? 'active' : ''}`} 
          onClick={() => setTypeFilter(typeFilter === 'expense' ? 'all' : 'expense')}
        >
          <div className="tc-ico">📉</div>
          <div>
            <div className="tc-ttl">Chiqimlar</div>
            <div className="tc-sub">Filterlash</div>
          </div>
        </div>
      </div>

      <CategoryChart transactions={filteredTransactions} />
      <CategoryPanel />
      
      <div className="panel" style={{ marginTop: '10px' }}>
        <div className="panel-ttl">Statistika Trendi</div>
        <div className="type-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="tc" style={{ background: 'rgba(255,255,255,0.03)', padding: '15px' }}>
            <div>
              <div className="tc-ttl">{filteredTransactions.length}</div>
              <div className="tc-sub">Amallar soni</div>
            </div>
          </div>
          <div className="tc" style={{ background: 'rgba(255,255,255,0.03)', padding: '15px' }}>
            <div>
              <div className="tc-ttl">{fmt(avgAmount)}</div>
              <div className="tc-sub">O'rtacha summa</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
