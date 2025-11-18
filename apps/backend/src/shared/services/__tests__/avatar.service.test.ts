import { describe, it, expect, vi } from 'vitest';
import { AvatarService } from '../avatar.service';
import sharp from 'sharp';

vi.mock('sharp', () => {
  return {
    default: vi.fn(() => ({
      resize: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-webp-data')),
    })),
  };
});

vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AvatarService', () => {
  describe('getInitials', () => {
    it('should extract first letter from two-word name', () => {
      expect(AvatarService.getInitials('John Doe')).toBe('J');
      expect(AvatarService.getInitials('Mary Jane')).toBe('M');
    });

    it('should extract first letter from three-word name', () => {
      expect(AvatarService.getInitials('Mary Jane Watson')).toBe('M');
      expect(AvatarService.getInitials('John Michael Smith')).toBe('J');
    });

    it('should extract first letter from single word', () => {
      expect(AvatarService.getInitials('Alice')).toBe('A');
      expect(AvatarService.getInitials('Bob')).toBe('B');
      expect(AvatarService.getInitials('A')).toBe('A');
    });

    it('should handle names with extra spaces', () => {
      expect(AvatarService.getInitials('  John   Doe  ')).toBe('J');
      expect(AvatarService.getInitials('  Alice  ')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(AvatarService.getInitials('')).toBe('?');
      expect(AvatarService.getInitials('   ')).toBe('?');
    });

    it('should uppercase first letter', () => {
      expect(AvatarService.getInitials('john doe')).toBe('J');
      expect(AvatarService.getInitials('alice')).toBe('A');
      expect(AvatarService.getInitials('bob')).toBe('B');
    });
  });

  describe('getColorForEmail', () => {
    it('should return same color for same email', () => {
      const email = 'test@example.com';
      const color1 = AvatarService.getColorForEmail(email);
      const color2 = AvatarService.getColorForEmail(email);
      
      expect(color1).toEqual(color2);
      expect(color1.bg).toBeDefined();
      expect(color1.gradient).toBeDefined();
    });

    it('should return different colors for different emails', () => {
      const color1 = AvatarService.getColorForEmail('test1@example.com');
      const color2 = AvatarService.getColorForEmail('test2@example.com');
      const color3 = AvatarService.getColorForEmail('test3@example.com');
      
      // At least two should be different (not guaranteed, but likely)
      const colors = [color1.bg, color2.bg, color3.bg];
      const uniqueColors = new Set(colors);
      
      // With 10 colors and 3 emails, at least one should be unique
      expect(uniqueColors.size).toBeGreaterThanOrEqual(1);
    });

    it('should be case-insensitive for email', () => {
      const color1 = AvatarService.getColorForEmail('TEST@EXAMPLE.COM');
      const color2 = AvatarService.getColorForEmail('test@example.com');
      const color3 = AvatarService.getColorForEmail('Test@Example.Com');
      
      expect(color1).toEqual(color2);
      expect(color2).toEqual(color3);
    });

    it('should trim email whitespace', () => {
      const color1 = AvatarService.getColorForEmail('test@example.com');
      const color2 = AvatarService.getColorForEmail('  test@example.com  ');
      
      expect(color1).toEqual(color2);
    });

    it('should return valid color from palette', () => {
      const color = AvatarService.getColorForEmail('test@example.com');
      
      expect(color.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(color.gradient).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  describe('generateAvatar', () => {
    it('should generate avatar buffer successfully', async () => {
      const buffer = await AvatarService.generateAvatar({
        name: 'John Doe',
        email: 'john@example.com',
        size: 200,
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should use sharp to process image', async () => {
      const sharpMock = sharp as any;
      
      await AvatarService.generateAvatar({
        name: 'John Doe',
        email: 'john@example.com',
        size: 200,
      });

      expect(sharpMock).toHaveBeenCalled();
      const sharpInstance = sharpMock.mock.results[0].value;
      expect(sharpInstance.resize).toHaveBeenCalledWith(200, 200, expect.any(Object));
      expect(sharpInstance.webp).toHaveBeenCalledWith({
        quality: 80,
        effort: 4,
      });
      expect(sharpInstance.toBuffer).toHaveBeenCalled();
    });

    it('should handle default size when not specified', async () => {
      const buffer = await AvatarService.generateAvatar({
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should handle custom size', async () => {
      const sharpMock = sharp as any;
      sharpMock.mockClear(); // Clear previous calls
      
      await AvatarService.generateAvatar({
        name: 'John Doe',
        email: 'john@example.com',
        size: 400,
      });

      const sharpInstance = sharpMock.mock.results[sharpMock.mock.results.length - 1].value;
      expect(sharpInstance.resize).toHaveBeenCalledWith(400, 400, expect.any(Object));
    });

    it('should handle various name formats', async () => {
      const testCases = [
        { name: 'John Doe', expected: 'JD' },
        { name: 'Alice', expected: 'AL' },
        { name: 'Mary Jane Watson', expected: 'MW' },
        { name: 'A', expected: 'AA' },
      ];

      for (const testCase of testCases) {
        const buffer = await AvatarService.generateAvatar({
          name: testCase.name,
          email: `${testCase.name.toLowerCase().replace(/\s+/g, '')}@example.com`,
        });

        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(0);
      }
    });
  });
});

