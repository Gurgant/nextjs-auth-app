/**
 * What an error carries besides its message: a plain record. Each error class
 * says which keys it sets.
 */
export interface ErrorDetails {
  [key: string]: unknown;
}
