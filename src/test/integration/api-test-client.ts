import { NextRequest, NextResponse } from 'next/server'
import { Session } from 'next-auth'
import { testAuth } from '../utils/test-auth'
import { generate } from '../utils/test-utils'

/**
 * API test client for integration testing
 */
export class ApiTestClient {
  private baseUrl: string
  private headers: Record<string, string> = {}
  private cookies: Record<string, string> = {}
  private session?: Session | null

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl
  }

  /**
   * Set authentication session
   */
  authenticated(session: Session): this {
    this.session = session
    const token = testAuth.createSessionToken({
      sub: session.user?.id,
      email: session.user?.email,
      name: session.user?.name
    })
    this.setAuthToken(token)
    return this
  }

  /**
   * Set bearer token
   */
  setAuthToken(token: string): this {
    this.headers.Authorization = `Bearer ${token}`
    return this
  }

  /**
   * Set custom headers
   */
  setHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers }
    return this
  }

  /**
   * Set cookies
   */
  setCookies(cookies: Record<string, string>): this {
    this.cookies = { ...this.cookies, ...cookies }
    return this
  }

  /**
   * Clear authentication
   */
  unauthenticated(): this {
    this.session = null
    delete this.headers.Authorization
    return this
  }

  /**
   * Make GET request
   */
  async get<T = any>(
    path: string,
    params?: Record<string, any>
  ): Promise<ApiTestResponse<T>> {
    const url = this.buildUrl(path, params)
    return this.request<T>('GET', url)
  }

  /**
   * Make POST request
   */
  async post<T = any>(
    path: string,
    body?: any
  ): Promise<ApiTestResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('POST', url, body)
  }

  /**
   * Make PUT request
   */
  async put<T = any>(
    path: string,
    body?: any
  ): Promise<ApiTestResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('PUT', url, body)
  }

  /**
   * Make PATCH request
   */
  async patch<T = any>(
    path: string,
    body?: any
  ): Promise<ApiTestResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('PATCH', url, body)
  }

  /**
   * Make DELETE request
   */
  async delete<T = any>(
    path: string
  ): Promise<ApiTestResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('DELETE', url)
  }

  /**
   * Make raw request
   */
  private async request<T>(
    method: string,
    url: string,
    body?: any
  ): Promise<ApiTestResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers
    }

    // Add cookies if any
    if (Object.keys(this.cookies).length > 0) {
      headers.Cookie = Object.entries(this.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ')
    }

    const requestInit: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }

    const startTime = Date.now()
    const response = await fetch(url, requestInit)
    const duration = Date.now() - startTime

    let data: any
    const contentType = response.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    return new ApiTestResponse<T>(
      response.status,
      data,
      response.headers,
      duration
    )
  }

  /**
   * Build full URL
   */
  private buildUrl(path: string, params?: Record<string, any>): string {
    const url = new URL(path, this.baseUrl)
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value))
      })
    }
    
    return url.toString()
  }

  /**
   * Clone the client
   */
  clone(): ApiTestClient {
    const cloned = new ApiTestClient(this.baseUrl)
    cloned.headers = { ...this.headers }
    cloned.cookies = { ...this.cookies }
    cloned.session = this.session
    return cloned
  }
}

/**
 * API test response wrapper
 */
export class ApiTestResponse<T = any> {
  constructor(
    public readonly status: number,
    public readonly data: T,
    public readonly headers: Headers,
    public readonly duration: number
  ) {}

  /**
   * Check if response is successful
   */
  get ok(): boolean {
    return this.status >= 200 && this.status < 300
  }

  /**
   * Get JSON data (alias for data)
   */
  get json(): T {
    return this.data
  }

