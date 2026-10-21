import type { LucideIcon } from 'lucide-react';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
}

export function Tabs<K extends string>({ items, active, onChange }: TabsProps<K>) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map(({ key, label, icon: Icon }) => {
        const selected = key === active;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(key)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              selected
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {Icon && <Icon size={16} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
