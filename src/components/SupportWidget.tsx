import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BanknoteArrowDown,
  CircleUserRound,
  CreditCard,
  FileCheck2,
  Headphones,
  KeyRound,
  Landmark,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Send,
  X
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import SupportAttachment, { type SupportAttachmentMeta } from './SupportAttachment';

type Message = { id: number; sender_role: 'USER' | 'ADMIN'; message: string; created_at: string; attachments?: SupportAttachmentMeta[] };

type SupportWidgetProps = {
  isAuthenticated?: boolean;
  embedded?: boolean;
};

const quickMessages = [
  { label: 'Account help', message: 'I need help with my account.', icon: CircleUserRound },
  { label: 'Make a deposit', message: 'I need help making or confirming a deposit.', icon: BanknoteArrowDown },
  { label: 'Bank transfer', message: 'I need help with a bank transfer.', icon: Landmark },
  { label: 'Insurance code', message: 'I need help obtaining or using my Cross Border Insurance Code.', icon: KeyRound },
  { label: 'Loans', message: 'I have a question about a loan application or disbursement.', icon: BadgeDollarSign },
  { label: 'KYC verification', message: 'I need help completing my KYC identity verification.', icon: FileCheck2 },
  { label: 'Cards', message: 'I need help with my debit card or card application.', icon: CreditCard }
];

