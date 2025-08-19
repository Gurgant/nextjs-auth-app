import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  createFieldErrorResponse,
  createGenericErrorResponse,
  isErrorResponse,
  isSuccessResponse,
  hasFieldErrors,
  getFieldError,
  getAllFieldErrors,
  withErrorHandling,
  logActionError,
  type ErrorResponse,
  type SuccessResponse,
  type ActionResponse
} from '../form-responses';
import { translateValidationErrors } from '@/lib/validation';
import { getTranslations } from 'next-intl/server';

// Mock dependencies
jest.mock('@/lib/validation');
jest.mock('next-intl/server');

// Mock console.error to prevent test output pollution
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe('form-responses', () => {
  const mockTranslateValidationErrors = translateValidationErrors as jest.MockedFunction<typeof translateValidationErrors>;
  const mockGetTranslations = getTranslations as jest.MockedFunction<typeof getTranslations>;
  
  // Create a proper mock translation function
  const createMockTranslationFn = () => {
    const fn = jest.fn((key: string) => key) as any;
    fn.rich = jest.fn();
    fn.markup = jest.fn();
    fn.raw = jest.fn();
    fn.has = jest.fn();
    return fn;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createErrorResponse', () => {
    it('creates basic error response', () => {
      const result = createErrorResponse('Test error');
      
      expect(result).toEqual({
        success: false,
        message: 'Test error'
      });
    });

    it('creates error response with field errors', () => {
      const errors = { email: 'Invalid email', password: 'Too weak' };
      const result = createErrorResponse('Validation failed', errors);
      
      expect(result).toEqual({
        success: false,
        message: 'Validation failed',
        errors
      });
    });

    it('handles ZodError properly', () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string'
        } as z.ZodIssue
      ]);
      
      const result = createErrorResponse('Validation error', zodError);
      
      expect(result).toEqual({
        success: false,
        message: 'Validation error',
        errors: { email: ['Expected string'] }
      });
    });

    it('handles array field errors', () => {
      const errors = { tags: ['Too short', 'Invalid character'] };
      const result = createErrorResponse('Multiple errors', errors);
      
      expect(result).toEqual({
        success: false,
        message: 'Multiple errors',
        errors
      });
    });
  });

  describe('createSuccessResponse', () => {
    it('creates basic success response', () => {
      const result = createSuccessResponse('Operation successful');
      
      expect(result).toEqual({
        success: true,
        message: 'Operation successful'
      });
    });

    it('creates success response with data', () => {
      const data = { userId: '123', name: 'John' };
      const result = createSuccessResponse('User created', data);
      
      expect(result).toEqual({
        success: true,
        message: 'User created',
        data
      });
    });

    it('handles undefined data correctly', () => {
      const result = createSuccessResponse('Success', undefined);
      
      expect(result).toEqual({
        success: true,
        message: 'Success'
      });
    });

    it('preserves data type', () => {
      const data = { count: 42 };
      const result = createSuccessResponse<{ count: number }>('Counted', data);
      
      expect(result.data?.count).toBe(42);
      expect(typeof result.data?.count).toBe('number');
    });
  });

  describe('createValidationErrorResponse', () => {
    it('creates validation error with translated messages', async () => {
      // Create a ZodError using a failed parse
      const schema = z.object({
        password: z.string().min(8)
      });
      let zodError: z.ZodError;
      try {
        schema.parse({ password: 'short' });
        zodError = new z.ZodError([]); // This shouldn't happen
      } catch (error) {
        zodError = error as z.ZodError;
      }
      
      const mockT = createMockTranslationFn();
      mockT.mockImplementation((key: string) => {
        if (key === 'form.validationError') return 'Validation error occurred';
        return key;
      });
      mockGetTranslations.mockResolvedValue(mockT);
      mockTranslateValidationErrors.mockResolvedValue({ password: 'Password too short' });
      
      const result = await createValidationErrorResponse(zodError, 'en');
      
      expect(mockTranslateValidationErrors).toHaveBeenCalledWith(zodError, 'en');
      expect(mockGetTranslations).toHaveBeenCalledWith({ locale: 'en', namespace: 'validation' });
      expect(mockT).toHaveBeenCalledWith('form.validationError');
      expect(result).toEqual({
        success: false,
        message: 'Validation error occurred',
        errors: { password: 'Password too short' }
      });
    });

    it('uses custom message when provided', async () => {
      const zodError = new z.ZodError([]);
      const mockT = createMockTranslationFn();
      mockGetTranslations.mockResolvedValue(mockT);
      mockTranslateValidationErrors.mockResolvedValue({});
      
      const result = await createValidationErrorResponse(zodError, 'es', 'Custom error message');
      
      expect(mockGetTranslations).not.toHaveBeenCalled();
      expect(result.message).toBe('Custom error message');
    });
  });

  describe('createFieldErrorResponse', () => {
    it('creates error for single field', () => {
      const result = createFieldErrorResponse(
        'Invalid credentials',
        'password',
        'Incorrect password'
      );
      
      expect(result).toEqual({
        success: false,
        message: 'Invalid credentials',
        errors: {
          password: 'Incorrect password'
        }
      });
    });
  });

  describe('createGenericErrorResponse', () => {
    it('creates error for notFound type', () => {
      const result = createGenericErrorResponse('notFound');
      
      expect(result).toEqual({
        success: false,
        message: 'Resource not found'
      });
    });

    it('creates error for unauthorized type', () => {
      const result = createGenericErrorResponse('unauthorized');
      
      expect(result).toEqual({
        success: false,
        message: 'You are not authorized to perform this action'
      });
    });

    it('uses custom message when provided', () => {
      const result = createGenericErrorResponse('serverError', 'Database connection failed');
      
      expect(result).toEqual({
        success: false,
        message: 'Database connection failed'
      });
    });

    it('handles all error types', () => {
      const types: Array<Parameters<typeof createGenericErrorResponse>[0]> = [
        'notFound',
        'unauthorized',
        'forbidden',
        'serverError',
        'unknown',
        'alreadyExists',
        'invalidInput'
      ];
      
      types.forEach(type => {
        const result = createGenericErrorResponse(type);
        expect(result.success).toBe(false);
        expect(result.message).toBeTruthy();
      });
    });
  });

  describe('Type Guards', () => {
    describe('isErrorResponse', () => {
      it('returns true for error responses', () => {
        const error: ErrorResponse = { success: false, message: 'Error' };
        expect(isErrorResponse(error)).toBe(true);
      });

      it('returns false for success responses', () => {
        const success: SuccessResponse = { success: true, message: 'Success' };
        expect(isErrorResponse(success)).toBe(false);
      });
    });

    describe('isSuccessResponse', () => {
      it('returns true for success responses', () => {
        const success: SuccessResponse = { success: true, message: 'Success' };
        expect(isSuccessResponse(success)).toBe(true);
      });

      it('returns false for error responses', () => {
        const error: ErrorResponse = { success: false, message: 'Error' };
        expect(isSuccessResponse(error)).toBe(false);
      });
    });

    describe('hasFieldErrors', () => {
      it('returns true when error response has field errors', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: { email: 'Invalid' }
        };
        expect(hasFieldErrors(response)).toBe(true);
      });

      it('returns false when error response has no field errors', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error'
        };
        expect(hasFieldErrors(response)).toBe(false);
      });

      it('returns false when error response has empty errors object', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: {}
        };
        expect(hasFieldErrors(response)).toBe(false);
      });

      it('returns false for success responses', () => {
        const response: SuccessResponse = {
          success: true,
          message: 'Success'
        };
        expect(hasFieldErrors(response)).toBe(false);
      });
    });
  });

  describe('Error Extraction Utilities', () => {
    describe('getFieldError', () => {
      it('returns field error when exists', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: { email: 'Invalid email' }
        };
        
        expect(getFieldError(response, 'email')).toBe('Invalid email');
      });

      it('returns first error when field has array of errors', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: { tags: ['Too short', 'Invalid character'] }
        };
        
        expect(getFieldError(response, 'tags')).toBe('Too short');
      });

      it('returns undefined when field error does not exist', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: { email: 'Invalid' }
        };
        
        expect(getFieldError(response, 'password')).toBeUndefined();
      });

      it('returns undefined when no errors object', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error'
        };
        
        expect(getFieldError(response, 'email')).toBeUndefined();
      });
    });

    describe('getAllFieldErrors', () => {
      it('returns all field errors as flat array', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: {
            email: 'Invalid email',
            password: ['Too short', 'No special character'],
            name: 'Required'
          }
        };
        
        const errors = getAllFieldErrors(response);
        
        expect(errors).toHaveLength(4);
        expect(errors).toContain('Invalid email');
        expect(errors).toContain('Too short');
        expect(errors).toContain('No special character');
        expect(errors).toContain('Required');
      });

      it('returns empty array when no errors', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error'
        };
        
        expect(getAllFieldErrors(response)).toEqual([]);
      });

      it('filters out non-string values', () => {
        const response: ErrorResponse = {
          success: false,
          message: 'Error',
          errors: {
            field1: 'Error 1',
            field2: null as any,
            field3: undefined as any,
            field4: 123 as any
          }
        };
        
        const errors = getAllFieldErrors(response);
        
        expect(errors).toEqual(['Error 1']);
      });
    });
  });

  describe('withErrorHandling', () => {
    it('returns success response when action succeeds', async () => {
      const successResponse = createSuccessResponse('Done!', { id: 123 });
      const action = jest.fn().mockResolvedValue(successResponse);
      
      const result = await withErrorHandling(action, 'en', 'testAction');
      
      expect(result).toEqual(successResponse);
      expect(action).toHaveBeenCalled();
    });

    it('handles ZodError and returns validation error response', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Invalid type'
        } as z.ZodIssue
      ]);
      
      const action = jest.fn().mockRejectedValue(zodError);
      const mockT = createMockTranslationFn();
      mockGetTranslations.mockResolvedValue(mockT);
      mockTranslateValidationErrors.mockResolvedValue({ email: 'Invalid email type' });
      
      const result = await withErrorHandling(action, 'en', 'testAction');
      
      expect(isErrorResponse(result)).toBe(true);
      expect(result.success).toBe(false);
      expect(mockTranslateValidationErrors).toHaveBeenCalledWith(zodError, 'en');
    });

    it('handles unknown errors and returns generic error response', async () => {
      const error = new Error('Database connection failed');
      const action = jest.fn().mockRejectedValue(error);
      
      const result = await withErrorHandling(action, 'en', 'testAction');
      
      expect(result).toEqual({
        success: false,
        message: 'Something went wrong. Please try again.'
      });
      expect(console.error).toHaveBeenCalledWith(
        '[testAction] Error:',
        expect.objectContaining({
          error,
          message: 'Database connection failed',
          stack: expect.any(String),
          timestamp: expect.any(String)
        })
      );
    });

    it('uses default action name when not provided', async () => {
      const error = new Error('Test error');
      const action = jest.fn().mockRejectedValue(error);
      
      await withErrorHandling(action, 'en');
      
      expect(console.error).toHaveBeenCalledWith(
        '[unknown] Error:',
        expect.any(Object)
      );
    });
  });

  describe('logActionError', () => {
    it('logs error with action name and context', () => {
      const error = new Error('Test error');
      const context = { userId: '123', operation: 'update' };
      
      logActionError('updateUser', error, context);
      
      expect(console.error).toHaveBeenCalledWith(
        '[updateUser] Error:',
        expect.objectContaining({
          error,
          message: 'Test error',
          stack: expect.any(String),
          context,
          timestamp: expect.any(String)
        })
      );
    });

    it('handles non-Error objects', () => {
      const error = { code: 'CUSTOM_ERROR', detail: 'Something went wrong' };
      
      logActionError('customAction', error);
      
      expect(console.error).toHaveBeenCalledWith(
        '[customAction] Error:',
        expect.objectContaining({
          error,
          message: 'Unknown error',
          stack: undefined,
          context: undefined,
          timestamp: expect.any(String)
        })
      );
    });

    it('handles string errors', () => {
      const error = 'String error message';
      
      logActionError('stringError', error);
      
      expect(console.error).toHaveBeenCalledWith(
        '[stringError] Error:',
        expect.objectContaining({
          error,
          message: 'Unknown error',
          stack: undefined
        })
      );
    });
  });

  describe('Integration Tests', () => {
    it('works with complex validation scenarios', async () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        age: z.number().min(18)
      });
      
      try {
        schema.parse({
          email: 'invalid',
          password: 'short',
          age: 16
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const response = createErrorResponse('Validation failed', error);
          
          expect(response.errors).toHaveProperty('email');
          expect(response.errors).toHaveProperty('password');
          expect(response.errors).toHaveProperty('age');
          expect(hasFieldErrors(response)).toBe(true);
          expect(getAllFieldErrors(response).length).toBeGreaterThan(0);
        }
      }
    });

    it('type narrowing works correctly', () => {
      const responses: ActionResponse[] = [
        createSuccessResponse('Success'),
        createErrorResponse('Error'),
        createFieldErrorResponse('Field error', 'email', 'Invalid')
      ];
      
      responses.forEach(response => {
        if (isSuccessResponse(response)) {
          // TypeScript should know this is SuccessResponse
          expect(response.success).toBe(true);
          // response.errors should not exist here (type check)
        } else if (isErrorResponse(response)) {
          // TypeScript should know this is ErrorResponse
          expect(response.success).toBe(false);
          // response.data should not exist here (type check)
        }
      });
    });
  });
});