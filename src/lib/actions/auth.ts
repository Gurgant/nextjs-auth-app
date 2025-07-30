'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { signIn } from '@/lib/auth'

// Registration schema validation
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

// Account deletion schema
const deleteAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  confirmEmail: z.string().email('Invalid email address'),
}).refine((data) => data.email === data.confirmEmail, {
  message: "Email confirmation doesn't match",
  path: ["confirmEmail"],
})

export interface ActionResult {
  success: boolean
  message?: string
  errors?: Record<string, string>
}

export async function registerUser(formData: FormData): Promise<ActionResult> {
  try {
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirmPassword') as string,
    }

    // Validate input
    const validatedData = registerSchema.parse(data)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    })

    if (existingUser) {
      return {
        success: false,
        message: 'An account with this email already exists',
        errors: { email: 'An account with this email already exists' }
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12)

    // Create user
    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
      }
    })

    console.log('User created successfully:', { id: user.id, email: user.email })

    return {
      success: true,
      message: 'Account created successfully!'
    }

  } catch (error) {
    console.error('Registration error:', error)

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {}
      error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message
        }
      })
      return {
        success: false,
        message: 'Please check the form for errors',
        errors
      }
    }

    return {
      success: false,
      message: 'Something went wrong. Please try again.'
    }
  }
}

export async function deleteUserAccount(formData: FormData, userEmail: string): Promise<ActionResult> {
  try {
    const data = {
      email: userEmail,
      confirmEmail: formData.get('confirmEmail') as string,
    }

    // Validate input
    const validatedData = deleteAccountSchema.parse(data)

    // Find and delete user
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email }
    })

    if (!user) {
      return {
        success: false,
        message: 'User not found'
      }
    }

    // Delete user account
    await prisma.user.delete({
      where: { email: validatedData.email }
    })

    console.log('User account deleted:', { email: validatedData.email })

    return {
      success: true,
      message: 'Account deleted successfully'
    }

  } catch (error) {
    console.error('Account deletion error:', error)

    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {}
      error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message
        }
      })
      return {
        success: false,
        message: 'Please check the form for errors',
        errors
      }
    }

    return {
      success: false,
      message: 'Failed to delete account. Please try again.'
    }
  }
}

export async function updateUserProfile(formData: FormData, userId: string): Promise<ActionResult> {
  try {
    const name = formData.get('name') as string

    if (!name || name.trim().length < 2) {
      return {
        success: false,
        message: 'Name must be at least 2 characters long',
        errors: { name: 'Name must be at least 2 characters long' }
      }
    }

    // Update user profile
    await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() }
    })

    console.log('User profile updated:', { userId, name })

    return {
      success: true,
      message: 'Profile updated successfully'
    }

  } catch (error) {
    console.error('Profile update error:', error)

    return {
      success: false,
      message: 'Failed to update profile. Please try again.'
    }
  }
}