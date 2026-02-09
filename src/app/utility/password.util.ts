import * as CryptoJS from 'crypto-js';

/**
 * Hash password: MD5 แล้วตามด้วย SHA256
 * @param password - รหัสผ่านที่ต้องการ hash
 * @returns รหัสผ่านที่ hash แล้ว
 */
export function hashPassword(password: string): string {
  const md5Hash = CryptoJS.MD5(password).toString();
  // const sha256Hash = CryptoJS.SHA256(md5Hash).toString();
  return md5Hash;
}


