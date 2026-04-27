import { useState, useEffect } from 'react';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
const MERCHANT_ID = '10000000-0000-0000-0000-000000000001';

export default function App() {
  const [balance, setBalance] = useState(0);
  const [payouts, setPayouts] = useState([]);
  const [form, setForm] = useState({ amount_paise: '', bank_account_id: '' });
  const [msg, setMsg] = useState('');

  const fetchData = async () => {
    const [balRes, payRes] = await Promise.all([
      fetch(`${API_URL}/merchant/balance`, { headers: { 'Merchant-Id': MERCHANT_ID } }),
      fetch(`${API_URL}/payouts/history`, { headers: { 'Merchant-Id': MERCHANT_ID } }).catch(() => ({ json: () => [] }))
    ]);
    console.log('Balance response:', balRes); 
    console.log('Payouts response:', payRes);
    if(balRes.ok) setBalance((await balRes.json()).available_balance);
    if(payRes.ok) setPayouts(await payRes.json());
  };

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 3000); return () => clearInterval(iv); }, []);

  const submitPayout = async (e) => {
    e.preventDefault(); setMsg('Processing...');
    try {
      const res = await fetch(`${API_URL}/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Merchant-Id': MERCHANT_ID, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) { setMsg(`Success: ${data.id}`); setForm({ amount_paise: '', bank_account_id: '' }); fetchData(); }
      else setMsg(`Error: ${data.error}`);
    } catch (err) { setMsg('Network error'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-mono">
      <h1 className="text-2xl font-bold mb-4">Payout Engine</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded border shadow"><p className="text-gray-500">Available Balance</p><p className="text-2xl">₹{(balance/100).toFixed(2)}</p></div>
        <form onSubmit={submitPayout} className="bg-white p-4 rounded border shadow flex flex-col gap-3">
          <input placeholder="Amount (paise)" type="number" required value={form.amount_paise} onChange={e=>setForm({...form, amount_paise: e.target.value})} className="border p-2 rounded"/>
          <input placeholder="Bank Account ID" required value={form.bank_account_id} onChange={e=>setForm({...form, bank_account_id: e.target.value})} className="border p-2 rounded"/>
          <button type="submit" className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Request Payout</button>
          {msg && <p className="text-sm text-gray-600">{msg}</p>}
        </form>
      </div>
      <table className="w-full bg-white rounded border shadow overflow-hidden">
        <thead className="bg-gray-100 text-left"><tr><th className="p-3">ID</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Bank</th></tr></thead>
        <tbody>{payouts.map(p => (<tr key={p.id} className="border-t hover:bg-gray-50"><td className="p-3 text-xs">{p.id.substring(0,8)}...</td><td className="p-3">₹{(p.amount_paise/100).toFixed(2)}</td><td className={`p-3 font-bold ${p.status==='completed'?'text-green-600':p.status==='failed'?'text-red-600':'text-yellow-600'}`}>{p.status}</td><td className="p-3 text-gray-500">{p.bank_account_id}</td></tr>))}</tbody>
      </table>
    </div>
  );
}
