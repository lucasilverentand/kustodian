import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { create_console_logger, create_silent_logger } from '../src/logger.js';

describe('Logger', () => {
  describe('create_console_logger', () => {
    beforeEach(() => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create a logger with default options', () => {
      // Act
      const logger = create_console_logger();

      // Assert
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.child).toBeDefined();
    });

    it('should log info messages by default', () => {
      // Arrange
      const logger = create_console_logger({ timestamp: false });

      // Act
      logger.info('test message');

      // Assert
      expect(console.info).toHaveBeenCalledWith('[INFO] test message');
    });

    it('should not log debug messages at info level', () => {
      // Arrange
      const logger = create_console_logger({ level: 'info', timestamp: false });

      // Act
      logger.debug('debug message');

      // Assert
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should log debug messages at debug level', () => {
      // Arrange
      const logger = create_console_logger({ level: 'debug', timestamp: false });

      // Act
      logger.debug('debug message');

      // Assert
      expect(console.debug).toHaveBeenCalledWith('[DEBUG] debug message');
    });

    it('should log warn messages', () => {
      // Arrange
      const logger = create_console_logger({ timestamp: false });

      // Act
      logger.warn('warning');

      // Assert
      expect(console.warn).toHaveBeenCalledWith('[WARN] warning');
    });

    it('should log error messages', () => {
      // Arrange
      const logger = create_console_logger({ timestamp: false });

      // Act
      logger.error('error occurred');

      // Assert
      expect(console.error).toHaveBeenCalledWith('[ERROR] error occurred');
    });

    it('should include context in log messages', () => {
      // Arrange
      const logger = create_console_logger({ timestamp: false });

      // Act
      logger.info('test', { key: 'value' });

      // Assert
      expect(console.info).toHaveBeenCalledWith('[INFO] test {"key":"value"}');
    });

    it('should include timestamp by default', () => {
      // Arrange
      const logger = create_console_logger();

      // Act
      logger.info('test');

      // Assert
      expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/^\[.*\] \[INFO\] test$/));
    });

    it('should create child logger with merged context', () => {
      // Arrange
      const logger = create_console_logger({ timestamp: false, context: { parent: 'value' } });
      const child = logger.child({ child: 'context' });

      // Act
      child.info('test');

      // Assert
      expect(console.info).toHaveBeenCalledWith('[INFO] test {"parent":"value","child":"context"}');
    });

    it('should inherit log level in child logger', () => {
      // Arrange
      const logger = create_console_logger({ level: 'warn', timestamp: false });
      const child = logger.child({ id: '1' });

      // Act
      child.info('should not appear');
      child.warn('should appear');

      // Assert
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should filter by error level', () => {
      // Arrange
      const logger = create_console_logger({ level: 'error', timestamp: false });

      // Act
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('yes');

      // Assert
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('[ERROR] yes');
    });
  });

  describe('create_silent_logger', () => {
    it('should create a logger that does nothing', () => {
      // Arrange
      const spy = vi.spyOn(console, 'info');

      // Act
      const logger = create_silent_logger();
      logger.info('test');
      logger.debug('test');
      logger.warn('test');
      logger.error('test');

      // Assert
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should create silent child loggers', () => {
      // Arrange
      const spy = vi.spyOn(console, 'info');

      // Act
      const logger = create_silent_logger();
      const child = logger.child({ id: '1' });
      child.info('test');

      // Assert
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
