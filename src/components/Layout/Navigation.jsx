import React from 'react';
import { Home, History, Plus } from 'lucide-react';

export function Navigation({ activeView, onViewChange }) {
  return (
    <nav id="nav">
      <button 
        className={`nb ${activeView === 'dash' ? 'active' : ''}`} 
        onClick={() => onViewChange('dash')}
      >
        <Home />
        <span>Bosh</span>
      </button>

      <button className={`nb ${activeView === 'add' ? 'active' : ''}`} onClick={() => onViewChange('add')}>
        <div className="add-ring">
          <Plus />
        </div>
        <p className="add-btn-txt">Qo'shish</p>
      </button>
      
      <button 
        className={`nb ${activeView === 'hist' ? 'active' : ''}`} 
        onClick={() => onViewChange('hist')}
      >
        <History />
        <span>Tarix</span>
      </button>
    </nav>
  );
}
