export class InProgressError extends Error {
  static getErrorName() {
    return 'InProgressError';
  }

  constructor(message) {
    super();
    this.name = InProgressError.getErrorName();
    this.message = message;
  }
}
