import React from 'react';
import { BalanceCard } from './BalanceCard';
import { CategoryPanel } from './CategoryPanel';
import { useApp } from '../../store/AppContext';

export function Dashboard() {
  const { dateFilter, setDateFilter, typeFilter, setTypeFilter } = useApp();

  return (
    <div className="view active">
      <BalanceCard />

      <div className="filter-row">
        <div 
          className={`fp ${dateFilter === 'all' ? 'on' : ''}`} 
          onClick={() => setDateFilter('all')}
        >Hammasi</div>
        <div 
          className={`fp ${dateFilter === 'today' ? 'on' : ''}`} 
          onClick={() => setDateFilter('today')}
        >Bugun</div>
        <div 
          className={`fp ${dateFilter === 'week' ? 'on' : ''}`} 
          onClick={() => setDateFilter('week')}
        >Hafta</div>
        <div 
          className={`fp ${dateFilter === 'month' ? 'on' : ''}`} 
          onClick={() => setDateFilter('month')}
        >Oy</div>
      </div>

      <div className="type-cards">
        <div 
          className={`tc ${typeFilter === 'income' ? 'active' : ''}`} 
          onClick={() => setTypeFilter(typeFilter === 'income' ? 'all' : 'income')}
        >
          <div className="tc-ico i">📈</div>
          <div>
            <div className="tc-ttl">Kirimlar</div>
            <div className="tc-sub i">{typeFilter === 'income' ? 'Filtrlangan' : 'Filtrlash'}</div>
          </div>
        </div>
        <div 
          className={`tc ${typeFilter === 'expense' ? 'active' : ''}`} 
          onClick={() => setTypeFilter(typeFilter === 'expense' ? 'all' : 'expense')}
        >
          <div className="tc-ico e">📉</div>
          <div>
            <div className="tc-ttl">Chiqimlar</div>
            <div className="tc-sub e">{typeFilter === 'expense' ? 'Filtrlangan' : 'Filtrlash'}</div>
          </div>
        </div>
      </div>

      <CategoryPanel />
    </div>
  );
}
