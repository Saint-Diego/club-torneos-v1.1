import type { TeamBrief } from '../../types';

interface TeamBadgeProps {
  team: Pick<TeamBrief, 'name' | 'shield' | 'colors'>;
  size?: number;
}

export function TeamBadge({ team, size = 28 }: TeamBadgeProps) {
  if (team.shield) {
    return <img src={team.shield} alt={team.name} width={size} height={size} className="rounded-full object-contain" />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: team.colors.primary, color: team.colors.secondary }}
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-bold"
    >
      {team.name.charAt(0).toUpperCase()}
    </span>
  );
}
