import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useTelegram } from '../hooks/useTelegram';

const AppContext = createContext();

export function AppProvider({ children }) {
  const { user: tgUser, userId } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [userProfile, setUserProfile] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(12850);
  const [pin, setPin] = useState(localStorage.getItem('kassa_pin'));
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month
  const [typeFilter, setTypeFilter] = useState('all'); // all, income, expense
  
  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch User Profile (exchange rate, etc.)
      const { data: uData } = await supabase.from('users').select('*').eq('user_id', userId).single();
      if (uData) {
        setUserProfile(uData);
        setExchangeRate(uData.exchange_rate || 12850);
      } else {
        // Create user if not exists
        const { data: newUser } = await supabase.from('users').insert({ 
          user_id: userId, 
          full_name: tgUser?.first_name || 'User' 
        }).select().single();
        setUserProfile(newUser);
      }

      // 2. Fetch Categories
      const { data: cData } = await supabase.from('categories').select('*').eq('user_id', userId);
      const cats = { income: [], expense: [] };
      (cData || []).forEach(c => cats[c.type].push(c));
      setCategories(cats);

      // 3. Fetch Transactions
      const { data: tData } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false });
      setTransactions(tData || []);
    } catch (err) {
      console.error('[AppContext:fetchAll]', err);
    } finally {
      setLoading(false);
    }
  }, [userId, tgUser]);

  useEffect(() => {
    if (userId) fetchAll();
  }, [userId, fetchAll]);

  const filteredTransactions = transactions.filter(t => {
    let matchesType = typeFilter === 'all' || t.type === typeFilter;
    if (!matchesType) return false;

    if (dateFilter === 'all') return true;

    const tDate = new Date(t.date);
    const now = new Date();
    
    if (dateFilter === 'today') {
      return tDate.toDateString() === now.toDateString();
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return tDate >= weekAgo;
    }
    if (dateFilter === 'month') {
      return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const value = {
    loading,
    setLoading,
    transactions,
    filteredTransactions,
    setTransactions,
    categories,
    setCategories,
    userProfile,
    exchangeRate,
    setExchangeRate,
    pin,
    setPin,
    dateFilter,
    setDateFilter,
    typeFilter,
    setTypeFilter,
    fetchAll,
    deleteTransaction: async (id) => {
      try {
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) throw error;
        setTransactions(prev => prev.filter(t => t.id !== id));
      } catch (err) {
        console.error('[AppContext:deleteTransaction]', err);
      }
    },
    updateTransaction: async (id, updates) => {
      try {
        const { data, error } = await supabase.from('transactions').update(updates).eq('id', id).select().single();
        if (error) throw error;
        setTransactions(prev => prev.map(t => t.id === id ? data : t));
      } catch (err) {
        console.error('[AppContext:updateTransaction]', err);
      }
    },
    userId,
    tgUser
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
