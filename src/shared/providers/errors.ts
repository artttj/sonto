// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

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