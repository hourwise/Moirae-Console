export class FatesBoundaryError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'FatesBoundaryError';
    this.code = code;
  }
}

export class FatesUnavailableError extends FatesBoundaryError {
  public constructor(message = 'The Fates boundary is unavailable.') {
    super('FATES_UNAVAILABLE', message);
    this.name = 'FatesUnavailableError';
  }
}

export class FatesMalformedResponseError extends FatesBoundaryError {
  public constructor(message = 'The Fates boundary returned a malformed response.') {
    super('FATES_MALFORMED_RESPONSE', message);
    this.name = 'FatesMalformedResponseError';
  }
}