  /**
   * Assert status code
   */
  assertStatus(expectedStatus: number): this {
    if (this.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${this.status}\nResponse: ${JSON.stringify(this.data, null, 2)}`
      )
    }
    return this
  }

  /**
   * Assert success
   */
  assertOk(): this {
    if (!this.ok) {
      throw new Error(
        `Expected successful response, got ${this.status}\nResponse: ${JSON.stringify(this.data, null, 2)}`
      )
    }
    return this
  }

  /**
   * Assert error
   */
  assertError(expectedStatus?: number): this {
    if (this.ok) {
      throw new Error('Expected error response, got success')
    }
    if (expectedStatus && this.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus}, got ${this.status}`
      )
    }
    return this
  }

  /**
   * Assert response body shape
   */
  assertBody(expected: Partial<T>): this {
    for (const [key, value] of Object.entries(expected)) {
      if ((this.data as any)[key] !== value) {
        throw new Error(
          `Expected ${key} to be ${value}, got ${(this.data as any)[key]}`
        )
      }
    }
    return this
  }

  /**
   * Assert response has property
   */
  assertHasProperty(property: keyof T): this {
    if (!(property in (this.data as any))) {
      throw new Error(`Expected response to have property ${String(property)}`)
    }
    return this
  }

  /**
   * Assert response time
   */
  assertResponseTime(maxMs: number): this {
    if (this.duration > maxMs) {
      throw new Error(
        `Response took ${this.duration}ms, expected less than ${maxMs}ms`
      )
    }
    return this
  }
}

/**
 * Mock Next.js API handler for testing
 */
export class MockApiHandler {
  private handlers: Map<string, (req: NextRequest) => Promise<NextResponse>> = new Map()

  /**
   * Register handler
   */
  register(
    method: string,
    path: string,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): this {
    const key = `${method.toUpperCase()} ${path}`
    this.handlers.set(key, handler)
    return this
  }

  /**
   * Handle request
   */
  async handle(req: NextRequest): Promise<NextResponse> {
    const method = req.method
    const path = new URL(req.url).pathname
    const key = `${method} ${path}`

    const handler = this.handlers.get(key)
    if (!handler) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      )
    }

    try {
      return await handler(req)
    } catch (error) {
      console.error('Handler error:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }

  /**
   * Create test request
   */
  createRequest(
    method: string,
    path: string,
    options?: {
      body?: any
      headers?: HeadersInit
      params?: Record<string, string>
    }
  ): NextRequest {
    const url = new URL(path, 'http://localhost:3000')
    
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    return new NextRequest(url, {
      method,
      headers: options?.headers,
      body: options?.body ? JSON.stringify(options.body) : undefined
    })
  }
}

/**
 * Integration test utilities
 */
export class IntegrationTestUtils {
  /**
   * Create test API client
   */
  static createClient(baseUrl?: string): ApiTestClient {
    return new ApiTestClient(baseUrl)
  }

  /**
   * Create authenticated client
   */
  static createAuthenticatedClient(
    session: Session,
    baseUrl?: string
  ): ApiTestClient {
    return new ApiTestClient(baseUrl).authenticated(session)
  }

  /**
   * Create mock handler
   */
  static createMockHandler(): MockApiHandler {
    return new MockApiHandler()
  }

  /**
   * Wait for condition
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const { timeout = 5000, interval = 100 } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('Timeout waiting for condition')
  }

  /**
   * Retry operation
   */
  static async retry<T>(
    operation: () => Promise<T>,
    options: { attempts?: number; delay?: number } = {}
  ): Promise<T> {
    const { attempts = 3, delay = 1000 } = options

    for (let i = 0; i < attempts; i++) {
      try {
        return await operation()
      } catch (error) {
        if (i === attempts - 1) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error('Retry failed')
  }
}

/**
 * API test assertions
 */
export const apiAssert = {
  /**
   * Assert authentication required
   */
  async requiresAuth(
    client: ApiTestClient,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string
  ): Promise<void> {
    const response = await client.unauthenticated()[method](path)
    response.assertStatus(401)
  },

  /**
   * Assert successful response
   */
  async success<T>(
    response: ApiTestResponse<T>,
    expectedData?: Partial<T>
  ): Promise<void> {
    response.assertOk()
    if (expectedData) {
      response.assertBody(expectedData)
    }
  },

  /**
   * Assert validation error
   */
  async validationError(
    response: ApiTestResponse,
    expectedErrors?: Record<string, any>
  ): Promise<void> {
    response.assertStatus(400)
    response.assertHasProperty('errors' as any)
    
    if (expectedErrors) {
      const errors = (response.data as any).errors
      for (const [field, message] of Object.entries(expectedErrors)) {
        if (errors[field] !== message) {
          throw new Error(
            `Expected error for ${field}: ${message}, got ${errors[field]}`
          )
        }
      }
    }
  },

  /**
   * Assert rate limited
   */
  async rateLimited(response: ApiTestResponse): Promise<void> {
    response.assertStatus(429)
    
    const retryAfter = response.headers.get('Retry-After')
    if (!retryAfter) {
      throw new Error('Expected Retry-After header')
    }
  }
}