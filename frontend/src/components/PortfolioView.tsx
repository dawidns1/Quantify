import { useState, useEffect } from 'react';
import { 
  Briefcase, 
  History, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Globe, 
  Coins, 
  PieChart, 
  X, 
  Info,
  AlertCircle,
  Eye,
  Share2,
  Shield,
  Users,
  Lock
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface PortfolioViewProps {
  apiBaseUrl: string;
}

interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avg_cost_local: number;
  current_price_local: number;
  currency: string;
  fx_rate: number;
  cost_basis_base: number;
  current_value_base: number;
  gain_base: number;
  gain_percent: number;
}

interface Summary {
  total_cost_base: number;
  total_value_base: number;
  total_gain_base: number;
  total_gain_percent: number;
  base_currency: string;
}

interface Transaction {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  date: string;
  shares: number;
  price: number;
  currency: string;
  fees: number;
  account: string;
}

export function PortfolioView({ apiBaseUrl }: PortfolioViewProps) {
  const { user } = useAuth();
  const [subTab, setSubTabState] = useState<'overview' | 'ledger'>(() => {
    const cached = localStorage.getItem('portfolio_sub_tab');
    return (cached === 'overview' || cached === 'ledger') ? cached : 'overview';
  });

  const setSubTab = (tab: 'overview' | 'ledger') => {
    setSubTabState(tab);
    localStorage.setItem('portfolio_sub_tab', tab);
  };

  const [baseCurrency, setBaseCurrencyState] = useState<'PLN' | 'USD' | 'EUR'>(() => {
    const cached = localStorage.getItem('portfolio_base_currency');
    return (cached === 'PLN' || cached === 'USD' || cached === 'EUR') ? cached : 'PLN';
  });

  const setBaseCurrency = (currency: 'PLN' | 'USD' | 'EUR') => {
    setBaseCurrencyState(currency);
    localStorage.setItem('portfolio_base_currency', currency);
  };
  
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total_cost_base: 0,
    total_value_base: 0,
    total_gain_base: 0,
    total_gain_percent: 0,
    base_currency: 'PLN'
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [formSymbol, setFormSymbol] = useState('');
  const [formType, setFormType] = useState<'BUY' | 'SELL'>('BUY');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formShares, setFormShares] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState<'PLN' | 'USD' | 'EUR'>('USD');
  const [formFees, setFormFees] = useState('');
  const [formAccount, setFormAccount] = useState('Default');

  // Price Input Mode Toggle
  const [priceInputMode, setPriceInputMode] = useState<'per_share' | 'total'>('per_share');

  // Autocomplete suggestions states
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filtering states
  const [selectedAccount, setSelectedAccountState] = useState<string>(() => {
    return localStorage.getItem('portfolio_selected_account') || 'All';
  });

  const setSelectedAccount = (account: string) => {
    setSelectedAccountState(account);
    localStorage.setItem('portfolio_selected_account', account);
  };

  // Customizable Columns states
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const cached = localStorage.getItem('portfolio_visible_columns');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing visible columns from localStorage', e);
      }
    }
    return ['name', 'shares', 'avg_cost', 'price', 'cost'];
  });

  const toggleColumn = (id: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem('portfolio_visible_columns', JSON.stringify(next));
      return next;
    });
  };

  // Portfolios state (multi-device collaborative lists)
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [activePortfolioRole, setActivePortfolioRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  // Sharing controls state
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Load portfolios from Supabase
  const loadPortfolios = async () => {
    if (!user) return;
    setLoadingPortfolios(true);
    try {
      const { data: membersList, error } = await supabase
        .from('portfolio_members')
        .select(`
          portfolio_id,
          role,
          portfolios (
            id,
            name
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      if (!membersList || membersList.length === 0) {
        // Create default portfolio if none exists
        const { data: newPortfolio, error: createError } = await supabase
          .from('portfolios')
          .insert({ name: 'My Portfolio' })
          .select()
          .single();

        if (createError) throw createError;

        const { error: memberError } = await supabase
          .from('portfolio_members')
          .insert({
            portfolio_id: newPortfolio.id,
            user_id: user.id,
            role: 'owner'
          });

        if (memberError) throw memberError;

        await loadPortfolios();
        return;
      }

      const formatted = membersList.map((m: any) => ({
        id: m.portfolio_id,
        name: m.portfolios?.name || 'Unnamed Portfolio',
        role: m.role
      }));

      setPortfolios(formatted);

      const cachedId = localStorage.getItem('portfolio_active_id');
      const found = formatted.find(p => p.id === cachedId);
      if (found) {
        setActivePortfolioId(found.id);
        setActivePortfolioRole(found.role);
      } else {
        setActivePortfolioId(formatted[0].id);
        setActivePortfolioRole(formatted[0].role);
        localStorage.setItem('portfolio_active_id', formatted[0].id);
      }
    } catch (err) {
      console.error('Error loading portfolios:', err);
    } finally {
      setLoadingPortfolios(false);
    }
  };

  useEffect(() => {
    loadPortfolios();
  }, [user]);

  // Load members of active portfolio
  const loadMembers = async () => {
    if (!activePortfolioId) return;
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('portfolio_members')
        .select(`
          user_id,
          role,
          profiles (
            email
          )
        `)
        .eq('portfolio_id', activePortfolioId);

      if (error) throw error;
      
      const formatted = data.map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        email: m.profiles?.email || 'Unknown user'
      }));

      setMembers(formatted);
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (activePortfolioId) {
      loadMembers();
    }
  }, [activePortfolioId]);

  // Handle invitation submission
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Please enter an email address.");
      return;
    }

    try {
      // Find user profile by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (profileError || !profile) {
        setInviteError("No user found with this email. They must log in to Quantify at least once first.");
        return;
      }

      // Check if user is already a member
      const isMember = members.some(m => m.user_id === profile.id);
      if (isMember) {
        setInviteError("This user is already a member of this portfolio.");
        return;
      }

      // Insert member
      const { error: insertError } = await supabase
        .from('portfolio_members')
        .insert({
          portfolio_id: activePortfolioId,
          user_id: profile.id,
          role: inviteRole
        });

      if (insertError) throw insertError;

      setInviteSuccess(`Successfully shared with ${email}!`);
      setInviteEmail('');
      loadMembers();
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setInviteError(err.message || "An error occurred.");
    }
  };

  // Remove member from portfolio
  const handleRemoveMember = async (userId: string) => {
    if (userId === user?.id) {
      alert("You cannot remove yourself from your own portfolio.");
      return;
    }
    if (!window.confirm("Are you sure you want to remove this member?")) return;

    try {
      const { error } = await supabase
        .from('portfolio_members')
        .delete()
        .eq('portfolio_id', activePortfolioId)
        .eq('user_id', userId);

      if (error) throw error;
      loadMembers();
    } catch (err: any) {
      console.error('Error removing member:', err);
      alert('Failed to remove member: ' + err.message);
    }
  };

  // Change member role
  const handleChangeMemberRole = async (userId: string, newRole: 'editor' | 'viewer') => {
    try {
      const { error } = await supabase
        .from('portfolio_members')
        .update({ role: newRole })
        .eq('portfolio_id', activePortfolioId)
        .eq('user_id', userId);

      if (error) throw error;
      loadMembers();
    } catch (err: any) {
      console.error('Error updating member role:', err);
      alert('Failed to update role: ' + err.message);
    }
  };

  // Reset modal form states on close
  useEffect(() => {
    if (!showAddModal) {
      setFormSymbol('');
      setFormShares('');
      setFormPrice('');
      setFormFees('');
      setFormAccount('Default');
      setFormType('BUY');
      setFormDate(new Date().toISOString().split('T')[0]);
      setPriceInputMode('per_share');
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [showAddModal]);

  // Debounced search for suggestions
  useEffect(() => {
    if (formSymbol.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounce = setTimeout(() => {
      fetch(`${apiBaseUrl}/api/portfolio/search?q=${encodeURIComponent(formSymbol)}`)
        .then((res) => {
          if (!res.ok) throw new Error('Search failed');
          return res.json();
        })
        .then((data) => {
          if (formSymbol.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
          }
          setSuggestions(data || []);
          setShowSuggestions(data && data.length > 0);
        })
        .catch((err) => {
          console.error('Error fetching suggestions:', err);
        });
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [formSymbol, apiBaseUrl]);

  // Handle clicking a search suggestion
  const handleSelectSuggestion = (s: any) => {
    setFormSymbol(s.symbol);
    setShowSuggestions(false);
    
    const sym = s.symbol.toUpperCase().trim();
    if (sym.endsWith('.WA') || s.exchange === 'WSE') {
      setFormCurrency('PLN');
    } else if (
      sym.endsWith('.DE') || 
      sym.endsWith('.F') || 
      sym.endsWith('.SG') || 
      ['FRA', 'GER', 'DUS', 'MUN', 'XETRA', 'STU'].includes(s.exchange)
    ) {
      setFormCurrency('EUR');
    } else {
      setFormCurrency('USD');
    }
  };

  // Fetch holdings (POST transactions to backend calculator in-memory)
  const fetchHoldings = async (curr: 'PLN' | 'USD' | 'EUR', accountFilter: string = selectedAccount) => {
    if (!activePortfolioId) return;
    setLoadingHoldings(true);
    try {
      const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('portfolio_id', activePortfolioId)
        .order('date', { ascending: true });

      if (txError) throw txError;

      if (!txs || txs.length === 0) {
        setHoldings([]);
        setSummary({
          total_cost_base: 0,
          total_value_base: 0,
          total_gain_base: 0,
          total_gain_percent: 0,
          base_currency: curr
        });
        setLoadingHoldings(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/api/portfolio/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_currency: curr,
          account: accountFilter,
          transactions: txs
        })
      });

      if (!response.ok) throw new Error('Failed to calculate holdings');
      const data = await response.json();
      setHoldings(data.holdings || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Error fetching holdings:', err);
    } finally {
      setLoadingHoldings(false);
    }
  };

  // Fetch transactions from Supabase
  const fetchTransactions = async () => {
    if (!activePortfolioId) return;
    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('portfolio_id', activePortfolioId)
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    if (activePortfolioId) {
      fetchHoldings(baseCurrency, selectedAccount);
      fetchTransactions();
    }
  }, [baseCurrency, selectedAccount, activePortfolioId]);

  // Handle ticker change to auto-set currency defaults
  const handleTickerChange = (val: string) => {
    setFormSymbol(val);
    const upperVal = val.toUpperCase().trim();
    if (upperVal.endsWith('.WA')) {
      setFormCurrency('PLN');
    } else if (upperVal.endsWith('.DE')) {
      setFormCurrency('EUR');
    } else {
      setFormCurrency('USD');
    }
  };

  // Handle quick actions from holdings table
  const handleQuickAction = (symbol: string, type: 'BUY' | 'SELL') => {
    if (activePortfolioRole === 'viewer') return;
    setShowAddModal(true);
    setFormSymbol(symbol);
    setFormType(type);
    
    const sym = symbol.toUpperCase().trim();
    if (sym.endsWith('.WA')) {
      setFormCurrency('PLN');
    } else if (sym.endsWith('.DE') || sym.endsWith('.F')) {
      setFormCurrency('EUR');
    } else {
      setFormCurrency('USD');
    }
  };

  // Handle delete transaction
  const handleDeleteTransaction = async (id: string) => {
    if (activePortfolioRole === 'viewer') return;
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchHoldings(baseCurrency, selectedAccount);
      fetchTransactions();
    } catch (err: any) {
      console.error('Error deleting transaction:', err);
      alert('Failed to delete transaction: ' + err.message);
    }
  };

  // Handle form submission
  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePortfolioRole === 'viewer') return;
    setFormError(null);
    
    const symbol = formSymbol.toUpperCase().trim();
    const shares = parseFloat(formShares);
    const priceInput = parseFloat(formPrice);
    const fees = parseFloat(formFees) || 0;

    if (!symbol) {
      setFormError('Please enter a stock ticker symbol.');
      return;
    }
    if (isNaN(shares) || shares <= 0) {
      setFormError('Shares must be a positive number.');
      return;
    }
    if (isNaN(priceInput) || priceInput < 0) {
      setFormError('Price cannot be negative.');
      return;
    }
    if (isNaN(fees) || fees < 0) {
      setFormError('Fees cannot be negative.');
      return;
    }
    if (!formDate) {
      setFormError('Please select a date.');
      return;
    }

    const price = priceInputMode === 'total' ? (priceInput / shares) : priceInput;
    setSubmitting(true);

    const payload = {
      portfolio_id: activePortfolioId,
      symbol,
      type: formType,
      date: formDate,
      shares,
      price,
      currency: formCurrency,
      fees,
      account: formAccount || 'Default'
    };

    try {
      const { error } = await supabase
        .from('transactions')
        .insert(payload);
      
      if (error) throw error;
      setShowAddModal(false);
      fetchHoldings(baseCurrency, selectedAccount);
      fetchTransactions();
    } catch (err: any) {
      console.error('Error adding transaction:', err);
      setFormError(err.message || 'Error occurred while saving transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  // Client-side calculations for allocations
  const calculateAllocations = () => {
    const totalValue = summary.total_value_base || 1; // avoid division by zero
    
    const assetAllocMap: { [key: string]: number } = {};
    const currencyAllocMap: { [key: string]: number } = {};
    const countryAllocMap: { [key: string]: number } = {};

    holdings.forEach((h) => {
      const val = h.current_value_base;
      
      // 1. Assets
      assetAllocMap[h.symbol] = (assetAllocMap[h.symbol] || 0) + val;
      
      // 2. Currencies
      currencyAllocMap[h.currency] = (currencyAllocMap[h.currency] || 0) + val;
      
      // 3. Country / Market
      let country = 'USA';
      if (h.symbol.endsWith('.WA')) country = 'Poland';
      else if (h.symbol.endsWith('.DE')) country = 'Germany';
      
      countryAllocMap[country] = (countryAllocMap[country] || 0) + val;
    });

    const assets = Object.entries(assetAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    const currencies = Object.entries(currencyAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    const countries = Object.entries(countryAllocMap)
      .map(([name, val]) => ({ name, percentage: (val / totalValue) * 100, val }))
      .sort((a, b) => b.percentage - a.percentage);

    return { assets, currencies, countries };
  };

  const { assets, currencies, countries } = calculateAllocations();

  // Extract unique accounts dynamically
  const uniqueAccounts = Array.from(
    new Set(transactions.map((tx) => tx.account || 'Default'))
  ).sort();

  // Currency Formatter
  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const isProfit = summary.total_gain_base >= 0;

  return (
    <div className="portfolio-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Portfolio Header Switcher Bar */}
      <div className="portfolio-header-bar glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Sub-tabs buttons */}
        <div className="sub-tabs-container" style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`sub-tab-btn ${subTab === 'overview' ? 'active' : ''}`}
            onClick={() => setSubTab('overview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: subTab === 'overview' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              color: subTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: subTab === 'overview' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Briefcase size={16} />
            Portfolio Overview
          </button>
          <button 
            className={`sub-tab-btn ${subTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setSubTab('ledger')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: subTab === 'ledger' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              color: subTab === 'ledger' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: subTab === 'ledger' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            <History size={16} />
            Transaction Ledger ({transactions.length})
          </button>
        </div>

        {/* Base Currency, Portfolio & Account Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          
          {/* Portfolio Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Portfolio:</span>
            <select
              className="input-field"
              style={{
                padding: '0.3rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '6px',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.03)',
                borderColor: 'var(--panel-border)',
                outline: 'none',
                height: 'auto'
              }}
              value={activePortfolioId || ''}
              onChange={(e) => {
                const pId = e.target.value;
                const found = portfolios.find(p => p.id === pId);
                if (found) {
                  setActivePortfolioId(pId);
                  setActivePortfolioRole(found.role);
                  localStorage.setItem('portfolio_active_id', pId);
                }
              }}
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>

          {/* Share Portfolio Button (Only if owner) */}
          {activePortfolioRole === 'owner' && (
            <button
              className="glow-btn"
              onClick={() => {
                setInviteSuccess(null);
                setInviteError(null);
                setInviteEmail('');
                setShowShareModal(true);
                loadMembers();
              }}
              style={{
                padding: '0.3rem 0.65rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                boxShadow: 'none',
                background: 'rgba(59, 130, 246, 0.06)',
                color: 'var(--color-primary)',
                borderColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              <Share2 size={12} /> Share
            </button>
          )}

          {/* Account Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Account:</span>
            <select
              className="input-field"
              style={{
                padding: '0.3rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '6px',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.03)',
                borderColor: 'var(--panel-border)',
                outline: 'none',
                height: 'auto'
              }}
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="All">All Accounts</option>
              {uniqueAccounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Base Currency:</span>
            <div className="currency-selector-pills" style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
              {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setBaseCurrency(curr)}
                  style={{
                    background: baseCurrency === curr ? 'var(--color-primary)' : 'transparent',
                    color: baseCurrency === curr ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>

          {activePortfolioRole !== 'viewer' && (
            <button 
              className="glow-btn"
              onClick={() => setShowAddModal(true)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '8px' }}
            >
              <Plus size={16} /> Add Transaction
            </button>
          )}
        </div>
      </div>

      {/* Loading state indicator */}
      {(loadingPortfolios || loadingHoldings || loadingTransactions) && (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div className="pulse" style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
            {loadingPortfolios ? 'Connecting to cloud database...' : 'Refreshing portfolio metrics...'}
          </div>
        </div>
      )}

      {/* Main tab sections */}
      {!loadingPortfolios && !loadingHoldings && !loadingTransactions && (
        <>
          {/* Viewer Lock Warning Banner */}
          {activePortfolioRole === 'viewer' && (
            <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '8px', fontSize: '0.85rem' }}>
              <Lock size={16} style={{ flexShrink: 0 }} />
              <span>You have <strong>Read-Only (Viewer)</strong> access to this portfolio. Adding, editing, or deleting transactions is disabled.</span>
            </div>
          )}
          {subTab === 'overview' ? (
            <>
              {/* Summary Dashboard Row */}
              <div className="portfolio-summary-row">
                {/* NAV Card */}
                <div className="glass-panel portfolio-card" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                  <div className="metric-title">Net Asset Value (NAV)</div>
                  <div className="metric-value">{formatCurrency(summary.total_value_base, summary.base_currency)}</div>
                  <div className="metric-subtext">Current value at live exchange rates</div>
                </div>

                {/* Cost Basis Card */}
                <div className="glass-panel portfolio-card" style={{ borderLeft: '3px solid var(--text-muted)' }}>
                  <div className="metric-title">Total Cost Basis</div>
                  <div className="metric-value">{formatCurrency(summary.total_cost_base, summary.base_currency)}</div>
                  <div className="metric-subtext">Total invested capital (incl. fees)</div>
                </div>

                {/* Total Return Card */}
                <div className="glass-panel portfolio-card" style={{ 
                  borderLeft: isProfit ? '3px solid var(--color-green)' : '3px solid var(--color-red)' 
                }}>
                  <div className="metric-title">Total Return</div>
                  <div className={`metric-value ${isProfit ? 'text-green' : 'text-red'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {isProfit ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    {formatCurrency(summary.total_gain_base, summary.base_currency)}
                  </div>
                  <div className={`metric-change ${isProfit ? 'badge-green' : 'badge-red'}`} style={{ display: 'inline-block', marginTop: '0.25rem' }}>
                    {isProfit ? '+' : ''}{summary.total_gain_percent.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Main Content Layout */}
              <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 className="portfolio-section-title" style={{ margin: 0 }}>Holding Asset Summary</h3>
                    <button 
                      className="glow-btn"
                      style={{ 
                        background: showColumnPicker ? 'var(--color-primary)' : 'rgba(255,255,255,0.03)', 
                        color: 'var(--text-primary)',
                        padding: '0.45rem 0.85rem', fontSize: '0.8rem',
                        border: '1px dashed var(--panel-border)',
                        boxShadow: 'none',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                      onClick={() => setShowColumnPicker(!showColumnPicker)}
                    >
                      <Eye size={14} /> Customize Columns
                    </button>
                  </div>

                  {showColumnPicker && (
                    <div style={{ 
                      background: 'rgba(0,0,0,0.2)', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      border: '1px solid var(--panel-border)', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.5rem' 
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.4rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Configure Portfolio Columns</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ticker, Price, Current, Gain/Loss & Actions are core</span>
                      </div>
                      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                        {[
                          { id: 'name', label: 'Company Name' },
                          { id: 'shares', label: 'Shares Owned' },
                          { id: 'avg_cost', label: 'Average Cost' },
                          { id: 'price', label: 'Local Price' },
                          { id: 'cost', label: 'Cost Basis' }
                        ].map((col) => {
                          const isChecked = visibleColumns.includes(col.id);
                          return (
                            <label 
                              key={col.id} 
                              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}
                            >
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleColumn(col.id)}
                                style={{ accentColor: 'var(--color-primary)' }}
                              />
                              {col.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {holdings.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Briefcase size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
                      <p>No holdings found in your portfolio.</p>
                      <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Click "Add Transaction" above to register purchases.</p>
                    </div>
                  ) : (
                    <div className="table-wrapper">
                      <table className="screener-table">
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            {visibleColumns.includes('name') && <th>Company Name</th>}
                            {visibleColumns.includes('shares') && <th style={{ textAlign: 'right' }}>Shares</th>}
                            {visibleColumns.includes('avg_cost') && <th style={{ textAlign: 'right' }}>Avg Cost</th>}
                            {visibleColumns.includes('price') && <th style={{ textAlign: 'right' }}>Price</th>}
                            {visibleColumns.includes('cost') && <th style={{ textAlign: 'right' }}>Cost ({summary.base_currency})</th>}
                            <th style={{ textAlign: 'right' }}>Current ({summary.base_currency})</th>
                            <th style={{ textAlign: 'right' }}>Gain/Loss</th>
                            <th style={{ textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdings.map((h) => {
                            const valIsProfit = h.gain_base >= 0;
                            return (
                              <tr key={h.symbol} className="interactive-row">
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {h.symbol}
                                  <span style={{ 
                                    fontSize: '0.65rem', 
                                    color: 'var(--text-muted)', 
                                    background: 'rgba(255, 255, 255, 0.04)', 
                                    padding: '1px 4px', 
                                    borderRadius: '4px',
                                    marginLeft: '6px'
                                  }}>
                                    {h.currency}
                                  </span>
                                </td>
                                {visibleColumns.includes('name') && (
                                  <td style={{ color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name}>
                                    {h.name}
                                  </td>
                                )}
                                {visibleColumns.includes('shares') && (
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                    {h.shares}
                                  </td>
                                )}
                                {visibleColumns.includes('avg_cost') && (
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                                    {formatCurrency(h.avg_cost_local, h.currency)}
                                  </td>
                                )}
                                {visibleColumns.includes('price') && (
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                    {formatCurrency(h.current_price_local, h.currency)}
                                  </td>
                                )}
                                {visibleColumns.includes('cost') && (
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                                    {formatCurrency(h.cost_basis_base, summary.base_currency)}
                                  </td>
                                )}
                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                  {formatCurrency(h.current_value_base, summary.base_currency)}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                  <div className={valIsProfit ? 'text-green' : 'text-red'} style={{ fontWeight: 600 }}>
                                    {valIsProfit ? '+' : ''}{formatCurrency(h.gain_base, summary.base_currency)}
                                  </div>
                                  <div style={{ fontSize: '0.75rem' }} className={valIsProfit ? 'text-green' : 'text-red'}>
                                    {valIsProfit ? '+' : ''}{h.gain_percent.toFixed(2)}%
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {activePortfolioRole === 'viewer' ? (
                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                  ) : (
                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                      <button 
                                        className="holding-action-btn buy"
                                        onClick={() => handleQuickAction(h.symbol, 'BUY')}
                                        title={`Buy more ${h.symbol}`}
                                      >
                                        +
                                      </button>
                                      <button 
                                        className="holding-action-btn sell"
                                        onClick={() => handleQuickAction(h.symbol, 'SELL')}
                                        title={`Sell ${h.symbol}`}
                                      >
                                        -
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Right Side: Allocation Panels */}
                <div className="glass-panel allocation-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <h3 className="portfolio-section-title">Portfolio Allocation</h3>
                  
                  {holdings.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      <PieChart size={32} style={{ strokeWidth: 1, marginBottom: '0.5rem', opacity: 0.5 }} />
                      <p>Enter data to calculate asset splits.</p>
                    </div>
                  ) : (
                    <>
                      {/* Asset Tickers Allocation */}
                      <div>
                        <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <PieChart size={14} /> By Asset Ticker
                        </h4>
                        <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
                          {assets.slice(0, 5).map((item) => (
                            <div key={item.name} className="allocation-item">
                              <div className="allocation-label">
                                <span>{item.name}</span>
                                <span className="percentage-val">{item.percentage.toFixed(1)}%</span>
                              </div>
                              <div className="allocation-track">
                                <div 
                                  className="allocation-fill asset-color" 
                                  style={{ width: `${item.percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                          {assets.length > 5 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                              + {assets.length - 5} more tickers
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Currency Allocation */}
                      <div>
                        <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Coins size={14} /> By Currency
                        </h4>
                        <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
                          {currencies.map((item) => (
                            <div key={item.name} className="allocation-item">
                              <div className="allocation-label">
                                <span>{item.name}</span>
                                <span className="percentage-val">{item.percentage.toFixed(1)}%</span>
                              </div>
                              <div className="allocation-track">
                                <div 
                                  className="allocation-fill currency-color" 
                                  style={{ 
                                    width: `${item.percentage}%`,
                                    background: item.name === 'USD' ? 'hsl(217, 91%, 60%)' : item.name === 'EUR' ? 'hsl(263, 90%, 65%)' : 'hsl(142, 70%, 45%)'
                                  }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Geographic Allocation */}
                      <div>
                        <h4 className="allocation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Globe size={14} /> By Market / Exchange
                        </h4>
                        <div className="allocation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
                          {countries.map((item) => (
                            <div key={item.name} className="allocation-item">
                              <div className="allocation-label">
                                <span>{item.name}</span>
                                <span className="percentage-val">{item.percentage.toFixed(1)}%</span>
                              </div>
                              <div className="allocation-track">
                                <div 
                                  className="allocation-fill country-color" 
                                  style={{ 
                                    width: `${item.percentage}%`,
                                    background: item.name === 'USA' ? 'hsl(217, 91%, 60%)' : item.name === 'Poland' ? 'hsl(142, 70%, 45%)' : 'hsl(263, 90%, 65%)'
                                  }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* LEDGER VIEW: TRANSACTION HISTORY */
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="portfolio-section-title">Recorded Transactions Ledger</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Total operations recorded: {transactions.length}
                </span>
              </div>

              {transactions.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <History size={48} style={{ strokeWidth: 1, marginBottom: '1rem', opacity: 0.5 }} />
                  <p>No transaction history recorded.</p>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Use "Add Transaction" to input buys/sells.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="screener-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Symbol</th>
                        <th>Account</th>
                        <th style={{ textAlign: 'right' }}>Shares</th>
                        <th style={{ textAlign: 'right' }}>Price (Local)</th>
                        <th style={{ textAlign: 'right' }}>Fees (Local)</th>
                        <th style={{ textAlign: 'right' }}>Total (Local)</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => {
                        const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
                        return (
                          <tr key={tx.id} className="interactive-row">
                            <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {tx.date}
                            </td>
                            <td>
                              <span className={`ledger-type-badge ${tx.type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                {tx.type}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {tx.symbol}
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {tx.account || 'Default'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {tx.shares}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {formatCurrency(tx.price, tx.currency)}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                              {tx.fees > 0 ? formatCurrency(tx.fees, tx.currency) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                              {formatCurrency(totalLocal, tx.currency)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {activePortfolioRole === 'viewer' ? (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              ) : (
                                <button 
                                  onClick={() => handleDeleteTransaction(tx.id)}
                                  className="ledger-delete-btn"
                                  title="Delete Transaction"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ADD TRANSACTION DIALOG MODAL */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel">
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Plus size={20} className="gradient-text" /> Add New Transaction
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-red-glow)', border: '1px solid var(--color-red)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Type selector */}
              <div className="form-group">
                <label className="form-label">Action Type</label>
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '3px' }}>
                  <button
                    type="button"
                    className={`form-type-btn ${formType === 'BUY' ? 'active-buy' : ''}`}
                    onClick={() => setFormType('BUY')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: formType === 'BUY' ? 'var(--color-green)' : 'transparent',
                      color: 'white',
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    className={`form-type-btn ${formType === 'SELL' ? 'active-sell' : ''}`}
                    onClick={() => setFormType('SELL')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: formType === 'SELL' ? 'var(--color-red)' : 'transparent',
                      color: 'white',
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    SELL
                  </button>
                </div>
              </div>

              {/* Ticker Input */}
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label" htmlFor="form-ticker">Stock Symbol / Ticker</label>
                <input 
                  id="form-ticker"
                  type="text" 
                  placeholder="e.g. AAPL, CDR.WA, SXR8.DE" 
                  className="input-field" 
                  value={formSymbol}
                  onChange={(e) => handleTickerChange(e.target.value)}
                  autoComplete="off"
                  required
                />
                
                {/* Autocomplete Dropdown List */}
                {showSuggestions && (
                  <div className="search-suggestions-dropdown">
                    {suggestions.map((s) => (
                      <div 
                        key={s.symbol} 
                        className="suggestion-item" 
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="suggestion-symbol">{s.symbol}</span>
                          <span className="suggestion-badge">{s.exchange}</span>
                        </div>
                        <span className="suggestion-name" title={s.name}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Info size={12} /> Suffixes: USA (no suffix), Poland GPW (<code>.WA</code>), Germany Xetra (<code>.DE</code>).
                </small>
              </div>

              {/* Grid: Date, Currency, and Account */}
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="form-date">Date</label>
                  <input 
                    id="form-date"
                    type="date" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label" htmlFor="form-currency">Currency (Local)</label>
                  <select 
                    id="form-currency"
                    className="input-field"
                    style={{ width: '100%', cursor: 'pointer' }}
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value as 'PLN' | 'USD' | 'EUR')}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="PLN">PLN (zł)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="form-account">Brokerage Account</label>
                  <input 
                    id="form-account"
                    type="text" 
                    placeholder="e.g. mBank, IBKR" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formAccount}
                    onChange={(e) => setFormAccount(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Price Input Mode Selector */}
              <div className="form-group">
                <label className="form-label">Price Input Mode</label>
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '3px' }}>
                  <button
                    type="button"
                    className={`form-type-btn ${priceInputMode === 'per_share' ? 'active-buy' : ''}`}
                    onClick={() => setPriceInputMode('per_share')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: priceInputMode === 'per_share' ? 'var(--color-primary)' : 'transparent',
                      color: 'white',
                      padding: '0.4rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    Per Share
                  </button>
                  <button
                    type="button"
                    className={`form-type-btn ${priceInputMode === 'total' ? 'active-buy' : ''}`}
                    onClick={() => setPriceInputMode('total')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: priceInputMode === 'total' ? 'var(--color-primary)' : 'transparent',
                      color: 'white',
                      padding: '0.4rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    Total Value
                  </button>
                </div>
              </div>

              {/* Grid: Shares, Price & Fees */}
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="form-shares">Shares</label>
                  <input 
                    id="form-shares"
                    type="number" 
                    step="any"
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formShares}
                    onChange={(e) => setFormShares(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="form-price">
                    {priceInputMode === 'per_share' ? 'Price (per share)' : 'Total Price (excl. fees)'}
                  </label>
                  <input 
                    id="form-price"
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="form-fees">Transaction Fees</label>
                  <input 
                    id="form-fees"
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    className="input-field"
                    style={{ width: '100%' }}
                    value={formFees}
                    onChange={(e) => setFormFees(e.target.value)}
                  />
                </div>
              </div>

              {/* Cost Basis / Share calculation preview */}
              {formShares && formPrice && !isNaN(parseFloat(formShares)) && !isNaN(parseFloat(formPrice)) && parseFloat(formShares) > 0 && (
                <div style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--color-primary)', 
                  background: 'rgba(59, 130, 246, 0.05)', 
                  border: '1px dashed rgba(59, 130, 246, 0.2)',
                  borderRadius: '6px', 
                  padding: '0.5rem 0.75rem',
                  marginTop: '0.1rem'
                }}>
                  {priceInputMode === 'per_share' ? (
                    <span>
                      Calculated Total Cost: <strong>{formatCurrency(parseFloat(formShares) * parseFloat(formPrice), formCurrency)}</strong> (excl. fees)
                    </span>
                  ) : (
                    <span>
                      Calculated Price Per Share: <strong>{formatCurrency(parseFloat(formPrice) / parseFloat(formShares), formCurrency)}</strong>
                    </span>
                  )}
                </div>
              )}

              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="input-field"
                  style={{ cursor: 'pointer', background: 'transparent' }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glow-btn"
                  disabled={submitting}
                >
                  {submitting ? 'Adding...' : 'Save Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* COLLABORATIVE SHARING DIALOG MODAL */}
      {showShareModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Share2 size={20} className="gradient-text" /> Share Portfolio
              </h3>
              <button 
                onClick={() => setShowShareModal(false)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>

            {inviteError && (
              <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-red-glow)', border: '1px solid var(--color-red)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
                <span>{inviteError}</span>
              </div>
            )}

            {inviteSuccess && (
              <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-green)', borderRadius: '8px', color: '#22c55e', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <span>{inviteSuccess}</span>
              </div>
            )}

            {/* Invite Form */}
            <form onSubmit={handleInviteUser} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label" htmlFor="invite-email">Invite User by Email</label>
                <input 
                  id="invite-email"
                  type="email"
                  placeholder="collaborator@example.com"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" htmlFor="invite-role">Access Role</label>
                <select
                  id="invite-role"
                  className="input-field"
                  style={{ width: '100%', cursor: 'pointer' }}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </div>

              <button type="submit" className="glow-btn" style={{ padding: '0.55rem 1rem', height: '38px', borderRadius: '6px' }}>
                Invite
              </button>
            </form>

            {/* Members List */}
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} /> Active Portfolio Members ({members.length})
              </h4>
              
              {loadingMembers ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }} className="pulse">
                  Loading members list...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                  {members.map((member) => (
                    <div key={member.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.email}>
                          {member.email} {member.user_id === user?.id && <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem' }}>(You)</span>}
                        </span>
                        <span style={{ fontSize: '0.7' + 'rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Shield size={10} /> {member.role.toUpperCase()}
                        </span>
                      </div>

                      {member.user_id !== user?.id && (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          {/* Role toggler */}
                          <select
                            className="input-field"
                            style={{
                              padding: '0.15rem 0.4rem',
                              fontSize: '0.72rem',
                              height: 'auto',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: 'transparent',
                              borderColor: 'var(--panel-border)'
                            }}
                            value={member.role}
                            onChange={(e) => handleChangeMemberRole(member.user_id, e.target.value as 'editor' | 'viewer')}
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>

                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveMember(member.user_id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-red)',
                              cursor: 'pointer',
                              padding: '0.2rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Remove Member"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
