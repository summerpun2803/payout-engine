import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
const MERCHANT_ID = '10000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────
// Reusable UI Components
// ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const config = {
    pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: '⏳ Pending' },
    processing: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', label: '🔄 Processing' },
    completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: '✅ Completed' },
    failed: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: '❌ Failed' },
  };
  const { bg, text, border, label } = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${bg} ${text} ${border}`}>
      {label}
    </span>
  );
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200/60 rounded ${className}`} />
);

const CopyButton = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-xs text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
      title="Copy to clipboard"
    >
      {copied ? '✓ Copied' : `📋 ${label}`}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// Main App Component
// ─────────────────────────────────────────────────────────────

export default function App() {
  const [balance, setBalance] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [form, setForm] = useState({ amount_paise: '', bank_account_id: '' });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = async () => {
    try {
      const headers = { 'Merchant-Id': MERCHANT_ID };
      const [balRes, payRes] = await Promise.all([
        fetch(`${API_URL}/merchant/balance`, { headers }),
        fetch(`${API_URL}/payouts/history`, { headers })
      ]);

      if (balRes.ok) {
        const data = await balRes.json();
        setBalance(data.available_balance);
      }
      if (payRes.ok) {
        const data = await payRes.json();
        setPayouts(Array.isArray(data) ? data : []);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, []);

  const showMessage = (text, type = 'info') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const submitPayout = async (e) => {
    e.preventDefault();
    if (!form.amount_paise || !form.bank_account_id) {
      showMessage('Please fill in both fields', 'error');
      return;
    }
    if (isNaN(form.amount_paise) || Number(form.amount_paise) <= 0) {
      showMessage('Amount must be a positive number', 'error');
      return;
    }

    setIsSubmitting(true);
    setMsg({ text: 'Submitting payout...', type: 'info' });

    try {
      const res = await fetch(`${API_URL}/payouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Merchant-Id': MERCHANT_ID,
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (res.ok) {
        showMessage(`✅ Payout #${data.id?.slice(0, 8)}… created successfully`, 'success');
        setForm({ amount_paise: '', bank_account_id: '' });
        fetchData();
      } else {
        showMessage(`❌ ${data.error || 'Request failed'}`, 'error');
      }
    } catch (err) {
      showMessage('🌐 Network error. Please check your connection.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatShortId = (id) => id?.slice(0, 8) + '…' + id?.slice(-4);

  // Stats calculation
  const stats = {
    total: payouts.length,
    completed: payouts.filter(p => p.status === 'completed').length,
    successRate: payouts.length > 0 
      ? Math.round((payouts.filter(p => p.status === 'completed').length / payouts.length) * 100) 
      : 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-lg">₿</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-800 leading-tight">Payout Engine</h1>
                <p className="text-xs text-slate-400 -mt-0.5">Merchant Dashboard</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {lastUpdated && (
                <span className="text-xs text-slate-400 hidden sm:block">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={fetchData}
                disabled={isLoading}
                className="text-sm text-slate-500 hover:text-indigo-600 disabled:opacity-50 flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                <span className={`transition-transform ${isLoading ? 'animate-spin' : ''}`}>🔄</span>
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ── Alert Banner ── */}
        {msg.text && (
          <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 transition-all ${
            msg.type === 'success' ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' :
            msg.type === 'error' ? 'bg-rose-50/80 border-rose-200 text-rose-800' :
            'bg-sky-50/80 border-sky-200 text-sky-800'
          }`}>
            <span className="text-lg mt-0.5">{msg.type === 'success' ? '✅' : msg.type === 'error' ? '❌' : 'ℹ️'}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{msg.text}</p>
            </div>
            <button onClick={() => setMsg({ text: '', type: '' })} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
        )}

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Available Balance', value: balance !== null ? formatCurrency(balance) : '—', accent: 'text-emerald-600' },
            { label: 'Total Payouts', value: stats.total, accent: 'text-slate-700' },
            { label: 'Completed', value: stats.completed, accent: 'text-emerald-600' },
            { label: 'Success Rate', value: `${stats.successRate}%`, accent: stats.successRate >= 90 ? 'text-emerald-600' : 'text-amber-600' },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.label}</p>
              {isLoading && stat.label === 'Available Balance' ? (
                <Skeleton className="h-7 w-24 mt-1" />
              ) : (
                <p className={`text-2xl font-bold mt-1 ${stat.accent}`}>{stat.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Main Grid: Balance + Form ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          
          {/* Balance Card */}
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-slate-600">Available Balance</p>
              <span className="text-xs text-slate-400 bg-white px-2 py-1 rounded-full border">Live</span>
            </div>
            {isLoading || balance === null ? (
              <Skeleton className="h-12 w-40" />
            ) : (
              <p className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">{formatCurrency(balance)}</p>
            )}
          </div>

          {/* Payout Form */}
          <form onSubmit={submitPayout} className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-5 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-indigo-500 rounded-full" />
              Create New Payout
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (in paise)</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="5000"
                    value={form.amount_paise}
                    onChange={e => setForm({ ...form, amount_paise: e.target.value })}
                    disabled={isSubmitting}
                    className="w-full pl-4 pr-12 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:bg-slate-50 disabled:cursor-not-allowed text-slate-900 placeholder:text-slate-400"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                    ≈ ₹{(Number(form.amount_paise) / 100).toFixed(2) || '0.00'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Enter amount in paise (₹1 = 100 paise)</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Bank Account ID</label>
                <input
                  type="text"
                  required
                  placeholder="ACC_123456789"
                  value={form.bank_account_id}
                  onChange={e => setForm({ ...form, bank_account_id: e.target.value.toUpperCase() })}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:bg-slate-50 disabled:cursor-not-allowed font-mono text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3.5 px-4 rounded-xl font-medium text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                  isSubmitting
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.99] shadow-sm hover:shadow'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <span>Request Payout</span>
                    <span className="text-lg">→</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── Payout History Table ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-800">Payout History</h3>
            <span className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full border">
              {payouts.length} transaction{payouts.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : payouts.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📭</span>
              </div>
              <p className="font-medium text-slate-700 mb-1">No payouts yet</p>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Create your first payout using the form above to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    {['ID', 'Amount', 'Status', 'Bank Account', 'Date'].map((col) => (
                      <th key={col} className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-slate-100 px-2.5 py-1 rounded-lg text-slate-700 font-mono">
                            {formatShortId(p.id)}
                          </code>
                          <CopyButton text={p.id} label="" />
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{formatCurrency(p.amount_paise)}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-slate-600">{p.bank_account_id}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { 
                          day: 'numeric', month: 'short', year: 'numeric' 
                        }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="mt-12 pt-8 border-t border-slate-200/60 text-center">
          <p className="text-sm text-slate-400">
            Built with <span className="text-rose-400">♥</span> for reliable payouts • 
            <span className="font-mono ml-1 text-slate-500">v1.0</span>
          </p>
          <p className="text-xs text-slate-300 mt-1">
            Merchant ID: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{MERCHANT_ID.slice(0, 8)}…</code>
          </p>
        </footer>

      </main>
    </div>
  );
}