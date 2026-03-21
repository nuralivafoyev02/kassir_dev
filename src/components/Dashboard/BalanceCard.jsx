import React, { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { fmt } from '../../utils/formatters';

export function BalanceCard() {
  const { filteredTransactions, exchangeRate, loading } = useApp();
  const [showUsd, setShowUsd] = useState(false);

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
    
  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;

  const displayBalance = showUsd ? balance / exchangeRate : balance;
  const displayIncome = showUsd ? totalIncome / exchangeRate : totalIncome;
  const displayExpense = showUsd ? totalExpense / exchangeRate : totalExpense;

  return (
    <div className="balance-card" onClick={() => setShowUsd(!showUsd)}>
      <div className="bc-label">UMUMIY BALANS</div>
      <div className={`bc-amount ${loading ? 'loading' : ''}`}>
        {fmt(displayBalance)} {showUsd ? '$' : "so'm"}
      </div>
      
      <div className="bc-pills">
        <div className={`cpill ${!showUsd ? 'on' : ''}`}>UZS</div>
        <div className={`cpill ${showUsd ? 'on' : ''}`}>USD</div>
      </div>

      <div className="bc-row">
        <div className="bcs">
          <div className="bcs-ico i">
            <TrendingUp />
          </div>
          <div>
            <div className="bcs-lbl">Kirim</div>
            <div className="bcs-val i">+{fmt(displayIncome)}</div>
          </div>
        </div>
        
        <div className="bcs">
          <div className="bcs-ico e">
            <TrendingDown />
          </div>
          <div>
            <div className="bcs-lbl">Chiqim</div>
            <div className="bcs-val e">-{fmt(displayExpense)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
