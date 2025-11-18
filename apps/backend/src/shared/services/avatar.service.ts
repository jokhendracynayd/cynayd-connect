import sharp from 'sharp';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

// Gmail-style color palette with good contrast for white text
const COLOR_PALETTE = [
  { bg: '#4285F4', gradient: '#5A9AF7' }, // Blue
  { bg: '#34A853', gradient: '#4FB863' }, // Green
  { bg: '#FBBC04', gradient: '#FBC43C' }, // Yellow
  { bg: '#EA4335', gradient: '#ED6656' }, // Red
  { bg: '#FF9800', gradient: '#FFB040' }, // Orange
  { bg: '#9C27B0', gradient: '#B042C4' }, // Purple
  { bg: '#00BCD4', gradient: '#1AD4EA' }, // Teal
  { bg: '#E91E63', gradient: '#EC3A73' }, // Pink
  { bg: '#3F51B5', gradient: '#5765C5' }, // Indigo
  { bg: '#00ACC1', gradient: '#1ABDD6' }, // Cyan
];

interface GenerateAvatarOptions {
  name: string;
  email: string;
  size?: number;
}

/**
 * Extract first letter from user name (capitalized)
 * Examples: "John Doe" -> "J", "Mary Jane Watson" -> "M", "Alice" -> "A"
 */
function getInitials(name: string): string {
  const trimmedName = name.trim();
  
  if (trimmedName.length === 0) {
    return '?';
  }
  
  // Take only the first letter of the entire name, capitalized
  return trimmedName[0].toUpperCase();
}

/**
 * Get deterministic color based on email hash
 * Same email will always produce the same color
 */
function getColorForEmail(email: string): { bg: string; gradient: string } {
  const hash = createHash('md5').update(email.toLowerCase().trim()).digest('hex');
  const index = parseInt(hash.substring(0, 8), 16) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

/**
 * Generate SVG avatar with initials and gradient background
 */
function generateAvatarSVG(
  initials: string,
  colors: { bg: string; gradient: string },
  size: number
): string {
  const fontSize = Math.round(size * 0.4); // 40% of size for text
  const fontWeight = 600;
  
  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${colors.gradient};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#grad)" />
      <text
        x="${size / 2}"
        y="${size / 2}"
        dominant-baseline="central"
        text-anchor="middle"
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="${fontSize}px"
        font-weight="${fontWeight}"
        fill="white"
        style="user-select: none; dominant-baseline: central; text-anchor: middle;"
      >
        ${initials}
      </text>
    </svg>
  `.trim();
}

export class AvatarService {
  /**
   * Generate avatar image as WebP buffer
   * @param options Avatar generation options
   * @returns Buffer containing optimized WebP image
   */
  static async generateAvatar(options: GenerateAvatarOptions): Promise<Buffer> {
    const { name, email, size = 200 } = options;
    
    // Extract initials
    const initials = getInitials(name);
    
    // Get deterministic color
    const colors = getColorForEmail(email);
    
    // Generate SVG
    const svg = generateAvatarSVG(initials, colors, size);
    
    try {
      // Convert SVG to optimized WebP using Sharp
      const webpBuffer = await sharp(Buffer.from(svg))
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({
          quality: 80,
          effort: 4, // Balance between compression time and file size
        })
        .toBuffer();
      
      logger.debug('Avatar generated successfully', {
        email,
        initials,
        size: webpBuffer.length,
        color: colors.bg,
      });
      
      return webpBuffer;
    } catch (error) {
      logger.error('Failed to generate avatar', {
        email,
        error,
      });
      throw new Error(`Avatar generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get initials for a given name (useful for testing or display)
   */
  static getInitials(name: string): string {
    return getInitials(name);
  }
  
  /**
   * Get color for a given email (useful for testing)
   */
  static getColorForEmail(email: string): { bg: string; gradient: string } {
    return getColorForEmail(email);
  }
}

