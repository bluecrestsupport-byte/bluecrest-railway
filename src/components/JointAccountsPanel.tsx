import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Landmark, LoaderCircle, Plus, Send, ShieldCheck, UserMinus, Users, WalletCards, X } from 'lucide-react';
import DepositPage from './DepositPage';

type Owner = { id: number; user_id: number; role: string; status: string; first_name: string; last_name: string; email: string };
type SharedTransaction = { id: number; type: string; amount: number; currency: string; description: string; created_at: string; transaction_date?: string; performed_by_first_name?: string; performed_by_last_name?: string };
type JointAccount = { id: number; account_number: string; account_type: string; account_kind: string; currency: string; balance: number; owner_role: string; owner_count: number; owners: Owner[]; transactions: SharedTransaction[]; invitations: any[]; shared_cards: any[] };
type Invitation = { id: number; status: string; account_number: string; account_type: string; inviter_first_name: string; inviter_last_name: string; expires_at: string };

const accountLabel = (value: string) => String(value || 'CHECKING').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());

export default function JointAccountsPanel({ currentUser, onBalancesChanged }: { currentUser?: any; onBalancesChanged?: () => void } = {}) {
  const [accounts, setAccounts] = useState<JointAccount[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<Invitation[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [inviteFor, setInviteFor] = useState<number | null>(null);
  const [accountType, setAccountType] = useState('CHECKING');
  const [identifierType, setIdentifierType] = useState('EMAIL');
  const [identifier, setIdentifier] = useState('');
  const [fundFor, setFundFor] = useState<number | null>(null);
  const [fundingSource, setFundingSource] = useState<'PERSONAL' | 'DEPOSIT'>('PERSONAL');
  const [fundAmount, setFundAmount] = useState('');
  const [fundPin, setFundPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ accounts: JointAccount[]; received_invitations: Invitation[] }>('/api/v1/joint-accounts');
      setAccounts((data.accounts || []).filter(account => account.account_kind === 'JOINT'));
      setReceivedInvitations(data.received_invitations || []);
      setError('');
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [load]);

  const run = async (action: () => Promise<any>, success: string) => {
    try {
      setBusy(true); setError(''); setNotice('');
      await action();
      setNotice(success);
      setIdentifier(''); setShowOpenForm(false); setInviteFor(null);
      await load();
    } catch (requestError: any) {
      setError(requestError.message);
    } finally { setBusy(false); }
  };

  const openAccount = async (event: FormEvent) => {
    event.preventDefault();
    await run(() => apiRequest('/api/v1/joint-accounts', {
      method: 'POST',
      body: JSON.stringify({ account_type: accountType, ...(identifier.trim() ? { identifier_type: identifierType, invite_identifier: identifier.trim() } : {}) })
    }), 'Your joint account is ready. You can invite a co-owner at any time.');
  };

  const inviteOwner = async (event: FormEvent, accountId: number) => {
    event.preventDefault();
    await run(() => apiRequest(`/api/v1/joint-accounts/${accountId}/invitations`, {
      method: 'POST', body: JSON.stringify({ identifier_type: identifierType, invite_identifier: identifier.trim() })
    }), 'Joint owner invitation sent.');
  };

  const fundFromPersonal = async (event: FormEvent, account: JointAccount) => {
    event.preventDefault();
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a valid funding amount.');
    try {
      setBusy(true); setError(''); setNotice('');
      await apiRequest(`/api/v1/joint-accounts/${account.id}/fund`, { method: 'POST', body: JSON.stringify({ amount, pin: fundPin }) });
      setFundAmount(''); setFundPin(''); setFundFor(null);
      setNotice(`${formatMoney(account, amount)} was transferred from your personal balance into the joint account.`);
      await load();
      onBalancesChanged?.();
    } catch (requestError: any) { setError(requestError.message); } finally { setBusy(false); }
  };

  const formatMoney = (account: JointAccount, amount = account.balance) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: account.currency || 'USD' }).format(Number(amount || 0)); }
    catch { return `${account.currency || 'USD'} ${Number(amount || 0).toLocaleString()}`; }
  };

  const pendingReceived = receivedInvitations.filter(invitation => invitation.status === 'PENDING');

  return <section className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-sm border border-slate-50 space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
      <div><h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2"><Users className="w-5 h-5 text-[#003399]"/>Joint Accounts</h3><p className="text-xs text-slate-400 mt-1">Share one balance, account number, owners, and transaction history.</p></div>
      <button type="button" onClick={() => setShowOpenForm(value => !value)} className="px-4 py-3 rounded-xl bg-[#003399] text-white text-xs font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>Open Joint Account</button>
    </div>

    {notice && <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-xs font-bold text-emerald-700 flex items-center gap-2"><Check className="w-4 h-4"/>{notice}</div>}
    {error && <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-xs font-bold text-rose-600">{error}</div>}

    {pendingReceived.map(invitation => <div key={invitation.id} className="rounded-3xl border border-blue-100 bg-blue-50 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex gap-3"><div className="w-11 h-11 rounded-2xl bg-white text-[#003399] flex items-center justify-center shrink-0"><Users className="w-5 h-5"/></div><div><p className="text-sm font-extrabold text-slate-800">Joint account invitation</p><p className="text-xs text-slate-600 mt-1">{invitation.inviter_first_name} {invitation.inviter_last_name} invited you to a {accountLabel(invitation.account_type)} account ending in {invitation.account_number.slice(-4)}.</p><p className="text-[9px] text-slate-400 mt-1">Expires {new Date(invitation.expires_at).toLocaleDateString()}</p></div></div>
      <div className="flex gap-2"><button disabled={busy} onClick={() => run(() => apiRequest(`/api/v1/joint-accounts/invitations/${invitation.id}/decline`, { method: 'POST' }), 'Invitation declined.')} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">Decline</button><button disabled={busy} onClick={() => run(() => apiRequest(`/api/v1/joint-accounts/invitations/${invitation.id}/accept`, { method: 'POST' }), 'Joint account invitation accepted.')} className="px-4 py-2.5 rounded-xl bg-[#003399] text-white text-xs font-bold">Accept</button></div>
    </div>)}

    {showOpenForm && <form onSubmit={openAccount} className="rounded-3xl bg-slate-50 border border-slate-100 p-5 space-y-4">
      <div><h4 className="text-sm font-extrabold text-slate-800">Open a shared account</h4><p className="text-[11px] text-slate-400 mt-1">You will be the primary owner. Inviting a co-owner now is optional.</p></div>
      <div className="grid md:grid-cols-2 gap-3"><label><span className="form-label">Account type</span><select className="field-control" value={accountType} onChange={e => setAccountType(e.target.value)}><option value="CHECKING">Joint Checking</option><option value="SAVINGS">Joint Savings</option><option value="FIXED_DEPOSIT">Joint Fixed Deposit</option></select></label><label><span className="form-label">Find co-owner by</span><select className="field-control" value={identifierType} onChange={e => setIdentifierType(e.target.value)}><option value="EMAIL">Email address</option><option value="PHONE">Phone number</option><option value="CUSTOMER_ID">Customer ID</option><option value="USERNAME">Username</option></select></label></div>
      <label><span className="form-label">Co-owner (optional)</span><input className="field-control" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Enter their email, phone, customer ID, or username"/></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowOpenForm(false)} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs font-bold">Cancel</button><button disabled={busy} className="px-5 py-3 rounded-xl bg-[#003399] text-white text-xs font-bold flex items-center gap-2">{busy && <LoaderCircle className="w-4 h-4 animate-spin"/>}Open Account</button></div>
    </form>}

    {loading ? <div className="py-12 flex justify-center"><LoaderCircle className="w-6 h-6 text-[#003399] animate-spin"/></div> : accounts.length === 0 && !showOpenForm ? <div className="rounded-3xl border border-dashed border-slate-200 py-12 px-5 text-center"><Users className="w-9 h-9 text-blue-200 mx-auto"/><p className="mt-3 text-sm font-extrabold text-slate-700">No joint account yet</p><p className="mt-1 text-xs text-slate-400">Open an account and invite someone you trust to share it.</p></div> : <div className="space-y-3">
      {accounts.map(account => <article key={account.id} className="rounded-3xl border border-slate-100 overflow-hidden">
        <button type="button" onClick={() => setExpandedId(expandedId === account.id ? null : account.id)} className="w-full p-5 text-left flex items-center justify-between gap-4 hover:bg-slate-50">
          <div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-extrabold text-slate-800">Joint {accountLabel(account.account_type)}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-extrabold text-[#003399] uppercase">{account.owner_role.replaceAll('_', ' ')}</span></div><p className="mt-1 text-[10px] text-slate-400 font-mono">•••• {account.account_number.slice(-4)} · {account.owner_count} owner{Number(account.owner_count) === 1 ? '' : 's'}</p></div>
          <div className="flex items-center gap-3"><span className="text-base font-extrabold text-slate-900">{formatMoney(account)}</span><ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedId === account.id ? 'rotate-180' : ''}`}/></div>
        </button>

        {expandedId === account.id && <div className="border-t border-slate-100 p-5 space-y-6 bg-slate-50/60">
          <div className="grid sm:grid-cols-3 gap-3"><div className="rounded-2xl bg-[#003399] text-white p-4"><p className="text-[9px] uppercase tracking-widest text-blue-200 font-bold">Shared balance</p><p className="text-xl font-extrabold mt-2">{formatMoney(account)}</p></div><div className="rounded-2xl bg-white border border-slate-100 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Account number</p><p className="text-sm font-extrabold mt-2 font-mono">{account.account_number}</p></div><div className="rounded-2xl bg-white border border-slate-100 p-4"><p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Shared cards</p><p className="text-xs font-bold mt-2 text-slate-500">Future-ready</p></div></div>

          <div className="rounded-3xl bg-white border border-blue-100 p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h5 className="text-sm font-extrabold text-slate-800">Fund this joint account</h5><p className="text-[10px] text-slate-400 mt-1">Either owner can add money and both will see the updated shared balance.</p></div><button type="button" onClick={() => setFundFor(fundFor === account.id ? null : account.id)} className="px-4 py-2.5 rounded-xl bg-[#003399] text-white text-xs font-bold">{fundFor === account.id ? 'Close funding' : 'Add money'}</button></div>
            {fundFor === account.id && <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setFundingSource('PERSONAL')} className={`rounded-2xl border p-3 text-left ${fundingSource === 'PERSONAL' ? 'border-blue-300 bg-blue-50 text-[#003399]' : 'border-slate-100 text-slate-500'}`}><Landmark className="w-4 h-4 mb-2"/><span className="block text-xs font-extrabold">From personal balance</span></button><button type="button" onClick={() => setFundingSource('DEPOSIT')} className={`rounded-2xl border p-3 text-left ${fundingSource === 'DEPOSIT' ? 'border-blue-300 bg-blue-50 text-[#003399]' : 'border-slate-100 text-slate-500'}`}><WalletCards className="w-4 h-4 mb-2"/><span className="block text-xs font-extrabold">Gift card or Bitcoin</span></button></div>
              {fundingSource === 'PERSONAL' ? <form onSubmit={event => fundFromPersonal(event, account)} className="space-y-3"><div className="grid sm:grid-cols-2 gap-3"><label><span className="form-label">Amount</span><input type="number" min="0.01" step="0.01" value={fundAmount} onChange={e => setFundAmount(e.target.value)} className="field-control" placeholder="0.00" required/></label><label><span className="form-label">Transfer PIN</span><input type="password" inputMode="numeric" value={fundPin} onChange={e => setFundPin(e.target.value.replace(/\D/g, ''))} className="field-control" placeholder="Your transfer PIN" required/></label></div>{currentUser && <p className="text-[10px] text-slate-400">Available personal balance: {new Intl.NumberFormat(undefined, { style: 'currency', currency: currentUser.preferred_currency || currentUser.preferredCurrency || account.currency }).format(Number(currentUser.balance || 0))}</p>}<button disabled={busy} className="px-5 py-3 rounded-xl bg-[#003399] text-white text-xs font-bold flex items-center gap-2">{busy && <LoaderCircle className="w-4 h-4 animate-spin"/>}Transfer into joint account</button></form> : <DepositPage compact targetAccountId={account.id} targetAccountLabel={`joint account •••• ${account.account_number.slice(-4)}`} formatCurrency={amount => formatMoney(account, amount)} onSubmitted={load}/>}
            </div>}
          </div>

          <div><div className="flex items-center justify-between mb-3"><h5 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Owners</h5>{account.owner_role === 'PRIMARY_OWNER' && <button type="button" onClick={() => setInviteFor(inviteFor === account.id ? null : account.id)} className="text-[10px] font-bold text-[#003399] flex items-center gap-1"><Plus className="w-3 h-3"/>Invite co-owner</button>}</div>
            <div className="space-y-2">{account.owners.filter(owner => owner.status === 'ACCEPTED').map(owner => <div key={owner.id} className="rounded-2xl bg-white border border-slate-100 p-3 flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-700">{owner.first_name} {owner.last_name}</p><p className="text-[9px] text-slate-400 mt-0.5">{owner.email} · {owner.role.replaceAll('_', ' ')}</p></div>{account.owner_role === 'PRIMARY_OWNER' && owner.role !== 'PRIMARY_OWNER' && <button disabled={busy} title="Remove owner" onClick={() => run(() => apiRequest(`/api/v1/joint-accounts/${account.id}/owners/${owner.id}`, { method: 'DELETE' }), 'Joint owner removed.')} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center"><UserMinus className="w-4 h-4"/></button>}</div>)}</div>
          </div>

          {inviteFor === account.id && <form onSubmit={event => inviteOwner(event, account.id)} className="rounded-2xl bg-white border border-blue-100 p-4 space-y-3"><div className="grid sm:grid-cols-[150px_1fr] gap-2"><select className="field-control" value={identifierType} onChange={e => setIdentifierType(e.target.value)}><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="CUSTOMER_ID">Customer ID</option><option value="USERNAME">Username</option></select><input required className="field-control" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Co-owner identifier"/></div><button disabled={busy} className="px-4 py-2.5 rounded-xl bg-[#003399] text-white text-xs font-bold flex items-center gap-2"><Send className="w-3.5 h-3.5"/>Send invitation</button></form>}

          <div><h5 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-3">Shared transactions</h5>{account.transactions.length === 0 ? <div className="rounded-2xl bg-white border border-slate-100 p-6 text-center text-xs text-slate-400">No shared transactions yet.</div> : <div className="space-y-2">{account.transactions.slice(0, 8).map(transaction => <div key={transaction.id} className="rounded-2xl bg-white border border-slate-100 p-3 flex items-center gap-3"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${transaction.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>{transaction.type === 'CREDIT' ? <ArrowDownLeft className="w-4 h-4"/> : <ArrowUpRight className="w-4 h-4"/>}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 truncate">{transaction.description || accountLabel(transaction.type)}</p><p className="text-[9px] text-slate-400 mt-0.5">Performed by {transaction.performed_by_first_name || 'Account'} {transaction.performed_by_last_name || ''} · {new Date(transaction.transaction_date || transaction.created_at).toLocaleString()}</p></div><span className="text-xs font-extrabold text-slate-800">{formatMoney(account, transaction.amount)}</span></div>)}</div>}</div>

          {account.owner_role !== 'PRIMARY_OWNER' && <button disabled={busy} onClick={() => run(() => apiRequest(`/api/v1/joint-accounts/${account.id}/leave`, { method: 'POST' }), 'You left the joint account.')} className="text-xs font-bold text-rose-600 flex items-center gap-2"><X className="w-4 h-4"/>Leave Joint Account</button>}
          {account.owner_role === 'PRIMARY_OWNER' && <p className="text-[10px] text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5"/>Dual-approval settings are reserved for a future release. This account is already structured to support them.</p>}
        </div>}
      </article>)}
    </div>}
  </section>;
}
