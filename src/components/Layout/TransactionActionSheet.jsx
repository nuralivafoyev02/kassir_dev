import React from 'react';
import { Trash2, Edit3, X } from 'lucide-react';

export function TransactionActionSheet({ transaction, onClose, onDelete, onEdit }) {
  if (!transaction) return null;

  return (
    <div className="ov" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sh-hdl"></div>
        <div className="sh-ttl">Amal Ma'lumotlari</div>
        
        <div className="txi" style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.05)' }}>
          <div className="txi-l">
            <div className={`txi-ico ${transaction.type === 'income' ? 'i' : 'e'}`}>
              {transaction.type === 'income' ? '📈' : '📉'}
            </div>
            <div>
              <div className="txi-cat">{transaction.category}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {transaction.comment || 'Izoh yo\'q'}
              </div>
            </div>
          </div>
          <div className={`txi-amt ${transaction.type === 'income' ? 'i' : 'e'}`}>
            {transaction.type === 'income' ? '+' : '-'}{Number(transaction.amount).toLocaleString()}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="dbtn" onClick={() => onEdit(transaction)}>
            <Edit3 size={18} />
            Tahrirlash
          </button>
          
          <button className="dbtn red" onClick={() => onDelete(transaction.id)}>
            <Trash2 size={18} />
            O'chirish
          </button>

          <button className="dbtn" onClick={onClose} style={{ marginTop: '10px', background: 'transparent', border: '1px solid var(--border)' }}>
            <X size={18} />
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
