import { renderHook, act } from '@testing-library/react'
import { useLocalizedAction } from '../use-localized-action'
import { appendLocaleToFormData } from '@/lib/utils/form-locale'

jest.mock('@/lib/utils/form-locale', () => ({
  appendLocaleToFormData: jest.fn()
}))

describe('useLocalizedAction', () => {
  const mockAction = jest.fn()
  const mockLocale = 'es'
  
  beforeEach(() => {
    jest.clearAllMocks()
  })
  
  it('should append locale to FormData arguments', async () => {
    mockAction.mockResolvedValue({ success: true, data: 'test' })
    
    const { result } = renderHook(() => 
      useLocalizedAction(mockAction, mockLocale)
    )
    
    const formData = new FormData()
    formData.append('name', 'test')
    
    await act(async () => {
      await result.current.execute(formData)
    })
    
    expect(appendLocaleToFormData).toHaveBeenCalledWith(formData, mockLocale)
    expect(mockAction).toHaveBeenCalledWith(formData)
  })
  
  it('should not modify non-FormData arguments', async () => {
    mockAction.mockResolvedValue({ success: true, data: 'test' })
    
    const { result } = renderHook(() => 
      useLocalizedAction(mockAction, mockLocale)
    )
    
    const plainData = { name: 'test' }
    
    await act(async () => {
      await result.current.execute(plainData)
    })
    
    expect(appendLocaleToFormData).not.toHaveBeenCalled()
    expect(mockAction).toHaveBeenCalledWith(plainData)
  })
  
  it('should handle multiple arguments correctly', async () => {
    mockAction.mockResolvedValue({ success: true, data: 'test' })
    
    const { result } = renderHook(() => 
      useLocalizedAction(mockAction, mockLocale)
    )
    
    const formData = new FormData()
    const additionalArg = 'extra'
    
    await act(async () => {
      await result.current.execute(formData, additionalArg)
    })
    
    expect(appendLocaleToFormData).toHaveBeenCalledWith(formData, mockLocale)
    expect(mockAction).toHaveBeenCalledWith(formData, additionalArg)
  })
  
  it('should preserve all useActionState functionality', async () => {
    const onSuccess = jest.fn()
    const onError = jest.fn()
    
    mockAction.mockResolvedValue({ success: true, data: 'test' })
    
    const { result } = renderHook(() => 
      useLocalizedAction(mockAction, mockLocale, { onSuccess, onError })
    )
    
    expect(result.current.isLoading).toBe(false)
    expect(result.current.result).toBe(null)
    
    const formData = new FormData()
    
    await act(async () => {
      await result.current.execute(formData)
    })
    
    expect(result.current.result).toEqual({ success: true, data: 'test' })
    expect(onSuccess).toHaveBeenCalledWith('test')
    expect(onError).not.toHaveBeenCalled()
  })
  
  it('should handle errors correctly', async () => {
    const onError = jest.fn()
    const errorResponse = { success: false, message: 'Error occurred' }
    
    mockAction.mockResolvedValue(errorResponse)
    
    const { result } = renderHook(() => 
      useLocalizedAction(mockAction, mockLocale, { onError })
    )
    
    const formData = new FormData()
    
    await act(async () => {
      await result.current.execute(formData)
    })
    
    expect(result.current.result).toEqual(errorResponse)
    expect(onError).toHaveBeenCalledWith(errorResponse)
  })
})