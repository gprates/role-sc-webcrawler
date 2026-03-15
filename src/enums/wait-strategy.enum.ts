export enum WaitStrategy {
  LOAD = 'load',
  DOM_CONTENT_LOADED = 'domcontentloaded',
  NETWORK_IDLE = 'networkidle',
}

export enum WaitTimeMs {
  SHORT = 1000,
  MEDIUM = 3000,
  LONG = 5000,
}
