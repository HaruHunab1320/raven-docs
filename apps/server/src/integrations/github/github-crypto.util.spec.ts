import { encryptToken, decryptToken } from './github-crypto.util';

describe('GitHub Crypto Util', () => {
  const appSecret = 'test-app-secret-that-is-at-least-32-chars-long';

  it('should encrypt and decrypt a token', () => {
    const token = 'gho_abc123def456';
    const encrypted = encryptToken(token, appSecret);
    const decrypted = decryptToken(encrypted, appSecret);

    expect(decrypted).toBe(token);
  });

  it('should produce different ciphertexts for the same input (random IV)', () => {
    const token = 'gho_abc123def456';
    const encrypted1 = encryptToken(token, appSecret);
    const encrypted2 = encryptToken(token, appSecret);

    expect(encrypted1).not.toBe(encrypted2);

    // Both should decrypt to the same value
    expect(decryptToken(encrypted1, appSecret)).toBe(token);
    expect(decryptToken(encrypted2, appSecret)).toBe(token);
  });

  it('should produce output in iv:authTag:ciphertext format', () => {
    const encrypted = encryptToken('test', appSecret);
    const parts = encrypted.split(':');

    expect(parts).toHaveLength(3);
    // Each part should be valid base64
    parts.forEach((part) => {
      expect(() => Buffer.from(part, 'base64')).not.toThrow();
    });
  });

  it('should fail decryption with wrong secret', () => {
    const encrypted = encryptToken('gho_abc123', appSecret);

    expect(() => decryptToken(encrypted, 'wrong-secret-that-is-long-enough')).toThrow();
  });

  it('should fail decryption with tampered ciphertext', () => {
    const encrypted = encryptToken('gho_abc123', appSecret);
    const parts = encrypted.split(':');
    // Tamper with the ciphertext
    const tampered = [parts[0], parts[1], 'AAAA' + parts[2]].join(':');

    expect(() => decryptToken(tampered, appSecret)).toThrow();
  });

  it('should throw on invalid encrypted token format', () => {
    expect(() => decryptToken('invalid', appSecret)).toThrow(
      'Invalid encrypted token format',
    );
    expect(() => decryptToken('a:b', appSecret)).toThrow(
      'Invalid encrypted token format',
    );
  });

  it('should handle empty string token', () => {
    const encrypted = encryptToken('', appSecret);
    const decrypted = decryptToken(encrypted, appSecret);
    expect(decrypted).toBe('');
  });

  it('should handle long tokens', () => {
    const longToken = 'gho_' + 'a'.repeat(1000);
    const encrypted = encryptToken(longToken, appSecret);
    const decrypted = decryptToken(encrypted, appSecret);
    expect(decrypted).toBe(longToken);
  });
});
