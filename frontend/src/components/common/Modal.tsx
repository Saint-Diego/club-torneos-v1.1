import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
