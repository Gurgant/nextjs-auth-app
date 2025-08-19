/**
 * Request utility functions for extracting information from NextRequest
 */

import { NextRequest } from 'next/server'

/**
 * Extract client IP address from request headers
 * Handles various proxy configurations and header formats
 */
export function getClientIP(request: NextRequest): string | null {
  // Try various headers that might contain the real IP
  const headers = [
    'x-forwarded-for',
    'x-real-ip', 
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ]

  for (const header of headers) {
    const value = request.headers.get(header)
    if (value) {
      // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
      // The first one is usually the original client IP
      const ips = value.split(',').map(ip => ip.trim())
      const firstIP = ips[0]
      
      // Basic validation - ensure it looks like an IP
      if (firstIP && isValidIP(firstIP)) {
        return firstIP
      }
    }
  }

  // Fallback for development/local testing
  return '127.0.0.1'
}

/**
 * Basic IP address validation
 */
function isValidIP(ip: string): boolean {
  // IPv4 regex pattern
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  
  // IPv6 regex pattern (simplified)
  const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/
  
  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip)
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: NextRequest): string | null {
  return request.headers.get('user-agent')
}

/**
 * Get request ID for logging/tracing
 * Uses existing header or generates a new one
 */
export function getRequestId(request: NextRequest): string {
  // Check for existing request ID from load balancer/proxy
  const existingId = request.headers.get('x-request-id') || 
                    request.headers.get('x-trace-id') ||
                    request.headers.get('x-correlation-id')
  
  if (existingId) {
    return existingId
  }
  
  // Generate a simple request ID
  return Math.random().toString(36).substr(2, 9)
}

/**
 * Extract request metadata for logging
 */
export function getRequestMetadata(request: NextRequest) {
  return {
    ip: getClientIP(request),
    userAgent: getUserAgent(request),
    requestId: getRequestId(request),
    method: request.method,
    url: request.url,
    referer: request.headers.get('referer'),
    origin: request.headers.get('origin')
  }
}