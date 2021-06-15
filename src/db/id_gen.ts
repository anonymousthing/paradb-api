import crypto from 'crypto';

export const enum IdDomain {
  USERS = 'U',
  MAPS = 'M',
}
const ID_LENGTH = 6;
export function idGen(domain: IdDomain) {
  return domain + crypto.randomBytes(Math.ceil(ID_LENGTH / 2)).toString('hex').slice(0, ID_LENGTH).toUpperCase();
}
