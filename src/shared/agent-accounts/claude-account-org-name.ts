// A mailbox anyone can have says nothing about the subscription; the account is the person's own.
const PERSONAL_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'yahoo.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'wp.pl',
  'o2.pl',
  'onet.pl',
  'interia.pl'
])

/** A subscription's organisation, its email domain's first label ("moshealth"); null for a personal mailbox. */
export function claudeAccountOrgName(email: string): string | null {
  const domain = email.split('@')[1]?.trim().toLowerCase() ?? ''
  if (!domain || PERSONAL_MAIL_DOMAINS.has(domain)) {
    return null
  }
  return domain.split('.')[0] || domain
}
