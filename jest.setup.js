require('@testing-library/jest-dom');

jest.mock('socket.io-client', () => {
  const socketMock = {
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
    emit: jest.fn(),
  };
  const factory = jest.fn(() => socketMock);
  factory.__socketMock = socketMock;
  return factory;
});

if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || function matchMedia() {
    return {
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  };
}
