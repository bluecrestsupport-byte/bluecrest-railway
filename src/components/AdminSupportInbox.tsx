import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, LoaderCircle, MessageCircle, Send } from 'lucide-react';
import { apiRequest } from '../lib/api';
import SupportAttachment from './SupportAttachment';

const urlBase64ToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
};

export default function AdminSupportInbox() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const messageList = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setThreads(await apiRequest<any[]>('/api/v1/admin/support/conversations'));
    setError('');
  }, []);
  const loadThread = useCallback(async (id: number) => {
    const data = await apiRequest<any>(`/api/v1/admin/support/conversations/${id}`);
    setSelected(data.conversation); setMessages(data.messages || []); setError('');
  }, []);
  const openThread = useCallback((id: number) => loadThread(id).catch(requestError => setError(requestError.message)), [loadThread]);
  useEffect(() => {
    loadThreads().catch(requestError => setError(requestError.message));
    const requestedId = Number(new URLSearchParams(window.location.search).get('support'));
    if (requestedId) openThread(requestedId);
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        loadThreads().catch(requestError => setError(requestError.message));
      }
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadThreads, openThread]);
  useEffect(() => {
    if (!selected?.id) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') loadThread(selected.id).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [selected?.id, loadThread]);
  const latestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [latestMessageId]);

  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support phone alerts.');
      const registration = await navigator.serviceWorker.register('/support-sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const { public_key } = await apiRequest<{ public_key: string }>('/api/v1/push/public-key');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) });
      await apiRequest('/api/v1/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
      setNotice('Android support alerts are enabled on this device.');
    } catch (error: any) { setNotice(error.message); }
  };

  const reply = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !text.trim()) return;
    try { setBusy(true); await apiRequest(`/api/v1/admin/support/conversations/${selected.id}`, { method: 'POST', body: JSON.stringify({ message: text.trim() }) }); setText(''); await loadThread(selected.id); await loadThreads(); } finally { setBusy(false); }
  };
  const updateStatus = async (status: string) => { if (!selected) return; await apiRequest(`/api/v1/admin/support/conversations/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadThread(selected.id); await loadThreads(); };

  return <div className="space-y-4">
    <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"><div><h3 className="font-extrabold text-slate-900">Persistent support inbox</h3><p className="text-xs text-slate-400 mt-1">Customer conversations remain available across every session and device.</p></div><button onClick={enablePush} className="px-4 py-3 rounded-xl bg-[#003399] text-white text-xs font-bold flex items-center gap-2"><BellRing className="w-4 h-4"/>Enable phone alerts</button></div>
    {notice && <div className="p-3 rounded-xl bg-blue-50 text-[#003399] text-xs font-bold">{notice}</div>}
    {error && <div className="p-3 rounded-xl border border-rose-100 bg-rose-50 text-rose-600 text-xs font-bold">{error}</div>}
    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden grid lg:grid-cols-[320px_1fr] min-h-[600px]">
      <aside className="border-r border-slate-100 overflow-y-auto max-h-[700px]"><div className="p-4 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">Conversations ({threads.length})</div>{threads.length === 0 ? <p className="p-8 text-center text-xs text-slate-400">No support conversations yet.</p> : threads.map(thread => <button key={thread.id} onClick={() => openThread(thread.id)} className={`w-full p-4 text-left border-b border-slate-50 ${selected?.id === thread.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><div className="flex justify-between gap-2"><p className="text-sm font-bold text-slate-800 truncate">{thread.first_name} {thread.last_name}</p>{Number(thread.unread_count) > 0 && <span className="w-5 h-5 rounded-full bg-[#003399] text-white text-[9px] flex items-center justify-center">{thread.unread_count}</span>}</div><p className="text-[10px] text-slate-400 mt-1 truncate">{thread.last_message}</p><span className="mt-2 inline-block text-[8px] font-bold uppercase text-slate-400">{thread.status}</span></button>)}</aside>
      {!selected ? <div className="flex flex-col items-center justify-center text-slate-400 p-8"><MessageCircle className="w-10 h-10 mb-3"/><p className="text-sm font-bold">Select a conversation</p></div> : <section className="flex flex-col min-w-0"><header className="p-4 border-b border-slate-100 flex flex-wrap gap-3 justify-between"><div><h4 className="font-extrabold text-slate-900">{selected.first_name} {selected.last_name}</h4><p className="text-[10px] text-slate-400">{selected.email} · #{selected.account_number}</p></div><select value={selected.status} onChange={e => updateStatus(e.target.value)} className="field-control max-w-32"><option>OPEN</option><option>PENDING</option><option>CLOSED</option></select></header><div ref={messageList} className="flex-1 p-4 bg-slate-50 overflow-y-auto max-h-[540px] space-y-3">{messages.map(message => <div key={message.id} className={`flex ${message.sender_role === 'ADMIN' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] p-3 rounded-2xl ${message.sender_role === 'ADMIN' ? 'bg-[#003399] text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>{!(message.attachments?.length && message.message === 'Image attachment') && <p className="text-sm whitespace-pre-wrap">{message.message}</p>}{message.attachments?.length ? <div className={`${message.message !== 'Image attachment' ? 'mt-2' : ''} space-y-2`}>{message.attachments.map((attachment: any) => <div key={attachment.id}><SupportAttachment attachment={attachment} /></div>)}</div> : null}<p className="text-[8px] opacity-60 mt-1">{new Date(message.created_at).toLocaleString()}</p></div></div>)}</div><form onSubmit={reply} className="p-3 border-t border-slate-100 flex gap-2"><textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Reply to customer…" className="flex-1 resize-none field-control py-2"/><button disabled={busy || !text.trim()} className="w-12 rounded-xl bg-[#003399] text-white flex items-center justify-center disabled:opacity-50">{busy ? <LoaderCircle className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}</button></form></section>}
    </div>
  </div>;
}
