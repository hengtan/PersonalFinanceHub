// backend/src/shared/utils/encryption.util.ts
import crypto from 'crypto';

export class EncryptionUtil {
    private static readonly algorithm = 'aes-256-gcm';
    private static readonly keyLength = 32;
    private static readonly ivLength = 16;
    private static readonly tagLength = 16;

    static encrypt(text: string, key: string): string {
        const keyBuffer = crypto.scryptSync(key, 'salt', this.keyLength);
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipher(this.algorithm, keyBuffer);
        cipher.setAAD(Buffer.from('additional-data'));

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag();

        return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
    }

    static decrypt(encryptedText: string, key: string): string {
        const [ivHex, tagHex, encrypted] = encryptedText.split(':');
        const keyBuffer = crypto.scryptSync(key, 'salt', this.keyLength);
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');

        const decipher = crypto.createDecipher(this.algorithm, keyBuffer);
        decipher.setAAD(Buffer.from('additional-data'));
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    static hashPassword(password: string): string {
        const saltRounds = 12;
        return crypto.pbkdf2Sync(password, 'salt', saltRounds, 64, 'sha512').toString('hex');
    }

    static generateSecureToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }
}
