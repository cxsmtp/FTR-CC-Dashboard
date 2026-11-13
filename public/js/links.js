// What people type that must be read the same way everywhere: a Salesforce link and email addresses. One copy, used
// by the dashboard's pages and by the calculator (it is part of the calculator's bundle too, server/calculator.js).

/**
 * A Salesforce link, read as the server reads it (server/accounts.js checkSalesforceUrl): https, an opportunity (006)
 * or an account (001) whose object in a Lightning link agrees, and an 18-character id whose last three letters check.
 */
export function sfRead(value) {
  const text = String(value ?? '').trim();
  if (!text) return { error: 'Paste the opportunity or account link from Salesforce.' };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'That is not a link: copy it from the address bar of the opportunity or account.' };
  }
  if (url.protocol !== 'https:' || url.username || url.password) return { error: 'Give the https link from the address bar.' };
  if (!/(^|\.)(force\.com|salesforce\.com|lightning\.force\.com)$/i.test(url.hostname)) return { error: `${url.hostname} is not Salesforce.` };
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts.find((p) => /^(001|006)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(p)) ?? '';
  const kind = id.startsWith('006') ? 'opportunity' : id.startsWith('001') ? 'account' : '';
  const object = parts.includes('r') ? (parts[parts.indexOf('r') + 1] ?? '').toLowerCase() : '';
  if (!kind || (object && object !== kind)) return { error: `That link is to ${object && object !== 'r' ? `a ${object}` : 'something else'}: open the opportunity (006…) or the account (001…).` };
  if (id.length === 18) {
    const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    let sum = '';
    for (let b = 0; b < 3; b++) {
      let n = 0;
      for (let i = 0; i < 5; i++) if (/[A-Z]/.test(id[b * 5 + i])) n |= 1 << i;
      sum += map[n];
    }
    if (sum !== id.slice(15)) return { error: `The id ${id} is not a whole Salesforce id: copy the link again.` };
  }
  return { kind, id, label: `${kind === 'opportunity' ? 'Opportunity' : 'Account'} ${id}` };
}

/** Email addresses typed for "shared with": one or more, comma or space between; null when one is not an address. */
export function emailList(value) {
  const list = String(value ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  return list.length && list.every((e) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(e)) ? list : null;
}
