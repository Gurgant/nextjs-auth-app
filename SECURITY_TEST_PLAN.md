# Security Implementation Test Plan

## Overview

This document outlines the testing procedures for the newly implemented security features:

1. Input Validation (Zod)
2. Rate Limiting (LRU Cache)

## Test Environment Setup

```bash
# Start the development server
pnpm run dev

# Optional: Set custom rate limit (default is 10)
AUTH_RATE_LIMIT=5 pnpm run dev
```

## Test Scenarios

### 1. Input Validation Tests

#### Test 1.1: Valid Email Format

- **Input**: `user@example.com`, `password123`
- **Expected**: Normal login flow
- **Verify**: Email is normalized to lowercase

#### Test 1.2: Invalid Email Format

- **Input**: `not-an-email`, `password123`
- **Expected**: Login fails with validation error
- **Console**: Should log "Invalid credentials format"

#### Test 1.3: Email Normalization

- **Input**: `  USER@EXAMPLE.COM  `, `password123`
- **Expected**: Email normalized to `user@example.com`
- **Verify**: Spaces trimmed, lowercase applied

#### Test 1.4: Long Email (DoS Prevention)

- **Input**: `${'a'.repeat(255)}@example.com`, `password123`
- **Expected**: Validation fails - email too long

#### Test 1.5: Long Password (DoS Prevention)

- **Input**: `user@example.com`, `${'a'.repeat(129)}`
- **Expected**: Validation fails - password too long

#### Test 1.6: SQL Injection Attempt

- **Input**: `admin@example.com' OR '1'='1`, `password`
- **Expected**: Validation passes, but no SQL injection occurs
- **Verify**: Prisma parameterizes the query safely

### 2. Rate Limiting Tests

#### Test 2.1: Normal Usage

- **Action**: Login 5 times with wrong password
- **Expected**: All attempts processed normally
- **Verify**: No rate limiting triggered

#### Test 2.2: Rate Limit Trigger

- **Action**: Login 11 times rapidly with wrong password
- **Expected**: 11th attempt blocked
- **Console**: Should log "Rate limit exceeded for email: [email]"

#### Test 2.3: Rate Limit Reset

- **Action**:
  1. Trigger rate limit (11 attempts)
  2. Wait 61 seconds
  3. Try again
- **Expected**: Login attempts work again after 1 minute

#### Test 2.4: Successful Login Resets Counter

- **Action**:
  1. Make 9 failed attempts
  2. Login successfully
  3. Try failed attempts again
- **Expected**: Counter reset, can make 10 more attempts

#### Test 2.5: Different Emails Isolated

- **Action**:
  1. Make 10 attempts with `user1@example.com`
  2. Make attempts with `user2@example.com`
- **Expected**: `user2@example.com` not rate limited

### 3. Integration Tests

#### Test 3.1: OAuth Login Unaffected

- **Action**: Login with Google OAuth
- **Expected**: Works normally, no rate limiting applied

#### Test 3.2: 2FA Flow Works

- **Action**: Login with 2FA enabled account
- **Expected**: Input validation passes, 2FA flow works

#### Test 3.3: Registration Still Works

- **Action**: Register new account
- **Expected**: Existing Zod validation in registration works

## Manual Testing Checklist

- [ ] Valid login works
- [ ] Invalid email format rejected
- [ ] Email normalization works (uppercase → lowercase)
- [ ] Email whitespace trimmed
- [ ] Long email rejected (>254 chars)
- [ ] Long password rejected (>128 chars)
- [ ] SQL injection attempt safe
- [ ] Rate limit blocks after 10 attempts
- [ ] Rate limit resets after 1 minute
- [ ] Successful login resets rate limit
- [ ] Different emails have separate limits
- [ ] Google OAuth login works
- [ ] 2FA flow unaffected
- [ ] Registration flow unaffected

## Monitoring in Production

### Logs to Watch

```bash
# Rate limit hits
grep "Rate limit exceeded" logs/app.log

# Validation failures
grep "Invalid credentials format" logs/app.log

# Auth errors
grep "Auth error:" logs/app.log
```

### Metrics to Track

- Failed login attempts per minute
- Rate limit triggers per hour
- Validation failure patterns
- Average login response time

## Security Improvements Achieved

1. **Input Validation**
   - ✅ Prevents malformed data
   - ✅ Normalizes emails for consistency
   - ✅ Limits input size to prevent DoS
   - ✅ Already protected from SQL injection (Prisma)

2. **Rate Limiting**
   - ✅ Prevents brute force attacks
   - ✅ In-memory, no external dependencies
   - ✅ Configurable via environment variable
   - ✅ Automatically cleans up old entries

## Notes

- Rate limit is per-email, not per-IP (prevents user lockout)
- No user-facing error messages reveal security measures
- All security logs are server-side only
- Consider adding metrics collection for production monitoring
