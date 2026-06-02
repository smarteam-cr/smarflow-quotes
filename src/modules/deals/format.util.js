const DEFAULT_TIME_ZONE = 'America/Guatemala';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function multilineToHtml(value) {
  if (value == null || value === '') return '';
  return escapeHtml(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '<br>');
}

export function formatNumber(value) {
  const number = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatMoney(value, currencyCode) {
  const number = formatNumber(value);
  if (number === '') return '';
  const code = currencyCode ? String(currencyCode).trim() : '';
  return code ? `${code} ${number}` : number;
}

export function formatDate(value, timeZone) {
  if (value == null || value === '') return '';
  const date = /^\d+$/.test(String(value))
    ? new Date(Number(value))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('es-GT', {
      ...options,
      timeZone: timeZone || DEFAULT_TIME_ZONE,
    });
  } catch {
    formatter = new Intl.DateTimeFormat('es-GT', {
      ...options,
      timeZone: DEFAULT_TIME_ZONE,
    });
  }
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')}`;
}
