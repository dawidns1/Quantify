import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Share2, 
  Briefcase, 
  History, 
  Lock, 
  Eye, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  PieChart, 
  Info, 
  Globe, 
  ChevronDown, 
  CreditCard,
  Coins, 
  X, 
  AlertCircle,
  Shield,
  Users
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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
  portfolio_id: string;
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
  
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [quickActionData, setQuickActionData] = useState<{ symbol: string; type: 'BUY' | 'SELL' } | null>(null);
  const [customModal, setCustomModal] = useState<any | null>(null);
  
  const [linkCash, setLinkCashState] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_link_cash') !== 'false';
  });

  const setLinkCash = (val: boolean) => {
    setLinkCashState(val);
    localStorage.setItem('portfolio_link_cash', String(val));
  };

  const [chartData, setChartData] = useState<{ dates: string[]; nav: number[]; cost_basis: number[] } | null>(null);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [selectedPositionSymbol, setSelectedPositionSymbol] = useState<string | null>(null);

  // Filtering states
  const [selectedAccount, setSelectedAccountState] = useState<string>(() => {
    return localStorage.getItem('portfolio_selected_account') || 'All';
  });

  const setSelectedAccount = (account: string) => {
    setSelectedAccountState(account);
    localStorage.setItem('portfolio_selected_account', account);
  };

  // Holdings Sorting states
  const [holdingsSortField, setHoldingsSortField] = useState<string>(() => {
    return localStorage.getItem('portfolio_holdings_sort_field') || 'symbol';
  });
  const [holdingsSortAsc, setHoldingsSortAsc] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_holdings_sort_asc') !== 'false';
  });

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

  // 1. Transactions filtered by portfolio (used for fetching holdings & historical charting)
  const portfolioTransactions = useMemo(() => {
    if (activePortfolioId && activePortfolioId !== 'all') {
      return allTransactions.filter(tx => tx.portfolio_id === activePortfolioId);
    }
    return allTransactions;
  }, [allTransactions, activePortfolioId]);

  // 2. Transactions filtered by both portfolio and account (used for ledger, Cash Modal, etc.)
  const transactions = useMemo(() => {
    let list = allTransactions;
    if (activePortfolioId && activePortfolioId !== 'all') {
      list = list.filter(tx => tx.portfolio_id === activePortfolioId);
    }
    if (selectedAccount && selectedAccount !== 'All') {
      list = list.filter(tx => (tx.account || 'Default').toLowerCase() === selectedAccount.toLowerCase());
    }
    return list;
  }, [allTransactions, activePortfolioId, selectedAccount]);

  // 3. Dynamic map of unique accounts per portfolio ID for sidebar tree list
  const portfolioAccountsMap = useMemo(() => {
    const mapping: Record<string, string[]> = {};
    for (const tx of allTransactions) {
      const pId = tx.portfolio_id;
      if (!pId) continue;
      const acc = tx.account || 'Default';
      if (!mapping[pId]) {
        mapping[pId] = [];
      }
      if (!mapping[pId].includes(acc)) {
        mapping[pId].push(acc);
      }
    }
    for (const pId in mapping) {
      mapping[pId].sort();
    }
    return mapping;
  }, [allTransactions]);

  // 4. Extract unique accounts dynamically for the active portfolio scope
  const uniqueAccounts = useMemo(() => {
    return Array.from(
      new Set(portfolioTransactions.map((tx) => tx.account || 'Default'))
    ).sort();
  }, [portfolioTransactions]);

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
      if (cachedId === 'all') {
        setActivePortfolioId('all');
        setActivePortfolioRole('viewer'); // aggregation is read-only
      } else {
        const found = formatted.find(p => p.id === cachedId);
        if (found) {
          setActivePortfolioId(found.id);
          setActivePortfolioRole(found.role);
        } else {
          setActivePortfolioId(formatted[0].id);
          setActivePortfolioRole(formatted[0].role);
          localStorage.setItem('portfolio_active_id', formatted[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading portfolios:', err);
    } finally {
      setLoadingPortfolios(false);
    }
  };

  // Custom modal helpers
  const showCustomPrompt = (title: string, message: string, defaultValue: string, onConfirm: (val: string) => void) => {
    setCustomModal({
      isOpen: true,
      type: 'prompt',
      title,
      message,
      defaultValue,
      onConfirm: (val: any) => onConfirm(val || ''),
    });
  };

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void, isDestructive = false) => {
    setCustomModal({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm: () => onConfirm(),
      isDestructive
    });
  };

  // Create Portfolio
  const handleCreatePortfolio = () => {
    showCustomPrompt(
      "Create Portfolio",
      "Enter a name for your new portfolio:",
      "",
      async (name) => {
        if (!name || !name.trim()) return;
        try {
          const { data: newPortfolio, error: createError } = await supabase
            .from('portfolios')
            .insert({ name: name.trim() })
            .select()
            .single();

          if (createError) throw createError;

          const { error: memberError } = await supabase
            .from('portfolio_members')
            .insert({
              portfolio_id: newPortfolio.id,
              user_id: user?.id,
              role: 'owner'
            });

          if (memberError) throw memberError;

          await loadPortfolios();
          
          // Switch to the new portfolio
          setActivePortfolioId(newPortfolio.id);
          setActivePortfolioRole('owner');
          localStorage.setItem('portfolio_active_id', newPortfolio.id);
        } catch (err: any) {
          console.error('Error creating portfolio:', err);
          alert('Failed to create portfolio: ' + err.message);
        }
      }
    );
  };

  // Rename Portfolio
  const handleRenamePortfolio = (id: string = activePortfolioId || '') => {
    if (!id) return;
    const currentPortfolio = portfolios.find(p => p.id === id);
    if (!currentPortfolio) return;
    
    showCustomPrompt(
      "Rename Portfolio",
      `Enter a new name for "${currentPortfolio.name}":`,
      currentPortfolio.name,
      async (newName) => {
        if (!newName || !newName.trim() || newName.trim() === currentPortfolio.name) return;
        
        try {
          const { error } = await supabase
            .from('portfolios')
            .update({ name: newName.trim() })
            .eq('id', id);

          if (error) throw error;
          await loadPortfolios();
        } catch (err: any) {
          console.error('Error renaming portfolio:', err);
          alert('Failed to rename portfolio: ' + err.message);
        }
      }
    );
  };

  // Delete Portfolio
  const handleDeletePortfolio = (id: string = activePortfolioId || '') => {
    if (!id) return;
    const currentPortfolio = portfolios.find(p => p.id === id);
    if (!currentPortfolio) return;
    
    showCustomConfirm(
      "Delete Portfolio",
      `Are you sure you want to permanently delete the portfolio "${currentPortfolio.name}"? This will delete all its transactions and cannot be undone.`,
      async () => {
        try {
          const { error } = await supabase
            .from('portfolios')
            .delete()
            .eq('id', id);

          if (error) throw error;

          // Clear localStorage active ID so loadPortfolios selects the first remaining one
          localStorage.removeItem('portfolio_active_id');
          await loadPortfolios();
        } catch (err: any) {
          console.error('Error deleting portfolio:', err);
          alert('Failed to delete portfolio: ' + err.message);
        }
      },
      true
    );
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
  const handleRemoveMember = (userId: string) => {
    if (userId === user?.id) {
      alert("You cannot remove yourself from your own portfolio.");
      return;
    }
    
    showCustomConfirm(
      "Remove Member",
      "Are you sure you want to remove this member from this portfolio?",
      async () => {
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
      },
      true
    );
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



  // Fetch holdings (POST transactions to backend calculator in-memory)
  const fetchHoldings = async (curr: 'PLN' | 'USD' | 'EUR', accountFilter: string = selectedAccount) => {
    if (!activePortfolioId) return;
    setLoadingHoldings(true);
    try {
      const txs = portfolioTransactions;

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
          transactions: txs,
          link_cash: linkCash
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

  // Fetch transactions from Supabase for all loaded portfolios
  const fetchTransactions = async () => {
    if (!portfolios || portfolios.length === 0) {
      setAllTransactions([]);
      setLoadingTransactions(false);
      return;
    }
    setLoadingTransactions(true);
    try {
      const portfolioIds = portfolios.map(p => p.id);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .in('portfolio_id', portfolioIds)
        .order('date', { ascending: false });

      if (error) throw error;
      setAllTransactions(data || []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Fetch historical performance data for the chart
  const fetchHistoricalPerformance = async (curr: 'PLN' | 'USD' | 'EUR', accountFilter: string = selectedAccount) => {
    if (!activePortfolioId || portfolioTransactions.length === 0) {
      setChartData(null);
      return;
    }
    setLoadingChart(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/portfolio/historical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_currency: curr,
          account: accountFilter,
          transactions: portfolioTransactions,
          link_cash: linkCash
        })
      });
      if (!response.ok) throw new Error('Failed to fetch historical performance');
      const data = await response.json();
      setChartData(data);
    } catch (err) {
      console.error('Error fetching historical performance:', err);
    } finally {
      setLoadingChart(false);
    }
  };

  // Fetch transactions when the list of portfolios updates
  useEffect(() => {
    if (portfolios.length > 0) {
      fetchTransactions();
    }
  }, [portfolios]);

  // Recalculate holdings when active portfolio, filters, or transactions update
  useEffect(() => {
    if (activePortfolioId && portfolios.length > 0) {
      fetchHoldings(baseCurrency, selectedAccount);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, allTransactions, linkCash, portfolios]);

  // Recalculate chart when active portfolio, filters, or transactions update
  useEffect(() => {
    if (activePortfolioId && portfolioTransactions.length > 0) {
      fetchHistoricalPerformance(baseCurrency, selectedAccount);
    } else {
      setChartData(null);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, portfolioTransactions, linkCash]);

  // Handle quick actions from holdings table
  const handleQuickAction = (symbol: string, type: 'BUY' | 'SELL') => {
    if (activePortfolioRole === 'viewer') return;
    setQuickActionData({ symbol, type });
    setShowAddModal(true);
  };

  // Handle delete transaction
  const handleDeleteTransaction = (id: string) => {
    if (activePortfolioRole === 'viewer') return;
    
    showCustomConfirm(
      "Delete Transaction",
      "Are you sure you want to delete this transaction from your ledger?",
      async () => {
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
      },
      true
    );
  };

  // Populate form fields to start editing transaction
  const handleStartEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setShowAddModal(true);
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

  const { assets, currencies, countries } = useMemo(() => {
    return calculateAllocations();
  }, [holdings, summary.total_value_base]);





  // Filter transactions for the selected holding position modal
  const positionTransactions = useMemo(() => {
    if (!selectedPositionSymbol) return [];
    return transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase());
  }, [transactions, selectedPositionSymbol]);

  // Find holding details for the selected position modal
  const holdingDetails = useMemo(() => {
    if (!selectedPositionSymbol) return null;
    return holdings.find(h => h.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase()) || null;
  }, [holdings, selectedPositionSymbol]);

  // Sort holdings according to selected field & direction
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings];
    sorted.sort((a, b) => {
      const field = holdingsSortField as keyof Holding;
      const valA = a[field];
      const valB = b[field];

      if (valA === undefined || valA === null) return holdingsSortAsc ? 1 : -1;
      if (valB === undefined || valB === null) return holdingsSortAsc ? -1 : 1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
        return holdingsSortAsc ? comp : -comp;
      }

      return holdingsSortAsc 
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return sorted;
  }, [holdings, holdingsSortField, holdingsSortAsc]);

  const handleHoldingsSort = (field: string) => {
    if (holdingsSortField === field) {
      const nextAsc = !holdingsSortAsc;
      setHoldingsSortAsc(nextAsc);
      localStorage.setItem('portfolio_holdings_sort_asc', String(nextAsc));
    } else {
      setHoldingsSortField(field);
      // Default to ascending for text (symbol, name), descending for numbers/returns
      const defaultAsc = ['symbol', 'name'].includes(field);
      setHoldingsSortAsc(defaultAsc);
      localStorage.setItem('portfolio_holdings_sort_field', field);
      localStorage.setItem('portfolio_holdings_sort_asc', String(defaultAsc));
    }
  };

  const renderSortArrow = (field: string) => {
    if (holdingsSortField !== field) {
      return <span style={{ opacity: 0.25, marginLeft: '6px', fontSize: '0.8rem' }}>↕</span>;
    }
    return holdingsSortAsc ? (
      <span style={{ color: 'var(--color-primary)', marginLeft: '6px', fontSize: '0.8rem' }}>▲</span>
    ) : (
      <span style={{ color: 'var(--color-primary)', marginLeft: '6px', fontSize: '0.8rem' }}>▼</span>
    );
  };

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

  const togglePortfolioExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPortfolios(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const activePortfolioName = activePortfolioId === 'all'
    ? 'All Assets'
    : portfolios.find(p => p.id === activePortfolioId)?.name || 'My Portfolio';

  return (
    <div className="app-layout">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.75rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.1rem',
            color: 'white',
            boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)'
          }}>
            Q
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.03em', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              QUANTIFY
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Portfolio Intelligence
            </span>
          </div>
        </div>

        {/* User Context */}
        <div style={{ padding: '0.55rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0 0.5rem 0.5rem 0.5rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Logged in as:</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
            {user?.email}
          </span>
        </div>

        {/* Navigation Tree Root */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 0.5rem' }}>
          <div 
            className={`tree-node ${activePortfolioId === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActivePortfolioId('all');
              setSelectedAccount('All');
              localStorage.setItem('portfolio_active_id', 'all');
            }}
          >
            <Globe size={15} />
            <span>All Assets</span>
          </div>
        </div>

        {/* Portfolios Section */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 0.5rem' }}>
          <div className="tree-section-header">
            <span>Portfolios</span>
            <button 
              onClick={handleCreatePortfolio}
              title="Create New Portfolio"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Plus size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', flex: 1, paddingRight: '4px', marginTop: '0.25rem' }}>
            {portfolios.map((portfolio) => {
              const isActive = activePortfolioId === portfolio.id;
              const isExpanded = !!expandedPortfolios[portfolio.id];
              const accounts = portfolioAccountsMap[portfolio.id] || [];
              
              return (
                <div key={portfolio.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Portfolio Folder Node */}
                  <div 
                    className={`tree-node ${isActive && selectedAccount === 'All' ? 'active' : ''}`}
                    onClick={() => {
                      setActivePortfolioId(portfolio.id);
                      setActivePortfolioRole(portfolio.role);
                      setSelectedAccount('All');
                      localStorage.setItem('portfolio_active_id', portfolio.id);
                    }}
                  >
                    <div 
                      className={`tree-caret ${isExpanded ? '' : 'collapsed'}`}
                      onClick={(e) => togglePortfolioExpand(portfolio.id, e)}
                    >
                      <ChevronDown size={13} />
                    </div>
                    <Briefcase size={14} style={{ flexShrink: 0 }} />
                    <span style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap', 
                      paddingRight: portfolio.role === 'owner' ? '2.5rem' : '0.5rem',
                      fontSize: '0.82rem'
                    }}>
                      {portfolio.name}
                    </span>
                    
                    {/* Hover CRUD icons */}
                    {portfolio.role === 'owner' && (
                      <div className="tree-node-actions" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenamePortfolio(portfolio.id);
                          }}
                          title="Rename Portfolio"
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <Edit2 size={11} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePortfolio(portfolio.id);
                          }}
                          title="Delete Portfolio"
                          style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: '2px' }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Nested Accounts Sub-list */}
                  {isExpanded && (
                    <div className="tree-sub-list">
                      <div 
                        className={`tree-node ${isActive && selectedAccount === 'All' ? 'active' : ''}`}
                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                        onClick={() => {
                          setActivePortfolioId(portfolio.id);
                          setActivePortfolioRole(portfolio.role);
                          setSelectedAccount('All');
                          localStorage.setItem('portfolio_active_id', portfolio.id);
                        }}
                      >
                        <History size={12} />
                        <span>All Accounts</span>
                      </div>
                      
                      {accounts.map((accName) => {
                        const isAccActive = isActive && selectedAccount === accName;
                        return (
                          <div 
                            key={accName}
                            className={`tree-node ${isAccActive ? 'active' : ''}`}
                            style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                            onClick={() => {
                              setActivePortfolioId(portfolio.id);
                              setActivePortfolioRole(portfolio.role);
                              setSelectedAccount(accName);
                              localStorage.setItem('portfolio_active_id', portfolio.id);
                            }}
                          >
                            <CreditCard size={12} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {accName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <div className="portfolio-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top navigation Header Switcher Bar */}
          <div className="portfolio-header-bar glass-panel" style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '1rem',
            padding: '0.75rem 1.25rem',
            background: 'rgba(13, 20, 35, 0.45)',
            border: '1px solid var(--panel-border)',
            borderRadius: '10px'
          }}>
            {/* Breadcrumb Trail */}
            <div className="breadcrumb-trail">
              <Globe size={14} style={{ color: 'var(--color-primary)' }} />
              <span className="breadcrumb-item">All Assets</span>
              {activePortfolioId && activePortfolioId !== 'all' && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}>/</span>
                  <span className={`breadcrumb-item ${selectedAccount === 'All' ? 'active' : ''}`}>
                    {activePortfolioName}
                  </span>
                </>
              )}
              {selectedAccount && selectedAccount !== 'All' && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}>/</span>
                  <span className="breadcrumb-item active">
                    {selectedAccount}
                  </span>
                </>
              )}
            </div>

            {/* Utility selectors & action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              
              {/* Sub-tabs buttons */}
              <div className="sub-tabs-container" style={{ display: 'flex', gap: '0.35rem' }}>
                <button 
                  className={`sub-tab-btn ${subTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setSubTab('overview')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: subTab === 'overview' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    color: subTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: subTab === 'overview' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  <Briefcase size={14} />
                  Overview
                </button>
                <button 
                  className={`sub-tab-btn ${subTab === 'ledger' ? 'active' : ''}`}
                  onClick={() => setSubTab('ledger')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: subTab === 'ledger' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    color: subTab === 'ledger' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: subTab === 'ledger' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  <History size={14} />
                  Ledger ({transactions.length})
                </button>
              </div>

              {/* Base Currency Selector pills */}
              <div className="currency-selector-pills" style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
                {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
                  <button
                    key={curr}
                    onClick={() => setBaseCurrency(curr)}
                    style={{
                      background: baseCurrency === curr ? 'var(--color-primary)' : 'transparent',
                      color: baseCurrency === curr ? 'white' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '0.2rem 0.55rem',
                      fontSize: '0.72rem',
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

              {/* Share button */}
              {activePortfolioId !== 'all' && activePortfolioRole === 'owner' && (
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
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    boxShadow: 'none',
                    background: 'rgba(59, 130, 246, 0.06)',
                    color: 'var(--color-primary)',
                    borderColor: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <Share2 size={13} /> Share
                </button>
              )}

              {/* Add Transaction Button */}
              {activePortfolioId !== 'all' && activePortfolioRole !== 'viewer' && (
                <button 
                  className="glow-btn"
                  onClick={() => setShowAddModal(true)}
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', borderRadius: '6px' }}
                >
                  <Plus size={14} /> Add Transaction
                </button>
              )}
            </div>
          </div>

      {/* Shimmer / Skeleton Loading placeholder for initial data fetch */}
      {(loadingPortfolios || (loadingHoldings && holdings.length === 0) || (loadingTransactions && transactions.length === 0)) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Consolidated Premium Metrics Banner Skeleton */}
          <div className="glass-panel" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.75rem',
            background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.65) 0%, rgba(13, 17, 28, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
            gap: '1.5rem',
            flexWrap: 'wrap',
            marginBottom: '0.5rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '120px' }}>
              <div className="shimmer-placeholder" style={{ width: '120px', height: '12px' }}></div>
              <div className="shimmer-placeholder" style={{ width: '180px', height: '24px' }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '120px' }}>
              <div className="shimmer-placeholder" style={{ width: '100px', height: '12px' }}></div>
              <div className="shimmer-placeholder" style={{ width: '140px', height: '20px' }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '120px' }}>
              <div className="shimmer-placeholder" style={{ width: '120px', height: '12px' }}></div>
              <div className="shimmer-placeholder" style={{ width: '160px', height: '20px' }}></div>
            </div>
          </div>

          {subTab === 'overview' ? (
            <>
              {/* Chart skeleton */}
              <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '0.5rem', height: '260px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="shimmer-placeholder" style={{ width: '220px', height: '18px' }}></div>
                <div className="shimmer-placeholder" style={{ width: '100%', flex: 1 }}></div>
              </div>

              {/* Grid skeleton */}
              <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="shimmer-placeholder" style={{ width: '180px', height: '22px' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                        <div className="shimmer-placeholder" style={{ flex: 2, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 3, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="shimmer-placeholder" style={{ width: '140px', height: '20px' }}></div>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div className="shimmer-placeholder" style={{ width: '60px', height: '14px' }}></div>
                        <div className="shimmer-placeholder" style={{ width: '40px', height: '14px' }}></div>
                      </div>
                      <div className="shimmer-placeholder" style={{ width: '100%', height: '8px' }}></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Ledger tab skeleton */
            <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="shimmer-placeholder" style={{ width: '220px', height: '24px' }}></div>
                <div className="shimmer-placeholder" style={{ width: '150px', height: '18px' }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                    <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                    <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                    <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                    <div className="shimmer-placeholder" style={{ flex: 2, height: '20px' }}></div>
                    <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                    <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Viewer Lock Warning Banner */}
          {activePortfolioRole === 'viewer' && (
            <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              <Lock size={16} style={{ flexShrink: 0 }} />
              <span>You have <strong>Read-Only (Viewer)</strong> access to this portfolio. Adding, editing, or deleting transactions is disabled.</span>
            </div>
          )}

          <div style={{ display: subTab === 'overview' ? 'block' : 'none' }}>
            <>
              {/* Consolidated Premium Metrics Banner */}
              <div className="glass-panel" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.25rem 1.75rem',
                background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.65) 0%, rgba(13, 17, 28, 0.8) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                gap: '1.5rem',
                flexWrap: 'wrap',
                marginBottom: '1rem'
              }}>
                {/* Left: NAV / Value */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Net Asset Value (NAV)
                  </span>
                  <span className="metric-value" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'system-ui, sans-serif' }}>
                    {formatCurrency(summary.total_value_base, summary.base_currency)}
                  </span>
                </div>

                {/* Middle: Returns */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '150px' }}>
                  <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Total Return
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className={`metric-value ${isProfit ? 'text-green' : 'text-red'}`} style={{ fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {isProfit ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                      {formatCurrency(summary.total_gain_base, summary.base_currency)}
                    </span>
                    <span className={`badge ${isProfit ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      {isProfit ? '+' : ''}{summary.total_gain_percent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Right: Cost Basis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span className="metric-title" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Total Cost Basis
                  </span>
                  <span className="metric-value" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {formatCurrency(summary.total_cost_base, summary.base_currency)}
                  </span>
                </div>

                {/* Settings: Link Cash Balancing Toggle */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.6rem', 
                  borderLeft: '1px solid var(--panel-border)', 
                  paddingLeft: '1.5rem',
                  marginLeft: '0.5rem'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Link Cash Balance</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Auto-deduct transactions</span>
                  </div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={linkCash}
                      onChange={(e) => setLinkCash(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {/* Historical Performance Chart Card */}
              {(loadingChart || (chartData && chartData.dates && chartData.dates.length > 0)) && (
                <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Activity size={16} className="gradient-text" /> Portfolio Performance History
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Showing NAV vs. Total Cost Basis in {summary.base_currency}
                    </span>
                  </div>
                  <div style={{ height: '220px', position: 'relative' }}>
                    {loadingChart ? (
                      <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }} className="pulse">
                        Computing historical performance data...
                      </div>
                    ) : chartData && chartData.dates && chartData.dates.length > 0 ? (
                      <Line 
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            x: {
                              grid: { display: false },
                              ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } }
                            },
                            y: {
                              grid: { color: 'rgba(255, 255, 255, 0.05)' },
                              ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } }
                            }
                          },
                          plugins: {
                            legend: {
                              display: true,
                              position: 'top',
                              labels: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 11 }, boxWidth: 12, padding: 10 }
                            },
                            tooltip: {
                              mode: 'index',
                              intersect: false,
                              backgroundColor: 'rgba(13, 17, 28, 0.95)',
                              titleColor: 'var(--text-primary)',
                              bodyColor: 'var(--text-secondary)',
                              borderColor: 'rgba(255, 255, 255, 0.1)',
                              borderWidth: 1,
                              padding: 10,
                              cornerRadius: 6
                            }
                          }
                        }}
                        data={{
                          labels: chartData.dates,
                          datasets: [
                            {
                              label: 'Net Asset Value (NAV)',
                              data: chartData.nav,
                              fill: true,
                              backgroundColor: 'rgba(6, 182, 212, 0.08)',
                              borderColor: 'var(--color-primary)',
                              borderWidth: 2,
                              pointRadius: 2,
                              pointHoverRadius: 4,
                              tension: 0.2
                            },
                            {
                              label: 'Invested Capital (Cost Basis)',
                              data: chartData.cost_basis,
                              fill: false,
                              borderColor: 'rgba(255, 255, 255, 0.35)',
                              borderWidth: 1.5,
                              borderDash: [5, 5],
                              pointRadius: 0,
                              pointHoverRadius: 3,
                              tension: 0.05
                            }
                          ]
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              )}

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
                            <th onClick={() => handleHoldingsSort('symbol')} style={{ userSelect: 'none' }}>
                              Ticker {renderSortArrow('symbol')}
                            </th>
                            {visibleColumns.includes('name') && (
                              <th onClick={() => handleHoldingsSort('name')} style={{ userSelect: 'none' }}>
                                Company Name {renderSortArrow('name')}
                              </th>
                            )}
                            {visibleColumns.includes('shares') && (
                              <th onClick={() => handleHoldingsSort('shares')} style={{ textAlign: 'right', userSelect: 'none' }}>
                                Shares {renderSortArrow('shares')}
                              </th>
                            )}
                            {visibleColumns.includes('avg_cost') && (
                              <th onClick={() => handleHoldingsSort('avg_cost_local')} style={{ textAlign: 'right', userSelect: 'none' }}>
                                Avg Cost {renderSortArrow('avg_cost_local')}
                              </th>
                            )}
                            {visibleColumns.includes('price') && (
                              <th onClick={() => handleHoldingsSort('current_price_local')} style={{ textAlign: 'right', userSelect: 'none' }}>
                                Price {renderSortArrow('current_price_local')}
                              </th>
                            )}
                            {visibleColumns.includes('cost') && (
                              <th onClick={() => handleHoldingsSort('cost_basis_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                                Cost ({summary.base_currency}) {renderSortArrow('cost_basis_base')}
                              </th>
                            )}
                            <th onClick={() => handleHoldingsSort('current_value_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                              Current ({summary.base_currency}) {renderSortArrow('current_value_base')}
                            </th>
                            <th onClick={() => handleHoldingsSort('gain_base')} style={{ textAlign: 'right', userSelect: 'none' }}>
                              Gain/Loss {renderSortArrow('gain_base')}
                            </th>
                            <th style={{ textAlign: 'center', cursor: 'default', background: 'rgba(255, 255, 255, 0.01)' }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedHoldings.map((h) => {
                            const valIsProfit = h.gain_base >= 0;
                            return (
                              <tr 
                                key={h.symbol} 
                                className="interactive-row"
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('button')) return;
                                  setSelectedPositionSymbol(h.symbol);
                                }}
                                style={{ cursor: 'pointer' }}
                              >
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
                                        title={h.symbol.startsWith('CASH_') ? `Deposit ${h.currency}` : `Buy more ${h.symbol}`}
                                      >
                                        +
                                      </button>
                                      <button 
                                        className="holding-action-btn sell"
                                        onClick={() => handleQuickAction(h.symbol, 'SELL')}
                                        title={h.symbol.startsWith('CASH_') ? `Withdraw ${h.currency}` : `Sell ${h.symbol}`}
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
          </div>

          {/* Ledger Tab Container */}
          <div style={{ display: subTab === 'ledger' ? 'block' : 'none' }}>
            {/* LEDGER VIEW: TRANSACTION HISTORY */}
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
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                  <button 
                                    onClick={() => handleStartEditTransaction(tx)}
                                    className="ledger-delete-btn"
                                    style={{ color: 'var(--text-secondary)' }}
                                    title="Edit Transaction"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTransaction(tx.id)}
                                    className="ledger-delete-btn"
                                    title="Delete Transaction"
                                  >
                                    <Trash2 size={15} />
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
          </div>
        </>
      )}

      {/* ADD TRANSACTION DIALOG MODAL */}
      <AddTransactionModal 
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingTransaction(null);
          setQuickActionData(null);
        }}
        editingTransaction={editingTransaction}
        quickActionData={quickActionData}
        activePortfolioId={activePortfolioId}
        activePortfolioRole={activePortfolioRole}
        apiBaseUrl={apiBaseUrl}
        uniqueAccounts={uniqueAccounts}
        transactions={transactions}
        linkCash={linkCash}
        onSaveSuccess={() => {
          fetchHoldings(baseCurrency, selectedAccount);
          fetchTransactions();
        }}
      />
      {/* COLLABORATIVE SHARING DIALOG MODAL */}
      {showShareModal && (
        <>
          <div className="modal-backdrop" onClick={() => setShowShareModal(false)} style={{ cursor: 'pointer' }} />
          <div className="modal-overlay-container">
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
      </>
    )}

      {/* POSITION TRANSACTIONS HISTORY MODAL */}
      {selectedPositionSymbol && (
        <>
          <div className="modal-backdrop" onClick={() => setSelectedPositionSymbol(null)} style={{ cursor: 'pointer' }} />
          <div className="modal-overlay-container">
            <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.35rem' }}>
                <History size={22} className="gradient-text" /> 
                <span style={{ fontWeight: 700 }}>{selectedPositionSymbol}</span>
                {holdingDetails?.name && (
                  <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 400, opacity: 0.85 }}>
                    ({holdingDetails.name})
                  </span>
                )}
              </h3>
              <button 
                onClick={() => setSelectedPositionSymbol(null)}
                className="modal-close-btn"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Quick Summary Dashboard */}
              {holdingDetails && (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                  gap: '1rem', 
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '1rem 1.25rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shares Owned</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {holdingDetails.shares}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Cost (Local)</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {formatCurrency(holdingDetails.avg_cost_local, holdingDetails.currency)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Value</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {formatCurrency(holdingDetails.current_value_base, summary.base_currency)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Return</span>
                    <span style={{ 
                      fontSize: '1.2rem', 
                      fontWeight: 700, 
                      fontFamily: 'monospace',
                      color: holdingDetails.gain_base >= 0 ? 'var(--color-green)' : 'var(--color-red)'
                    }}>
                      {holdingDetails.gain_base >= 0 ? '+' : ''}{formatCurrency(holdingDetails.gain_base, summary.base_currency)}
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: '4px' }}>
                        ({holdingDetails.gain_base >= 0 ? '+' : ''}{holdingDetails.gain_percent.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {positionTransactions.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', margin: 0 }}>
                  No transactions found for {selectedPositionSymbol}.
                </p>
              ) : (
                <div style={{ 
                  maxHeight: '320px', 
                  overflowY: 'auto',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '10px',
                  background: 'rgba(0, 0, 0, 0.15)'
                }}>
                  <table className="screener-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                        <th>Date</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Shares</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Fees</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        {activePortfolioRole !== 'viewer' && <th style={{ textAlign: 'center' }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {positionTransactions.map((tx) => {
                        const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
                        return (
                          <tr key={tx.id} className="interactive-row-modal">
                            <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {tx.date}
                            </td>
                            <td>
                              <span className={`ledger-type-badge ${tx.type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                {tx.type}
                              </span>
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
                            {activePortfolioRole !== 'viewer' && (
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                  <button 
                                    onClick={() => {
                                      setSelectedPositionSymbol(null); // Close history modal first
                                      handleStartEditTransaction(tx);
                                    }}
                                    className="ledger-delete-btn"
                                    style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                    title="Edit Transaction"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTransaction(tx.id)}
                                    className="ledger-delete-btn"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                    title="Delete Transaction"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button
                  onClick={() => setSelectedPositionSymbol(null)}
                  className="glow-btn"
                  style={{
                    padding: '0.55rem 1.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--panel-border)',
                    boxShadow: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )}

      {/* CUSTOM PROMPT/CONFIRM DIALOG MODAL */}
      {customModal && customModal.isOpen && (
        <>
          <div className="modal-backdrop" />
          <div className="modal-overlay-container">
            <div className="modal-content glass-panel" style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                {customModal.title}
              </h3>
              <button 
                onClick={() => setCustomModal(null)}
                className="modal-close-btn"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {customModal.message}
              </p>

              {customModal.type === 'prompt' && (
                <div className="form-group">
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    defaultValue={customModal.defaultValue}
                    id="custom-modal-input"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        customModal.onConfirm(val);
                        setCustomModal(null);
                      }
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  onClick={() => setCustomModal(null)}
                  className="input-field"
                  style={{
                    padding: '0.45rem 1rem',
                    background: 'transparent',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-secondary)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    height: 'auto',
                    width: 'auto'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    let val = undefined;
                    if (customModal.type === 'prompt') {
                      val = (document.getElementById('custom-modal-input') as HTMLInputElement)?.value;
                    }
                    customModal.onConfirm(val);
                    setCustomModal(null);
                  }}
                  className="glow-btn"
                  style={{
                    padding: '0.45rem 1rem',
                    background: customModal.isDestructive ? 'var(--color-red)' : 'var(--color-primary)',
                    color: 'white',
                    borderColor: customModal.isDestructive ? 'var(--color-red)' : 'var(--color-primary)',
                    boxShadow: customModal.isDestructive ? '0 0 10px rgba(239, 68, 68, 0.3)' : '0 0 10px rgba(59, 130, 246, 0.3)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    height: 'auto'
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )}

    </div>
  </main>
</div>
  );
}

// ==========================================
// Isolated Add / Edit Transaction Modal
// ==========================================
interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction: Transaction | null;
  quickActionData: { symbol: string; type: 'BUY' | 'SELL' } | null;
  activePortfolioId: string | null;
  activePortfolioRole: string;
  apiBaseUrl: string;
  uniqueAccounts: string[];
  transactions: Transaction[];
  linkCash: boolean;
  onSaveSuccess: () => void;
}

function AddTransactionModal({
  isOpen,
  onClose,
  editingTransaction,
  quickActionData,
  activePortfolioId,
  activePortfolioRole,
  apiBaseUrl,
  uniqueAccounts,
  transactions,
  linkCash,
  onSaveSuccess
}: AddTransactionModalProps) {
  const [formSymbol, setFormSymbol] = useState('');
  const [formType, setFormType] = useState<'BUY' | 'SELL'>('BUY');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formShares, setFormShares] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState<'PLN' | 'USD' | 'EUR'>('USD');
  const [formFees, setFormFees] = useState('');
  const [formAccount, setFormAccount] = useState('Default');
  const [priceInputMode, setPriceInputMode] = useState<'per_share' | 'total' | 'adjust'>('per_share');

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionSelected, setIsSuggestionSelected] = useState(false);
  const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
  const [isAccountInputDirty, setIsAccountInputDirty] = useState(false);
  
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Helper to calculate historical cash balance for a currency and account matching the backend zero floor rule
  const getCurrentCashBalance = (curr: string, acc: string) => {
    let balance = 0.0;
    
    // Sort transactions chronologically
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    
    for (const tx of sorted) {
      const tx_acc = tx.account || 'Default';
      if (tx_acc.toLowerCase() !== acc.toLowerCase()) continue;
      
      const tx_curr = tx.currency ? tx.currency.toUpperCase() : 'USD';
      const sym = tx.symbol.toUpperCase();
      
      if (sym === `CASH_${curr.toUpperCase()}`) {
        const amount = tx.shares * tx.price;
        if (tx.type === 'BUY') balance += amount;
        else if (tx.type === 'SELL') balance -= amount;
      } else if (!sym.startsWith('CASH_')) {
        if (linkCash && tx_curr === curr.toUpperCase()) {
          const amount = tx.shares * tx.price;
          if (tx.type === 'BUY') balance -= (amount + tx.fees);
          else if (tx.type === 'SELL') balance += (amount - tx.fees);
        }
      }
      
      // Apply zero floor rule
      if (balance < 0.0) {
        balance = 0.0;
      }
    }
    return balance;
  };

  // Filter accounts dynamically as user types
  const accountsToShow = useMemo(() => {
    const validAccounts = uniqueAccounts.filter(acc => acc && acc.trim() !== "");
    if (!isAccountInputDirty) {
      return validAccounts;
    }
    return validAccounts.filter(acc => 
      acc.toLowerCase().includes(formAccount.toLowerCase())
    );
  }, [uniqueAccounts, formAccount, isAccountInputDirty]);

  // Debounced search for suggestions
  useEffect(() => {
    if (isSuggestionSelected) {
      return;
    }

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
  }, [formSymbol, apiBaseUrl, isSuggestionSelected]);

  // Initialize and Reset Form fields
  useEffect(() => {
    if (editingTransaction) {
      setFormSymbol(editingTransaction.symbol);
      setFormType(editingTransaction.type);
      setFormDate(editingTransaction.date);
      setFormShares(editingTransaction.shares.toString());
      setFormPrice(editingTransaction.price.toString());
      setFormCurrency(editingTransaction.currency as 'PLN' | 'USD' | 'EUR');
      setFormFees(editingTransaction.fees ? editingTransaction.fees.toString() : '');
      setFormAccount(editingTransaction.account || 'Default');
      setIsSuggestionSelected(true);
      setPriceInputMode('per_share');
    } else if (quickActionData) {
      setFormSymbol(quickActionData.symbol);
      setFormType(quickActionData.type);
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormShares('');
      setFormPrice('');
      
      const upperSymbol = quickActionData.symbol.toUpperCase().trim();
      if (upperSymbol.endsWith('.WA')) {
        setFormCurrency('PLN');
      } else if (upperSymbol.endsWith('.DE') || upperSymbol.endsWith('.F')) {
        setFormCurrency('EUR');
      } else {
        setFormCurrency('USD');
      }
      
      setFormFees('');
      setFormAccount('Default');
      setIsSuggestionSelected(true);
      setPriceInputMode('per_share');
    } else {
      setFormSymbol('');
      setFormType('BUY');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormShares('');
      setFormPrice('');
      setFormCurrency('USD');
      setFormFees('');
      setFormAccount('Default');
      setIsSuggestionSelected(false);
      setPriceInputMode('per_share');
    }
    setFormError(null);
  }, [editingTransaction, quickActionData, isOpen]);

  const handleTickerChange = (val: string) => {
    setFormSymbol(val);
    setIsSuggestionSelected(false);
    const upperVal = val.toUpperCase().trim();
    if (upperVal.endsWith('.WA')) {
      setFormCurrency('PLN');
    } else if (upperVal.endsWith('.DE')) {
      setFormCurrency('EUR');
    } else {
      setFormCurrency('USD');
    }
  };

  const handleSelectSuggestion = (s: any) => {
    setFormSymbol(s.symbol);
    setIsSuggestionSelected(true);
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

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePortfolioRole === 'viewer') return;
    setFormError(null);
    
    const symbol = formSymbol.toUpperCase().trim();
    let shares = parseFloat(formShares);
    let priceInput = parseFloat(formPrice);
    let fees = parseFloat(formFees) || 0;
    let type = formType;

    if (!symbol) {
      setFormError('Please enter a stock ticker symbol.');
      return;
    }

    if (symbol.startsWith('CASH_') && priceInputMode === 'adjust') {
      const targetVal = parseFloat(formPrice);
      if (isNaN(targetVal) || targetVal < 0) {
        setFormError('Target balance must be a valid non-negative number.');
        return;
      }
      const cashCurr = symbol.split('_')[1] || formCurrency;
      const currentBal = getCurrentCashBalance(cashCurr, formAccount);
      const diff = targetVal - currentBal;
      
      if (Math.abs(diff) < 0.001) {
        setFormError('Target balance matches current balance. No adjustment needed.');
        return;
      }
      
      shares = Math.abs(diff);
      priceInput = 1.0;
      fees = 0.0;
      type = diff > 0 ? 'BUY' : 'SELL';
    } else {
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
      type,
      date: formDate,
      shares,
      price,
      currency: formCurrency,
      fees,
      account: formAccount || 'Default'
    };

    try {
      if (editingTransaction) {
        const { error } = await supabase
          .from('transactions')
          .update(payload)
          .eq('id', editingTransaction.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('transactions')
          .insert(payload);
        
        if (error) throw error;
      }
      
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving transaction:', err);
      setFormError(err.message || 'Error occurred while saving transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            {editingTransaction ? (
              <>
                <Edit2 size={20} className="gradient-text" /> Edit Transaction
              </>
            ) : (
              <>
                <Plus size={20} className="gradient-text" /> Add New Transaction
              </>
            )}
          </h3>
          <button 
            onClick={onClose}
            className="modal-close-btn"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
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
            
            {/* Quick Cash Buttons */}
            {(!formSymbol || formSymbol.toUpperCase().startsWith('CASH')) && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                {['CASH_USD', 'CASH_PLN', 'CASH_EUR'].map((cashSym) => (
                  <button
                    key={cashSym}
                    type="button"
                    onClick={() => {
                      setFormSymbol(cashSym);
                      setIsSuggestionSelected(true);
                      setShowSuggestions(false);
                      const curr = cashSym.split('_')[1] as 'PLN' | 'USD' | 'EUR';
                      setFormCurrency(curr);
                      setFormPrice('1.0');
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '4px',
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    + {cashSym.split('_')[1]} Cash
                  </button>
                ))}
              </div>
            )}
            
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

            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label" htmlFor="form-account">Brokerage Account</label>
              <input 
                id="form-account"
                type="text" 
                placeholder="e.g. mBank, IBKR" 
                className="input-field"
                style={{ width: '100%' }}
                value={formAccount}
                onChange={(e) => {
                  setFormAccount(e.target.value);
                  setIsAccountInputDirty(true);
                }}
                onFocus={(e) => {
                  e.target.select();
                  setIsAccountInputDirty(false);
                  setShowAccountSuggestions(true);
                }}
                onBlur={() => setShowAccountSuggestions(false)}
                autoComplete="off"
                required
              />
              
              {showAccountSuggestions && accountsToShow.length > 0 && (
                <div className="search-suggestions-dropdown" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {accountsToShow.map((acc) => (
                    <div 
                      key={acc} 
                      className="suggestion-item"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setFormAccount(acc);
                        setShowAccountSuggestions(false);
                      }}
                    >
                      {acc}
                    </div>
                  ))}
                </div>
              )}
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
              {formSymbol.toUpperCase().startsWith('CASH_') && (
                <button
                  type="button"
                  className={`form-type-btn ${priceInputMode === 'adjust' ? 'active-buy' : ''}`}
                  onClick={() => setPriceInputMode('adjust')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: priceInputMode === 'adjust' ? 'var(--color-primary)' : 'transparent',
                    color: 'white',
                    padding: '0.4rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  Adjust Balance
                </button>
              )}
            </div>
          </div>

          {/* Grid: Shares, Price & Fees OR Target Cash Balance */}
          {formSymbol.toUpperCase().startsWith('CASH_') && priceInputMode === 'adjust' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="form-target-bal">Target Cash Balance ({formCurrency})</label>
              <div style={{ position: 'relative' }}>
                <input 
                  id="form-target-bal"
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  className="input-field"
                  style={{ width: '100%' }}
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  required
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  Current Balance in <strong>{formAccount}</strong>: {formatCurrency(getCurrentCashBalance(formSymbol.split('_')[1] || formCurrency, formAccount), formCurrency)}.
                  <br />
                  Saving will automatically create a transaction for the difference.
                </div>
              </div>
            </div>
          ) : (
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
          )}
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
              {(() => {
                const shares = parseFloat(formShares);
                const price = parseFloat(formPrice);
                const fees = parseFloat(formFees) || 0;
                
                if (priceInputMode === 'per_share') {
                  const grossTotal = shares * price;
                  const netTotal = formType === 'BUY' ? grossTotal + fees : grossTotal - fees;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div>
                        Gross Total: <strong>{formatCurrency(grossTotal, formCurrency)}</strong>
                      </div>
                      {fees > 0 && (
                        <div style={{ fontWeight: 600, color: formType === 'BUY' ? 'var(--color-primary)' : 'var(--color-green)' }}>
                          {formType === 'BUY' ? 'Total Cash Outlay (incl. fees):' : 'Net Cash Proceeds (after fees):'}{' '}
                          <strong>{formatCurrency(netTotal, formCurrency)}</strong>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  const calculatedPricePerShare = price / shares;
                  const adjustedPrice = formType === 'BUY' 
                    ? (price + fees) / shares 
                    : (price - fees) / shares;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div>
                        Calculated Price Per Share: <strong>{formatCurrency(calculatedPricePerShare, formCurrency)}</strong>
                      </div>
                      {fees > 0 && (
                        <div style={{ fontWeight: 600, color: formType === 'BUY' ? 'var(--color-primary)' : 'var(--color-green)' }}>
                          {formType === 'BUY' ? 'Effective Buy Cost Per Share (incl. fees):' : 'Effective Sell Proceeds Per Share (after fees):'}{' '}
                          <strong>{formatCurrency(adjustedPrice, formCurrency)}</strong>
                        </div>
                      )}
                    </div>
                  );
                }
              })()}
            </div>
          )}

          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
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
              {submitting 
                ? (editingTransaction ? 'Updating...' : 'Adding...') 
                : (editingTransaction ? 'Update Transaction' : 'Save Transaction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  </>
);
}
