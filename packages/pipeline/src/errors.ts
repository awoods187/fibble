/** Thrown by pipeline stages that are typed but not built yet. */
export class NotImplementedError extends Error {
  constructor(stage: string) {
    super(`Pipeline stage "${stage}" is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}
