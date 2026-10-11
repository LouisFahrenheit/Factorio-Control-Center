import { Logger } from '@nestjs/common';

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});
  jest.spyOn(Logger, 'log').mockImplementation(() => {});
  jest.spyOn(Logger, 'warn').mockImplementation(() => {});
  jest.spyOn(Logger, 'debug').mockImplementation(() => {});
  jest.spyOn(Logger, 'verbose').mockImplementation(() => {});
});
