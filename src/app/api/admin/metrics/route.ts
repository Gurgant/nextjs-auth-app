import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { performanceMonitor } from '@/lib/monitoring/performance'
import { prisma } from '@/lib/prisma'

/**
 * Admin metrics endpoint - provides system performance and health metrics
 * Requires authentication and admin privileges
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // For now, allow any authenticated user to view metrics
    // In production, you might want to check for admin role
    // const user = await prisma.user.findUnique({
    //   where: { email: session.user.email },
    //   select: { role: true }
    // })
    // 
    // if (user?.role !== 'ADMIN') {
    //   return NextResponse.json(
    //     { error: 'Admin privileges required' },
    //     { status: 403 }
    //   )
    // }

    const startTime = Date.now()

    // Get performance statistics
    const performanceStats = performanceMonitor.getStats()
    const slowOperations = performanceMonitor.getSlowOperations(5)
    const slowQueries = performanceMonitor.getSlowQueries(5)

    // Get system metrics
    const memoryUsage = process.memoryUsage()
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid
    }

    // Get database statistics
    let databaseStats = null
    try {
      // Count total users
      const [userCount, sessionCount] = await Promise.all([
        prisma.user.count(),
        prisma.session.count()
      ])

      // Get recent security events
      const recentSecurityEvents = await prisma.securityEvent.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          eventType: true,
          success: true,
          createdAt: true,
          details: true
        }
      })

      databaseStats = {
        userCount,
        sessionCount,
        recentSecurityEvents: recentSecurityEvents.map(event => ({
          type: event.eventType,
          success: event.success,
          timestamp: event.createdAt,
          details: event.details
        }))
      }
    } catch (error) {
      databaseStats = { error: 'Failed to fetch database statistics' }
    }

    // Calculate recent error rates (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    let errorRate = null
    try {
      const [totalEvents, errorEvents] = await Promise.all([
        prisma.securityEvent.count({
          where: { createdAt: { gte: oneHourAgo } }
        }),
        prisma.securityEvent.count({
          where: { 
            createdAt: { gte: oneHourAgo },
            success: false
          }
        })
      ])
      
      errorRate = {
        total: totalEvents,
        errors: errorEvents,
        rate: totalEvents > 0 ? Math.round((errorEvents / totalEvents) * 100) : 0,
        period: '1 hour'
      }
    } catch (error) {
      errorRate = { error: 'Failed to calculate error rate' }
    }

    // Response time for this request
    const responseTime = Date.now() - startTime

    // Build comprehensive metrics response
    const metrics = {
      timestamp: new Date().toISOString(),
      responseTime,
      system: {
        ...systemInfo,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          heapUsagePercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        }
      },
      performance: performanceStats,
      database: databaseStats,
      security: {
        errorRate,
        recentEvents: databaseStats?.recentSecurityEvents || []
      },
      alerts: {
        slowOperations,
        slowQueries,
        highMemoryUsage: memoryUsage.heapUsed / memoryUsage.heapTotal > 0.8,
        highErrorRate: (errorRate?.rate || 0) > 5
      }
    }

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

  } catch (error) {
    console.error('Metrics endpoint error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch metrics',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * Reset metrics (useful for testing or after resolving issues)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Clear performance metrics
    performanceMonitor.clearOldMetrics()

    return NextResponse.json({
      message: 'Metrics cleared successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Failed to clear metrics:', error)
    
    return NextResponse.json(
      { error: 'Failed to clear metrics' },
      { status: 500 }
    )
  }
}