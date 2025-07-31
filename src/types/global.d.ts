declare global {
  var tempAuth2FA:
    | Map<
        string,
        {
          userId: string;
          email: string;
          timestamp: number;
          completed?: boolean;
          completedAt?: number;
        }
      >
    | undefined;
}

export {};
