import { resolveFormLocale, getFormTranslations } from '../form-locale-enhanced';
import { getCurrentLocale } from '../get-locale';
import { getLocaleFromFormData } from '../form-locale';
import { getTranslations } from 'next-intl/server';

// Mock dependencies
jest.mock('../get-locale');
jest.mock('../form-locale');
jest.mock('next-intl/server');

describe('form-locale-enhanced', () => {
  const mockGetCurrentLocale = getCurrentLocale as jest.MockedFunction<typeof getCurrentLocale>;
  const mockGetLocaleFromFormData = getLocaleFromFormData as jest.MockedFunction<typeof getLocaleFromFormData>;
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

  describe('resolveFormLocale', () => {
    it('uses form locale when not default (en)', async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue('es');
      mockGetCurrentLocale.mockResolvedValue('fr');

      const result = await resolveFormLocale(formData);

      expect(result).toBe('es');
      expect(mockGetLocaleFromFormData).toHaveBeenCalledWith(formData);
      expect(mockGetCurrentLocale).toHaveBeenCalled();
    });

    it('uses cookie locale when form locale is default (en)', async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue('en');
      mockGetCurrentLocale.mockResolvedValue('fr');

      const result = await resolveFormLocale(formData);

      expect(result).toBe('fr');
      expect(mockGetLocaleFromFormData).toHaveBeenCalledWith(formData);
      expect(mockGetCurrentLocale).toHaveBeenCalled();
    });

    it('returns en when both form and cookie are en', async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue('en');
      mockGetCurrentLocale.mockResolvedValue('en');

      const result = await resolveFormLocale(formData);

      expect(result).toBe('en');
    });

    it('handles empty form data', async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue('en');
      mockGetCurrentLocale.mockResolvedValue('de');

      const result = await resolveFormLocale(formData);

      expect(result).toBe('de');
    });
  });

  describe('getFormTranslations', () => {
    it('gets translations with resolved locale', async () => {
      const formData = new FormData();
      const mockTranslationFn = createMockTranslationFn();
      
      mockGetLocaleFromFormData.mockReturnValue('es');
      mockGetCurrentLocale.mockResolvedValue('fr');
      mockGetTranslations.mockResolvedValue(mockTranslationFn);

      const result = await getFormTranslations(formData, 'validation');

      expect(mockGetTranslations).toHaveBeenCalledWith({
        locale: 'es',
        namespace: 'validation'
      });
      expect(result).toBe(mockTranslationFn);
    });

    it('uses cookie locale for translations when form locale is default', async () => {
      const formData = new FormData();
      const mockTranslationFn = createMockTranslationFn();
      
      mockGetLocaleFromFormData.mockReturnValue('en');
      mockGetCurrentLocale.mockResolvedValue('ja');
      mockGetTranslations.mockResolvedValue(mockTranslationFn);

      const result = await getFormTranslations(formData, 'auth');

      expect(mockGetTranslations).toHaveBeenCalledWith({
        locale: 'ja',
        namespace: 'auth'
      });
      expect(result).toBe(mockTranslationFn);
    });

    it('works with different namespaces', async () => {
      const formData = new FormData();
      const mockTranslationFn = createMockTranslationFn();
      
      mockGetLocaleFromFormData.mockReturnValue('de');
      mockGetCurrentLocale.mockResolvedValue('en');
      mockGetTranslations.mockResolvedValue(mockTranslationFn);

      const namespaces = ['validation', 'auth', 'errors', 'success', 'common'];
      
      for (const namespace of namespaces) {
        await getFormTranslations(formData, namespace);
        
        expect(mockGetTranslations).toHaveBeenCalledWith({
          locale: 'de',
          namespace
        });
      }
    });
  });

  describe('edge cases', () => {
    it('handles errors from getCurrentLocale gracefully', async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue('en');
      mockGetCurrentLocale.mockRejectedValue(new Error('Cookie error'));

      await expect(resolveFormLocale(formData)).rejects.toThrow('Cookie error');
    });

    it('handles errors from getTranslations gracefully', async () => {
      const formData = new FormData();
      mockGetLocaleFromFormData.mockReturnValue('es');
      mockGetCurrentLocale.mockResolvedValue('en');
      mockGetTranslations.mockRejectedValue(new Error('Translation error'));

      await expect(getFormTranslations(formData, 'validation')).rejects.toThrow('Translation error');
    });
  });
});