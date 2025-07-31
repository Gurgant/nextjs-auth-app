import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { linkToken, oauthData } = await request.json()

    // Validate required fields
    if (!linkToken || !oauthData) {
      return NextResponse.json(
        { error: 'Link token and OAuth data are required' },
        { status: 400 }
      )
    }

    // Find and validate the link request
    const linkRequest = await prisma.accountLinkRequest.findUnique({
      where: { token: linkToken },
      include: { user: { include: { accounts: true } } }
    })

    if (!linkRequest) {
      return NextResponse.json(
        { error: 'Invalid or expired link token' },
        { status: 404 }
      )
    }

    // Check if token is expired
    if (linkRequest.expires < new Date()) {
      return NextResponse.json(
        { error: 'Link token has expired' },
        { status: 400 }
      )
    }

    // Check if already completed
    if (linkRequest.completed) {
      return NextResponse.json(
        { error: 'Link request already completed' },
        { status: 400 }
      )
    }

    const { user } = linkRequest
    const { provider, providerAccountId, profile } = oauthData

    // Validate provider matches the request
    if (linkRequest.requestType !== `link_${provider}`) {
      return NextResponse.json(
        { error: 'Provider mismatch' },
        { status: 400 }
      )
    }

    // Check if this external account is already linked to another user
    const existingAccount = await prisma.account.findFirst({
      where: {
        provider,
        providerAccountId
      }
    })

    if (existingAccount && existingAccount.userId !== user.id) {
      return NextResponse.json(
        { error: 'This external account is already linked to another user' },
        { status: 400 }
      )
    }

    // Check if user already has this provider linked
    const userHasProvider = user.accounts.some(acc => acc.provider === provider)
    if (userHasProvider) {
      return NextResponse.json(
        { error: 'User already has this provider linked' },
        { status: 400 }
      )
    }

    // Begin transaction to link account
    const result = await prisma.$transaction(async (tx) => {
      // Create the account link
      const account = await tx.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider,
          providerAccountId,
          access_token: oauthData.access_token,
          refresh_token: oauthData.refresh_token,
          expires_at: oauthData.expires_at,
          token_type: oauthData.token_type,
          scope: oauthData.scope,
          id_token: oauthData.id_token
        }
      })

      // Update user flags
      const updateData: any = {}
      if (provider === 'google') {
        updateData.hasGoogleAccount = true
      }

      // Update user metadata
      if (profile?.name && !user.name) {
        updateData.name = profile.name
      }
      if (profile?.image && !user.image) {
        updateData.image = profile.image
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: updateData
      })

      // Mark link request as completed
      await tx.accountLinkRequest.update({
        where: { id: linkRequest.id },
        data: { 
          completed: true,
          metadata: {
            ...linkRequest.metadata,
            completedAt: new Date().toISOString(),
            linkedAccountId: account.id
          }
        }
      })

      // Log security event
      await tx.securityEvent.create({
        data: {
          userId: user.id,
          eventType: 'account_linked',
          details: `Successfully linked ${provider} account`,
          success: true,
          metadata: {
            provider,
            providerAccountId,
            linkRequestId: linkRequest.id,
            accountId: account.id
          }
        }
      })

      return { account, updatedUser }
    })

    return NextResponse.json({
      success: true,
      message: 'Account linked successfully',
      provider,
      linkedAt: new Date().toISOString()
    })

  } catch (error) {
    console.error('Account linking completion error:', error)

    // Try to log the error if we have a valid linkToken
    try {
      const { linkToken } = await request.json()
      if (linkToken) {
        const linkRequest = await prisma.accountLinkRequest.findUnique({
          where: { token: linkToken }
        })
        
        if (linkRequest) {
          await prisma.securityEvent.create({
            data: {
              userId: linkRequest.userId,
              eventType: 'account_link_failed',
              details: 'Account linking failed during completion',
              success: false,
              metadata: {
                error: error instanceof Error ? error.message : 'Unknown error',
                linkRequestId: linkRequest.id
              }
            }
          })
        }
      }
    } catch (logError) {
      console.error('Failed to log account linking error:', logError)
    }

    return NextResponse.json(
      { error: 'Failed to complete account linking' },
      { status: 500 }
    )
  }
}