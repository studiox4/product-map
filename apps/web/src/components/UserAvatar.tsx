import type { User } from '@productmap/shared';
import { cn } from '@productmap/ui/lib/utils';

const SIZE_CLASSES = {
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-7 w-7 text-xs',
} as const;

export type UserAvatarSize = keyof typeof SIZE_CLASSES;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function UserAvatar({
  user,
  size = 'md',
  className,
}: {
  user: Pick<User, 'name' | 'color'>;
  size?: UserAvatarSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        SIZE_CLASSES[size],
        className,
      )}
      style={{ backgroundColor: user.color }}
      title={user.name}
      aria-label={user.name}
    >
      {initials(user.name)}
    </span>
  );
}

export default UserAvatar;
