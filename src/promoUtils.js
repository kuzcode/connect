export function parsePromoAmount(amount) {
  const raw = Math.floor(Number(amount) || 0);
  const str = String(raw);
  if (!str.startsWith('999') || str.length <= 3) {
    return { kind: 'discount', stars: Math.max(0, raw) };
  }
  const days = parseInt(str.slice(3), 10);
  if (days > 0) return { kind: 'freeDays', days };
  return { kind: 'discount', stars: Math.max(0, raw) };
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function formatPayedUntilLabel(payedUntilIso) {
  if (!payedUntilIso) return null;
  const d = new Date(payedUntilIso);
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getDate();
  const month = MONTHS_GENITIVE[d.getMonth()] || '';
  return `Оплачен до ${day} ${month}`;
}

export function getDaysUntilPayedUntil(payedUntilIso) {
  if (!payedUntilIso) return Infinity;
  const t = new Date(payedUntilIso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (t - Date.now()) / (24 * 60 * 60 * 1000);
}

export function computePayedUntilAfterDays(days, baseIso = null) {
  const now = new Date();
  let base = baseIso ? new Date(baseIso) : now;
  if (!Number.isFinite(base.getTime()) || base < now) base = now;
  const d = new Date(base);
  d.setDate(d.getDate() + Math.max(1, Math.floor(days)));
  return d.toISOString();
}

export function computeExtendedPayedUntil(currentPayedUntilIso, months) {
  const now = new Date();
  let base = currentPayedUntilIso ? new Date(currentPayedUntilIso) : now;
  if (!Number.isFinite(base.getTime()) || base < now) base = now;
  const d = new Date(base);
  d.setMonth(d.getMonth() + Math.max(1, Math.floor(months)));
  return d.toISOString();
}
