'use client'

import { useState, useCallback, useMemo } from 'react'
import type { ZodSchema } from 'zod'

export interface FormStep<T = any> {
  id: string
  label: string
  schema?: ZodSchema<T>
  canSkip?: boolean
}

export interface UseMultiStepFormOptions<T = any> {
  steps: FormStep<T>[]
  initialStep?: number
  onStepChange?: (stepIndex: number, stepId: string) => void
  onComplete?: (data: Record<string, any>) => void
}

export interface UseMultiStepFormReturn<T = any> {
  currentStep: number
  currentStepData: FormStep<T>
  totalSteps: number
  isFirstStep: boolean
  isLastStep: boolean
  stepData: Record<string, any>
  goToNext: () => void
  goToPrevious: () => void
  goToStep: (index: number) => void
  updateStepData: (data: Partial<T>) => void
  validateCurrentStep: (data: T) => Promise<{ success: boolean; errors?: any }>
  canGoNext: boolean
  canGoPrevious: boolean
  progress: number
  reset: () => void
}

export function useMultiStepForm<T = any>({
  steps,
  initialStep = 0,
  onStepChange,
  onComplete
}: UseMultiStepFormOptions<T>): UseMultiStepFormReturn<T> {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [stepData, setStepData] = useState<Record<string, any>>({})
  
  const totalSteps = steps.length
  const currentStepData = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === totalSteps - 1
  const canGoPrevious = !isFirstStep
  const canGoNext = currentStep < totalSteps - 1
  
  const progress = useMemo(() => {
    return ((currentStep + 1) / totalSteps) * 100
  }, [currentStep, totalSteps])
  
  const updateStepData = useCallback((data: Partial<T>) => {
    setStepData(prev => {
      const stepId = steps[currentStep].id
      return {
        ...prev,
        [stepId]: data
      }
    })
  }, [currentStep, steps])
  
  const validateCurrentStep = useCallback(async (data: T) => {
    const schema = currentStepData.schema
    if (!schema) {
      return { success: true }
    }
    
    try {
      await schema.parseAsync(data)
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        errors: error.errors || error
      }
    }
  }, [currentStepData.schema])
  
  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= totalSteps) {
      console.error('Invalid step index:', index)
      return
    }
    
    setCurrentStep(index)
    const newStepData = steps[index]
    onStepChange?.(index, newStepData.id)
  }, [totalSteps, steps, onStepChange])
  
  const goToNext = useCallback(() => {
    if (!canGoNext) {
      if (isLastStep && onComplete) {
        onComplete(stepData)
      }
      return
    }
    
    goToStep(currentStep + 1)
  }, [canGoNext, isLastStep, currentStep, goToStep, onComplete, stepData])
  
  const goToPrevious = useCallback(() => {
    if (!canGoPrevious) return
    goToStep(currentStep - 1)
  }, [canGoPrevious, currentStep, goToStep])
  
  const reset = useCallback(() => {
    setCurrentStep(initialStep)
    setStepData({})
    if (initialStep !== currentStep) {
      onStepChange?.(initialStep, steps[initialStep].id)
    }
  }, [initialStep, currentStep, steps, onStepChange])
  
  return {
    currentStep,
    currentStepData,
    totalSteps,
    isFirstStep,
    isLastStep,
    stepData,
    goToNext,
    goToPrevious,
    goToStep,
    updateStepData,
    validateCurrentStep,
    canGoNext,
    canGoPrevious,
    progress,
    reset
  }
}