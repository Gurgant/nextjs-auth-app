import { User } from '@/generated/prisma'
import bcrypt from 'bcryptjs'
import { 
  IUserRepository, 
  CreateUserWithAccountDTO, 
  UpdateUserDTO,
  UserWithAccounts 
} from './user.repository.interface'
import { PaginatedResult, PaginationOptions, QueryOptions } from '../types'

export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map()
  private emailIndex: Map<string, string> = new Map()
  private idCounter = 1

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }

  async findOne(where: Partial<User>): Promise<User | null> {
    for (const user of this.users.values()) {
      const matches = Object.entries(where).every(([key, value]) => 
        (user as any)[key] === value
      )
      if (matches) return user
    }
    return null
  }

  async findAll(options?: QueryOptions<User>): Promise<User[]> {
    let users = Array.from(this.users.values())
    
    if (options?.where) {
      users = users.filter(user => {
        return Object.entries(options.where!).every(([key, value]) => 
          (user as any)[key] === value
        )
      })
    }
    
    if (options?.skip) users = users.slice(options.skip)
    if (options?.take) users = users.slice(0, options.take)
    
    return users
  }

  async findPaginated(
    options?: PaginationOptions & QueryOptions<User>
  ): Promise<PaginatedResult<User>> {
    const page = options?.page || 1
    const limit = options?.limit || 10
    const skip = (page - 1) * limit

    const allUsers = await this.findAll(options)
    const data = allUsers.slice(skip, skip + limit)

    return {
      data,
      total: allUsers.length,
      page,
      limit,
      totalPages: Math.ceil(allUsers.length / limit)
    }
  }

  async create(data: Partial<User>): Promise<User> {
    const id = `user-${this.idCounter++}`
    const user: User = {
      id,
      email: data.email!,
      emailVerified: data.emailVerified || null,
      name: data.name || null,
      image: data.image || null,
      password: data.password || null,
      twoFactorEnabled: data.twoFactorEnabled || false,
      twoFactorSecret: data.twoFactorSecret || null,
      passwordSetAt: null,
      lastPasswordChange: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      lastLoginAt: null,
      requiresPasswordChange: false,
      hasGoogleAccount: false,
      hasEmailAccount: false,
      primaryAuthMethod: null,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      emailVerificationRequired: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    } as User
    
    this.users.set(id, user)
    if (user.email) {
      this.emailIndex.set(user.email, id)
    }
    
    return user
  }

  async createMany(data: Partial<User>[]): Promise<User[]> {
    return Promise.all(data.map(d => this.create(d)))
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const user = this.users.get(id)
    if (!user) throw new Error('User not found')
    
    const oldEmail = user.email
    const updated = { ...user, ...data, updatedAt: new Date() }
    
    this.users.set(id, updated)
    
    if (data.email && data.email !== oldEmail) {
      this.emailIndex.delete(oldEmail)
      this.emailIndex.set(data.email, id)
    }
    
    return updated
  }

  async updateMany(where: Partial<User>, data: Partial<User>): Promise<number> {
    const users = await this.findAll({ where })
    for (const user of users) {
      await this.update(user.id, data)
    }
    return users.length
  }

  async delete(id: string): Promise<boolean> {
    const user = this.users.get(id)
    if (!user) return false
    
    this.users.delete(id)
    if (user.email) {
      this.emailIndex.delete(user.email)
    }
    
    return true
  }

  async deleteMany(where: Partial<User>): Promise<number> {
    const users = await this.findAll({ where })
    for (const user of users) {
      await this.delete(user.id)
    }
    return users.length
  }

  async exists(id: string): Promise<boolean> {
    return this.users.has(id)
  }

  async count(where?: Partial<User>): Promise<number> {
    if (!where) return this.users.size
    
    const users = await this.findAll({ where })
    return users.length
  }

  async findByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email)
    if (!userId) return null
    return this.users.get(userId) || null
  }

  async findByEmailWithAccounts(email: string): Promise<UserWithAccounts | null> {
    const user = await this.findByEmail(email)
    if (!user) return null
    
    return {
      ...user,
      accounts: []
    }
  }

  async findByCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email)
    
    if (!user || !user.password) {
      return null
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    if (!isPasswordValid) {
      return null
    }

    return user
  }

  async createWithAccount(data: CreateUserWithAccountDTO): Promise<User> {
    const hashedPassword = data.password 
      ? await bcrypt.hash(data.password, 12) 
      : null

    return await this.create({
      email: data.email,
      name: data.name,
      password: hashedPassword,
      emailVerified: data.emailVerified,
      image: data.image,
      twoFactorEnabled: data.twoFactorEnabled || false,
      twoFactorSecret: data.twoFactorSecret
    })
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.update(userId, { lastLoginAt: new Date(), updatedAt: new Date() })
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.update(userId, { password: hashedPassword })
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.update(userId, { emailVerified: new Date() })
  }

  async enableTwoFactor(userId: string, secret: string): Promise<void> {
    await this.update(userId, {
      twoFactorEnabled: true,
      twoFactorSecret: secret
    })
  }

  async disableTwoFactor(userId: string): Promise<void> {
    await this.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null
    })
  }

  async findByProvider(provider: string, providerAccountId: string): Promise<User | null> {
    return null
  }

  clear(): void {
    this.users.clear()
    this.emailIndex.clear()
    this.idCounter = 1
  }

  seed(users: User[]): void {
    for (const user of users) {
      this.users.set(user.id, user)
      if (user.email) {
        this.emailIndex.set(user.email, user.id)
      }
    }
  }
}