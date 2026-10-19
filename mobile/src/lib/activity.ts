import { formatMoney, isSupportedCurrency } from './money';

function money(data: Record<string, unknown>) {
  const amount = typeof data.amountMinor === 'number' ? data.amountMinor : null;
  const currency = typeof data.currency === 'string' && isSupportedCurrency(data.currency) ? data.currency : null;
  return amount !== null && currency ? formatMoney(amount, currency) : '';
}

export function describeActivity(
  item: { type: string; data: Record<string, unknown> | null; subjectName?: string | null },
  viewerId: string,
): string {
  const d = item.data ?? {};
  const title = typeof d.title === 'string' ? `“${d.title}”` : 'an expense';
  const amount = money(d);
  switch (item.type) {
    case 'expense.created':
      return `added ${title}${amount ? ` · ${amount}` : ''}`;
    case 'expense.updated':
      if (d.done === true) return `marked ${title} as done`;
      if (d.done === false) return `marked ${title} as not done`;
      return `edited ${title}`;
    case 'expense.deleted':
      return `deleted ${title}${amount ? ` · ${amount}` : ''}`;
    case 'settlement.created': {
      const from = d.fromUserId === viewerId ? 'you' : ((d.fromName as string) ?? 'someone');
      const to = d.toUserId === viewerId ? 'you' : ((d.toName as string) ?? 'someone');
      return `recorded that ${from} paid ${to} ${amount}`;
    }
    case 'settlement.deleted':
      return `undid a repayment of ${amount}`;
    case 'group.created':
      return 'created the group';
    case 'group.updated':
      return 'updated the group details';
    case 'member.joined':
      return 'joined the group';
    case 'member.added':
      return `added ${item.subjectName ?? 'a member'}`;
    case 'member.left':
      return 'left the group';
    case 'member.removed':
      return `removed ${item.subjectName ?? 'a member'}`;
    case 'member.role_changed':
      return `made ${item.subjectName ?? 'a member'} ${d.role === 'admin' ? 'an admin' : 'a member'}`;
    case 'invitation.created':
      return 'invited you to a group';
    default:
      return 'made a change';
  }
}

/** Maps a web link stored on a notification to the matching app screen. */
export function appRouteFor(href: string): string | null {
  let m = /^\/groups\/([\w-]+)\/expenses\/([\w-]+)/.exec(href);
  if (m) return `/expense/${m[2]}`;
  m = /^\/groups\/([\w-]+)\/settle/.exec(href);
  if (m) return `/group/${m[1]}/settle`;
  m = /^\/groups\/([\w-]+)/.exec(href);
  if (m) return `/group/${m[1]}`;
  m = /^\/invite\/([\w-]+)/.exec(href);
  if (m) return `/join?token=${m[1]}`;
  return null;
}
