import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../lib/api';
import type { PublicSponsor } from '../../types';

interface SponsorsBarProps {
  tournamentId?: string;
  title?: string;
}

function Logo({ sponsor, height }: { sponsor: PublicSponsor; height: number }) {
  const [failed, setFailed] = useState(false);

  if (!sponsor.logo || failed) {
    return <span className="px-2 text-sm font-semibold text-slate-600">{sponsor.name}</span>;
  }
  return (
    <img
      src={sponsor.logo}
      alt={sponsor.name}
      loading="lazy"
      style={{ height }}
      className="w-auto max-w-[180px] object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function SponsorItem({ sponsor, height }: { sponsor: PublicSponsor; height: number }) {
  const content = <Logo sponsor={sponsor} height={height} />;

  if (!sponsor.website) return <div title={sponsor.description ?? sponsor.name}>{content}</div>;

  return (
    <a
      href={sponsor.website}
      target="_blank"
      rel="noopener noreferrer sponsored"
      title={sponsor.description ?? sponsor.name}
      onClick={() => void api.post(`/sponsors/${sponsor._id}/click`).catch(() => undefined)}
      className="opacity-90 transition hover:opacity-100"
    >
      {content}
    </a>
  );
}

export function SponsorsBar({ tournamentId, title = 'Patrocinadores' }: SponsorsBarProps) {
  const path = tournamentId ? `/sponsors?tournament=${tournamentId}&exclusive=1` : '/sponsors';
  const { data } = useFetch<PublicSponsor[]>(path);

  if (!data || data.length === 0) return null;

  const main = data.filter((sponsor) => sponsor.tier === 'Principal');
  const others = data.filter((sponsor) => sponsor.tier !== 'Principal');

  return (
    <section aria-label={title} className="no-print space-y-4 border-t border-slate-200 pt-6">
      <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {main.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-8">
          {main.map((sponsor) => (
            <SponsorItem key={sponsor._id} sponsor={sponsor} height={56} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-6">
          {others.map((sponsor) => (
            <SponsorItem key={sponsor._id} sponsor={sponsor} height={32} />
          ))}
        </div>
      )}
    </section>
  );
}
