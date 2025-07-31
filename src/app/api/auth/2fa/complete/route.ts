import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { userId, callbackUrl } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Missing userId' },
        { status: 400 }
      )
    }

    // Verify the temporary 2FA session exists
    if (!global.tempAuth2FA?.has(userId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired 2FA session' },
        { status: 401 }
      )
    }

    const tempSession = global.tempAuth2FA.get(userId)
    
    // Check if session is not too old (5 minutes max)
    if (Date.now() - tempSession.timestamp > 5 * 60 * 1000) {
      global.tempAuth2FA.delete(userId)
      return NextResponse.json(
        { success: false, message: '2FA session expired' },
        { status: 401 }
      )
    }

    // Get user data to create session
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        twoFactorEnabled: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      )
    }

    // Update user's last login
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date()
      }
    })

    // Mark 2FA as completed instead of deleting
    if (global.tempAuth2FA?.has(userId)) {
      const tempSession = global.tempAuth2FA.get(userId)
      tempSession.completed = true
      tempSession.completedAt = Date.now()
      global.tempAuth2FA.set(userId, tempSession)
      
      console.log('🔓 2FA completed for user:', user.email)
    }

    // Return success with user data for session creation
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image
      },
      callbackUrl: callbackUrl || '/dashboard'
    })

  } catch (error) {
    console.error('2FA completion error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('userId')
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  if (!userId) {
    return NextResponse.redirect(new URL('/auth/signin?error=missing_params', request.url))
  }

  // Verify the temporary 2FA session exists
  if (!global.tempAuth2FA?.has(userId)) {
    return NextResponse.redirect(new URL('/auth/signin?error=expired_session', request.url))
  }

  const tempSession = global.tempAuth2FA.get(userId)
  
  // Check if session is not too old (5 minutes max)
  if (Date.now() - tempSession.timestamp > 5 * 60 * 1000) {
    global.tempAuth2FA.delete(userId)
    return NextResponse.redirect(new URL('/auth/signin?error=expired_session', request.url))
  }

  try {
    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        twoFactorEnabled: true
      }
    })

    if (!user) {
      return NextResponse.redirect(new URL('/auth/signin?error=user_not_found', request.url))
    }

    // Update user's last login
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date()
      }
    })

    // Mark 2FA as completed instead of deleting
    if (global.tempAuth2FA?.has(userId)) {
      const tempSession = global.tempAuth2FA.get(userId)
      tempSession.completed = true
      tempSession.completedAt = Date.now()
      global.tempAuth2FA.set(userId, tempSession)
      
      console.log('🔓 2FA completed for user:', user.email)
    }

    // Create a response that will establish the session
    const response = NextResponse.redirect(new URL(callbackUrl, request.url))
    
    // Set session cookies manually or redirect to NextAuth callback
    // For simplicity, we'll redirect to the NextAuth callback with special params
    const callbackRedirect = new URL('/api/auth/callback/credentials', request.url)
    callbackRedirect.searchParams.set('2fa_completed', 'true')
    callbackRedirect.searchParams.set('userId', userId)
    callbackRedirect.searchParams.set('callbackUrl', callbackUrl)

    return NextResponse.redirect(callbackRedirect)

  } catch (error) {
    console.error('2FA completion error:', error)
    return NextResponse.redirect(new URL('/auth/signin?error=completion_failed', request.url))
  }
}