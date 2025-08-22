#!/usr/bin/env node

/**
 * Test script to verify email configuration with Resend
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

async function testEmailConfiguration() {
  console.log('🧪 Testing Email Configuration...\n');
  
  // Check environment variables
  const hasResendKey = !!process.env.RESEND_API_KEY;
  const hasEmailFrom = !!process.env.EMAIL_FROM;
  const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;
  const hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;
  
  console.log('📋 Environment Variables Check:');
  console.log(`  ✅ RESEND_API_KEY: ${hasResendKey ? 'Set (' + process.env.RESEND_API_KEY.slice(0, 10) + '...)' : '❌ Missing'}`);
  console.log(`  ✅ EMAIL_FROM: ${hasEmailFrom ? process.env.EMAIL_FROM : '❌ Missing'}`);
  console.log(`  ✅ ENCRYPTION_KEY: ${hasEncryptionKey ? 'Set (' + process.env.ENCRYPTION_KEY.slice(0, 5) + '...)' : '❌ Missing'}`);
  console.log(`  ✅ NEXTAUTH_SECRET: ${hasNextAuthSecret ? 'Set (' + process.env.NEXTAUTH_SECRET.slice(0, 5) + '...)' : '❌ Missing'}`);
  
  if (!hasResendKey || !hasEmailFrom) {
    console.error('\n❌ Email configuration incomplete. Please set RESEND_API_KEY and EMAIL_FROM in your .env files');
    process.exit(1);
  }
  
  // Test Resend API connection
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    console.log('\n📧 Testing Resend API Connection...');
    
    // Try to send a test email
    const testEmail = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_FROM, // Send to self for testing
      subject: 'Test Email - NextJS Auth App',
      html: `
        <h2>Email Configuration Test</h2>
        <p>This is a test email to verify your Resend configuration.</p>
        <p>If you received this email, your configuration is working correctly!</p>
        <ul>
          <li>✅ RESEND_API_KEY is valid</li>
          <li>✅ EMAIL_FROM is configured</li>
          <li>✅ Email service is operational</li>
        </ul>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `
    };
    
    console.log(`  Sending test email to: ${process.env.EMAIL_FROM}`);
    const result = await resend.emails.send(testEmail);
    
    if (result.id) {
      console.log(`  ✅ Email sent successfully! ID: ${result.id}`);
      console.log('\n🎉 Email configuration is working correctly!');
    } else {
      console.log('  ⚠️ Email sent but no ID returned');
      console.log('  Result:', result);
    }
    
  } catch (error) {
    console.error('\n❌ Email test failed:', error.message);
    if (error.message.includes('401')) {
      console.error('  → Invalid API key. Please check your RESEND_API_KEY');
    } else if (error.message.includes('403')) {
      console.error('  → Permission denied. Check your Resend domain verification');
    } else {
      console.error('  → Error details:', error);
    }
    process.exit(1);
  }
  
  // Test encryption functionality
  console.log('\n🔐 Testing Encryption Configuration...');
  try {
    const crypto = require('crypto');
    const testData = 'test-2fa-secret';
    
    // Modern encryption test with IV
    const algorithm = 'aes-256-cbc';
    const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    
    // Encryption
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(testData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Decryption  
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    if (decrypted === testData) {
      console.log('  ✅ Encryption/Decryption working correctly');
    } else {
      console.log('  ❌ Encryption/Decryption mismatch');
    }
  } catch (error) {
    console.error('  ❌ Encryption test failed:', error.message);
  }
  
  console.log('\n✅ All configuration tests completed!');
}

// Run the test
testEmailConfiguration().catch(console.error);