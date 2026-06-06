import { describe, expect, it } from 'vitest';
import { redactSecrets, redactObject } from '../../../src/services/security/redactSecrets';

describe('redactSecrets — 审计 P5 修复: 敏感信息过滤', () => {
  describe('整段值模式 (WHOLE_VALUE_PATTERNS)', () => {
    it('过滤 OpenAI sk- 风格 key', () => {
      expect(redactSecrets('sk-abc1234567890xyz')).toBe('[REDACTED]');
    });

    it('过滤 Groq gsk- 风格 key', () => {
      expect(redactSecrets('gsk-abc1234567890xyz')).toBe('[REDACTED]');
    });

    it('过滤 Google AIza 风格 key', () => {
      expect(redactSecrets('AIzaSyAbc1234567890xyz')).toBe('[REDACTED]');
    });

    it('过滤 Bearer Token', () => {
      expect(redactSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9abcdefghijklmnopq')).toContain('Bearer [REDACTED]');
    });

    it('过滤 JWT', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSIsImlhdCI6MTcwMDAwMDAwMH0.abcdefghijklmnop';
      expect(redactSecrets(`token: ${jwt}`)).not.toContain(jwt);
      expect(redactSecrets(`token: ${jwt}`)).toContain('[REDACTED]');
    });

    it('过滤 aeslan- 内部种子', () => {
      expect(redactSecrets('aeslan-device-seed-abc12345')).toBe('[REDACTED]');
    });

    it('不误伤短字符串 (sk- 后 16 字符以下)', () => {
      expect(redactSecrets('sk-short')).toBe('sk-short');
    });
  });

  describe('字段名:值 模式 (FIELD_PATTERNS)', () => {
    it('过滤 apiKey 字段 (带引号)', () => {
      expect(redactSecrets('apiKey: "sk-abc123def456ghi789"')).toContain('apiKey');
      expect(redactSecrets('apiKey: "sk-abc123def456ghi789"')).toContain('[REDACTED]');
      expect(redactSecrets('apiKey: "sk-abc123def456ghi789"')).not.toContain('sk-abc');
    });

    it('过滤 password 字段 (带引号)', () => {
      expect(redactSecrets('password: "mypassword123"')).toContain('[REDACTED]');
    });

    it('过滤 token 字段', () => {
      expect(redactSecrets('token: "abcdefghijklmnopqrst"')).toContain('[REDACTED]');
    });

    it('过滤 secret 字段', () => {
      expect(redactSecrets('secret: "mysecretvalue"')).toContain('[REDACTED]');
    });
  });

  describe('redactObject 深度过滤', () => {
    it('对纯字符串走 redactSecrets', () => {
      expect(redactObject('sk-abc1234567890xyz')).toBe('[REDACTED]');
    });

    it('对对象中 apiKey 字段整值替换', () => {
      const input = { apiKey: 'sk-abc123def456ghi789', name: 'test' };
      const out = redactObject(input);
      expect((out as any).apiKey).toBe('[REDACTED]');
      expect((out as any).name).toBe('test');
    });

    it('对 password 字段整值替换', () => {
      const input = { password: 'mypassword', username: 'alice' };
      const out = redactObject(input);
      expect((out as any).password).toBe('[REDACTED]');
      expect((out as any).username).toBe('alice');
    });

    it('对 token 字段整值替换', () => {
      const input = { token: 'longtokenvalue123456', userId: 1 };
      const out = redactObject(input);
      expect((out as any).token).toBe('[REDACTED]');
      expect((out as any).userId).toBe(1);
    });

    it('递归处理嵌套对象', () => {
      const input = {
        llm: { apiKey: 'sk-abc', endpoint: 'https://api.deepseek.com' },
        player: { name: 'alice' },
      };
      const out = redactObject(input) as any;
      expect(out.llm.apiKey).toBe('[REDACTED]');
      expect(out.llm.endpoint).toBe('https://api.deepseek.com');
      expect(out.player.name).toBe('alice');
    });

    it('递归处理数组', () => {
      const input = ['sk-abc1234567890xyz', 'normal text', { apiKey: 'foo' }];
      const out = redactObject(input) as any[];
      expect(out[0]).toBe('[REDACTED]');
      expect(out[1]).toBe('normal text');
      expect(out[2].apiKey).toBe('[REDACTED]');
    });

    it('处理 null / undefined', () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });

    it('处理数字 / 布尔', () => {
      expect(redactObject(123)).toBe(123);
      expect(redactObject(true)).toBe(true);
    });
  });
});
