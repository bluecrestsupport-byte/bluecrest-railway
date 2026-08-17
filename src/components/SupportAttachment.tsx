import { ImageIcon, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAuthToken } from '../lib/auth-storage';

export type SupportAttachmentMeta = {
  id: number;
  original_name: string;
  mime_type: string;
  byte_size: number;
};

export default function SupportAttachment({ attachment }: { attachment: SupportAttachmentMeta }) {
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    fetch(`/api/v1/support/attachments/${attachment.id}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    })
      .then(response => {
        if (!response.ok) throw new Error('Attachment unavailable');
        return response.blob();
      })
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => { if (active) setError(true); });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (error) return <div className="flex items-center gap-2 rounded-xl border border-current/10 bg-black/5 p-3 text-[10px] font-bold opacity-70"><ImageIcon className="h-4 w-4" /> Image unavailable</div>;
  if (!imageUrl) return <div className="flex h-28 items-center justify-center rounded-xl bg-black/5"><LoaderCircle className="h-5 w-5 animate-spin opacity-50" /></div>;

  return <button type="button" onClick={() => window.open(imageUrl, '_blank', 'noopener,noreferrer')} className="block w-full overflow-hidden rounded-xl border border-black/10 bg-black/5 text-left" title={`Open ${attachment.original_name}`}>
    <img src={imageUrl} alt={attachment.original_name || 'Support attachment'} className="max-h-64 w-full object-contain" />
    <span className="block truncate px-2.5 py-2 text-[9px] font-semibold opacity-70">{attachment.original_name}</span>
  </button>;
}
