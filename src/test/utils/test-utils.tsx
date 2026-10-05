/**
 * Test data generation utilities
 */
export const generate = {
  /**
   * Generate random string
   */
  string(length: number = 10): string {
    return Math.random()
      .toString(36)
      .substring(2, length + 2);
  },

  /**
   * Generate random email
   */
  email(domain: string = "test.com"): string {
    return `${this.string()}@${domain}`;
  },

  /**
   * Generate random UUID
   */
  uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Generate random number
   */
  number(min: number = 0, max: number = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Generate random boolean
   */
  boolean(): boolean {
    return Math.random() > 0.5;
  },

  /**
   * Generate random date
   */
  date(start?: Date, end?: Date): Date {
    const startDate = start || new Date(2020, 0, 1);
    const endDate = end || new Date();
    return new Date(
      startDate.getTime() +
        Math.random() * (endDate.getTime() - startDate.getTime()),
    );
  },
};