export default function SupportWidget({ isAuthenticated = true, embedded = false }: SupportWidgetProps) {
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showGreeting, setShowGreeting] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const messageList = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await apiRequest<{ messages: Message[] }>('/api/v1/support/conversation');
      setMessages(data.messages || []);
      setError('');
    } catch (err: any) { setError(err.message); }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    load();
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [open, isAuthenticated, load]);

  const latestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [latestMessageId]);
  useEffect(() => { if (embedded) setOpen(true); }, [embedded]);

  const sendMessage = async (message: string, image: File | null = null) => {
    const trimmedMessage = message.trim();
    if ((!trimmedMessage && !image) || !isAuthenticated || sending) return;
    try {
      setSending(true);
      setError('');
      const attachment = image ? {
        name: image.name,
        data_url: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read the selected image'));
          reader.readAsDataURL(image);
        })
      } : undefined;
      await apiRequest('/api/v1/support/messages', {
        method: 'POST',
        body: JSON.stringify({ message: trimmedMessage, attachment })
      });
      setText('');
      setSelectedImage(null);
      setSelectedImageUrl('');
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (err: any) { setError(err.message); } finally { setSending(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    await sendMessage(text, selectedImage);
  };

  const chooseImage = (file?: File) => {
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Support images must be 3 MB or smaller.');
      return;
    }
    setSelectedImage(file);
    setSelectedImageUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  useEffect(() => () => {
    if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
  }, [selectedImageUrl]);

  return <>
    {open && <section className={embedded
      ? "mx-auto flex h-[min(720px,calc(100dvh-9rem))] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"
      : "fixed z-[100] bottom-24 right-3 sm:right-5 md:right-7 w-[calc(100vw-1.5rem)] max-w-[390px] h-[min(650px,calc(100dvh-7.5rem))] bg-white border border-slate-200 rounded-[1.75rem] shadow-[0_24px_70px_rgba(15,23,42,0.25)] overflow-hidden flex flex-col"} aria-label="Customer support chat" role={embedded ? undefined : 'dialog'}>
      <header className="bg-gradient-to-br from-[#003399] to-[#0755c9] text-white p-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center ring-1 ring-white/20">
            <Headphones className="w-5 h-5"/>
            <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0755c9]" />
          </div>
          <div><h2 className="font-extrabold leading-tight">Blue Crest Support</h2><p className="text-[11px] text-blue-100 mt-0.5">We’re here to help with your banking</p></div>
        </div>
        {!embedded && <button type="button" onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="Close support"><X className="w-5 h-5"/></button>}
      </header>

      <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400 mb-2">Quick help</p>
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar" aria-label="Quick support messages">
          {quickMessages.map(item => <button key={item.label} type="button" disabled={sending || !isAuthenticated} onClick={() => sendMessage(item.message)} className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#003399] hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><item.icon className="w-3.5 h-3.5"/>{item.label}</button>)}
        </div>
      </div>

      <div ref={messageList} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 custom-scrollbar">
        {messages.length === 0 && <div className="pt-2">
          <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-md p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Hi! How can we help you today?</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">Choose a common topic below or type your question. A support specialist will reply here.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {quickMessages.map(item => <button key={item.label} type="button" disabled={sending || !isAuthenticated} onClick={() => sendMessage(item.message)} className="min-h-16 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"><item.icon className="w-4 h-4 text-[#003399] mb-2"/><span className="block text-[11px] leading-tight font-bold text-slate-700">{item.label}</span></button>)}
          </div>
        </div>}
        {messages.map(item => <div key={item.id} className={`flex ${item.sender_role === 'USER' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-3 rounded-2xl ${item.sender_role === 'USER' ? 'bg-[#003399] text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md'}`}>{!(item.attachments?.length && item.message === 'Image attachment') && <p className="text-sm whitespace-pre-wrap break-words">{item.message}</p>}{item.attachments?.length ? <div className={`${item.message !== 'Image attachment' ? 'mt-2' : ''} space-y-2`}>{item.attachments.map(attachment => <div key={attachment.id}><SupportAttachment attachment={attachment} /></div>)}</div> : null}<p className={`text-[8px] mt-1.5 ${item.sender_role === 'USER' ? 'text-blue-200' : 'text-slate-400'}`}>{new Date(item.created_at).toLocaleString()}</p></div></div>)}
      </div>

      {!isAuthenticated && <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800"><span className="font-bold">Sign in to start a conversation.</span> Your messages will then be saved to your account.</div>}
      {error && <p className="px-4 py-2 bg-rose-50 text-rose-600 text-xs font-semibold">{error}</p>}
      <form onSubmit={send} className="p-3 border-t border-slate-100 bg-white shrink-0 space-y-2">
        {selectedImage && selectedImageUrl && <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-2"><img src={selectedImageUrl} alt="Selected support attachment" className="h-14 w-14 rounded-lg object-cover"/><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-bold text-slate-700">{selectedImage.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{(selectedImage.size / 1024).toFixed(0)} KB · Never upload passwords, PINs, CVVs, or recovery phrases.</p></div><button type="button" onClick={() => { setSelectedImage(null); setSelectedImageUrl(''); if (fileInput.current) fileInput.current.value = ''; }} className="h-8 w-8 rounded-lg bg-white text-slate-500"><X className="mx-auto h-4 w-4"/></button></div>}
        <div className="flex gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)} disabled={!isAuthenticated} rows={2} maxLength={4000} placeholder={isAuthenticated ? 'Type your message…' : 'Sign in to message support'} className="flex-1 resize-none rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 disabled:cursor-not-allowed"/>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => chooseImage(event.target.files?.[0])}/>
          <button type="button" disabled={sending || !isAuthenticated} onClick={() => fileInput.current?.click()} aria-label="Attach support image" className="w-11 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center disabled:opacity-40"><Paperclip className="w-4 h-4"/></button>
          <button disabled={sending || !isAuthenticated || (!text.trim() && !selectedImage)} aria-label="Send support message" className="w-12 rounded-xl bg-[#003399] text-white flex items-center justify-center disabled:opacity-40">{sending ? <LoaderCircle className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}</button>
        </div>
      </form>
    </section>}

    {!embedded && !open && showGreeting && <div className="fixed z-[98] bottom-[10.5rem] right-3 flex max-w-[calc(100vw-1.5rem)] items-start gap-2 sm:right-5 lg:bottom-[5.75rem] lg:right-7">
      <button type="button" onClick={() => { setOpen(true); setShowGreeting(false); }} className="bg-white border border-slate-200 rounded-2xl rounded-br-sm px-4 py-3 shadow-xl text-left hover:border-blue-200 transition-colors"><span className="block text-sm font-extrabold text-slate-800">Need help?</span><span className="block text-[11px] text-slate-500 mt-0.5">Chat with Blue Crest Support</span></button>
      <button type="button" onClick={() => setShowGreeting(false)} className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center shadow-md" aria-label="Dismiss support greeting"><X className="w-3.5 h-3.5"/></button>
    </div>}

    {!embedded && <button type="button" onClick={() => { setOpen(value => !value); setShowGreeting(false); }} className="fixed z-[99] bottom-24 right-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#0755c9] to-[#003399] text-white shadow-[0_14px_35px_rgba(0,51,153,0.38)] ring-4 ring-white transition-transform hover:scale-105 active:scale-95 sm:right-5 lg:bottom-5 lg:right-7 lg:h-16 lg:w-16" aria-label={open ? 'Close customer support' : 'Open customer support'}>
      {open ? <X className="w-7 h-7"/> : <MessageCircle className="w-7 h-7 fill-white/20"/>}
      {!open && <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-emerald-400 border-[3px] border-white" />}
    </button>}
  </>;
}
