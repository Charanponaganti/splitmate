import { cn, initials } from "@/lib/utils";

const PALETTE = [
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

export function UserAvatar({
  name,
  image,
  id,
  size = "sm",
  className,
}: {
  name: string;
  image?: string | null;
  id?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        SIZES[size],
        !image && colorFor(id ?? name),
        className,
      )}
      title={name}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "xs",
}: {
  people: { id: string; name: string; image: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <UserAvatar key={p.id} id={p.id} name={p.name} image={p.image} size={size} className="ring-2 ring-card" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-card",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
