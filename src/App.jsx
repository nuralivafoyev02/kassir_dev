import React, { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { Header } from './components/Layout/Header';
import { Navigation } from './components/Layout/Navigation';
import { Dashboard } from './components/Dashboard/Dashboard';
import { HistoryView } from './components/History/HistoryView';
import { AddTransaction } from './components/Dashboard/AddTransaction';
import { SettingsModal } from './components/Layout/SettingsModal';
import { PINScreen } from './components/Auth/PINScreen';
import { Loader } from './components/Shared/Loader';
import { ErrorBar } from './components/Shared/ErrorBar';
import './index.css';

function AppContent() {
  const { loading, pin, userId } = useApp();
  const [activeView, setActiveView] = useState('dash');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const errorBarRef = useRef();

  useEffect(() => {
    if (!pin) setIsUnlocked(true);
  }, [pin]);

  if (loading && !userId) {
    return <Loader loading={true} />;
  }

  if (!isUnlocked) {
    return <PINScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <div className="app-container">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />
      
      <main id="views">
        {activeView === 'dash' && <Dashboard />}
        {activeView === 'hist' && <HistoryView />}
        {activeView === 'add' && (
          <AddTransaction 
            onCancel={() => setActiveView('dash')} 
            onSave={() => setActiveView('dash')} 
          />
        )}
      </main>

      <Navigation activeView={activeView} onViewChange={setActiveView} />
      
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      <Loader loading={loading} />
      <ErrorBar ref={errorBarRef} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
