import { AlertCircle, Loader2 } from 'lucide-react';

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle size={16} /> {message}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm text-slate-500">{message}</p>;
}
