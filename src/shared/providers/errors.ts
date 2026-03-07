export class ProviderHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
  }
}

export class ProviderBadResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderBadResponseError';
  }
}
