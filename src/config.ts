export const getSidecarUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:3001`;
  }
  return 'http://127.0.0.1:3001';
};
