import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
const MERCHANT_ID = '10000000-0000-0000-0000-000000000001';

// Status badge component
const StatusBadge = ({ status }) => {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    processing: 'bg-blue-100 text-blue-800 border-blue-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
  };
  const labels = {
    pending: '⏳ Pending',
    processing: '🔄 Processing',
    completed: '✅ Completed',
    failed: '❌ Failed',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
};

// Loading skeleton component
const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

export default function App() {
  const [balance, setBalance] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [form, setForm] = useState({ amount_paise: '', bank_account_id: '' });
  const [msg, setMsg] = useState({ text: '', type: '' }); // { text, type: 'success'|'error'|'info' }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(iv);
  }, []);

  const showMessage = (text, type = 'info') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const submitPayout = async (e) => {
    e.preventDefault();
    if (!form.amount_paise || !form.bank_account_id) {
      showMessage('Please fill all fields', 'error');
      return;
    }
    setIsSubmitting(true);
    setMsg({ text: 'Processing...', type: 'info' });

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
        showMessage(`✅ Payout #${data.id?.slice(0, 8)}... created`, 'success');
        setForm({ amount_paise: '', bank_account_id: '' });
        fetchData(); // Refresh data
      } else {
        showMessage(`❌ ${data.error || 'Request failed'}`, 'error');
      }
    } catch (err) {
      showMessage('🌐 Network error. Check connection.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (paise) => `₹${(paise / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              ₿
            </div>
            <h1 className="text-xl font-bold text-slate-800">Payout Engine</h1>
          </div>
          <button
            onClick={fetchData}
            className="text-sm text-slate-600 hover:text-indigo-600 flex items-center gap-1 transition-colors"
            disabled={isLoading}
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Message Banner */}
        {msg.text && (
          <div className={`mb-6 p-4 rounded-lg border flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <span className="text-lg">{msg.type === 'success' ? '✅' : msg.type === 'error' ? '❌' : 'ℹ️'}</span>
            <span className="text-sm font-medium">{msg.text}</span>
          </div>
        )}

        {/* Balance & Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Balance Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm font-medium text-slate-500 mb-2">Available Balance</p>
            {isLoading || balance === null ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <p className="text-4xl font-bold text-slate-900">{formatCurrency(balance)}</p>
            )}
            <p className="text-xs text-slate-400 mt-2">Updated automatically every 5 seconds</p>
          </div>

          {/* Payout Form */}
          <form onSubmit={submitPayout} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Create New Payout</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (paise)</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g., 5000 for ₹50.00"
                  value={form.amount_paise}
                  onChange={e => setForm({ ...form, amount_paise: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bank Account ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., ACC_12345"
                  value={form.bank_account_id}
                  onChange={e => setForm({ ...form, bank_account_id: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all ${
                  isSubmitting
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Request Payout →'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Payout History Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Payout History</h3>
            <span className="text-sm text-slate-500">{payouts.length} transaction{payouts.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payouts.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p className="text-4xl mb-2">📭</p>
              <p className="font-medium">No payouts yet</p>
              <p className="text-sm">Create your first payout using the form above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bank Account</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">
                          {p.id?.slice(0, 8)}...
                        </code>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">{formatCurrency(p.amount_paise)}</td>
                      <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                      <td className="px-6 py-4 text-slate-600 font-mono text-sm">{p.bank_account_id}</td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-slate-400">
          <p>Built with ❤️ for reliable payouts • <span className="font-mono">v1.0</span></p>
        </footer>
      </main>
    </div>
  );
}