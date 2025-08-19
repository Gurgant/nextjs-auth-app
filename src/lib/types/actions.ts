// Standard action response types for enterprise applications

export type SuccessResponse<T = any> = {
  success: true
  data?: T
  message?: string
}

export type ErrorResponse = {
  success: false
  error: string
  message?: string
  errors?: Record<string, string>
}

export type ActionResponse<T = any> = SuccessResponse<T> | ErrorResponse

// Type guards
export function isSuccessResponse<T>(
  response: ActionResponse<T>
): response is SuccessResponse<T> {
  return response.success === true
}

export function isErrorResponse<T>(
  response: ActionResponse<T>
): response is ErrorResponse {
  return response.success === false
}