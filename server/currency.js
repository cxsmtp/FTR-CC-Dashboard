/**
 * A currency to suggest for an account's impact (soft savings), for the Sales Engineer to confirm: from the account's
 * name (a legal form such as GmbH, Ltd, Pvt Ltd, K.K.), else its team's name or region, else the SE's time zone.
 */
const BY_NAME = [
  [/\b(gmbh|ag|kgaa|s\.?a\.?s|sarl|s\.?r\.?l|s\.?p\.?a|b\.?v|n\.?v|oy|oyj|s\.?a\.?u)\b/i, 'EUR'],
  [/\b(plc|ltd\.? \(uk\)|llp)\b/i, 'GBP'],
  [/\b(pvt\.? ?ltd|private limited)\b/i, 'INR'],
  [/\b(k\.?k\.?|kabushiki)\b/i, 'JPY'],
  [/\bpty\.? ?ltd\b/i, 'AUD'],
  [/\b(ab|asa)\b/i, 'SEK'],
  [/\b(inc|corp|llc)\b/i, 'USD'],
];
const BY_PLACE = [
  [/\b(uk|united kingdom|britain|england|london)\b/i, 'GBP'],
  [/\b(india|bangalore|bengaluru|mumbai|delhi|pune|hyderabad|chennai)\b/i, 'INR'],
  [/\b(japan|tokyo)\b/i, 'JPY'],
  [/\b(anz|australia|sydney|melbourne)\b/i, 'AUD'],
  [/\b(new zealand)\b/i, 'NZD'],
  [/\b(israel|tel aviv)\b/i, 'ILS'],
  [/\b(singapore|sea)\b/i, 'SGD'],
  [/\b(switzerland|swiss|zurich)\b/i, 'CHF'],
  [/\b(nordics?|sweden|stockholm)\b/i, 'SEK'],
  [/\b(uae|dubai|abu dhabi|middle east|mea)\b/i, 'AED'],
  [/\b(saudi|ksa|riyadh)\b/i, 'SAR'],
  [/\b(brazil|latam)\b/i, 'BRL'],
  [/\b(mexico)\b/i, 'MXN'],
  [/\b(canada|toronto)\b/i, 'CAD'],
  [/\b(korea|seoul)\b/i, 'KRW'],
  [/\b(china|greater china)\b/i, 'CNY'],
  [/\b(hong kong)\b/i, 'HKD'],
  [/\b(south africa)\b/i, 'ZAR'],
  [/\b(emea|europe|eu|dach|germany|france|benelux|italy|spain|iberia|nordics)\b/i, 'EUR'],
  [/\b(na|us|usa|americas|north america|amer)\b/i, 'USD'],
  [/\b(apac|asia)\b/i, 'USD'],
];
const BY_ZONE = {
  'Europe/London': 'GBP', 'Europe/Dublin': 'EUR', 'Europe/Zurich': 'CHF', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK', 'Europe/Copenhagen': 'DKK', 'Europe/Warsaw': 'PLN',
  'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Tokyo': 'JPY', 'Asia/Singapore': 'SGD', 'Asia/Jerusalem': 'ILS', 'Asia/Tel_Aviv': 'ILS', 'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Shanghai': 'CNY', 'Asia/Hong_Kong': 'HKD', 'Asia/Seoul': 'KRW', 'Asia/Taipei': 'TWD', 'Asia/Kuala_Lumpur': 'MYR', 'Asia/Jakarta': 'IDR', 'Asia/Bangkok': 'THB', 'Asia/Ho_Chi_Minh': 'VND',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Sao_Paulo': 'BRL', 'America/Mexico_City': 'MXN', 'Africa/Johannesburg': 'ZAR', 'Pacific/Auckland': 'NZD',
};

export function suggestCurrency({ accountName = '', teamNames = [], timeZone = '' } = {}) {
  for (const [re, cur] of BY_NAME) if (re.test(accountName)) return { currency: cur, why: `the account's name (${accountName.match(re)[0]})` };
  for (const name of teamNames) for (const [re, cur] of BY_PLACE) if (re.test(name)) return { currency: cur, why: `the team ${name}` };
  const zone = String(timeZone);
  if (BY_ZONE[zone]) return { currency: BY_ZONE[zone], why: `your time zone (${zone})` };
  if (zone.startsWith('Europe/')) return { currency: 'EUR', why: `your time zone (${zone})` };
  if (zone.startsWith('Australia/')) return { currency: 'AUD', why: `your time zone (${zone})` };
  return { currency: 'USD', why: 'no other clue: US dollars' };
}
