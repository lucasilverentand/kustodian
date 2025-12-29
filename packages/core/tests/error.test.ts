import { describe, expect, it } from 'vitest';

import {
  ErrorCodes,
  Errors,
  create_error,
  format_error,
  is_kustodian_error,
} from '../src/error.js';

describe('Error', () => {
  describe('create_error', () => {
    it('should create an error with code and message', () => {
      // Arrange
      const code = 'TEST_ERROR';
      const message = 'Test error message';

      // Act
      const error = create_error(code, message);

      // Assert
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBeUndefined();
    });

    it('should create an error with a cause', () => {
      // Arrange
      const cause = new Error('Original error');

      // Act
      const error = create_error('WRAPPED', 'Wrapper message', cause);

      // Assert
      expect(error.code).toBe('WRAPPED');
      expect(error.message).toBe('Wrapper message');
      expect(error.cause).toBe(cause);
    });
  });

  describe('ErrorCodes', () => {
    it('should have expected error codes', () => {
      // Assert
      expect(ErrorCodes.UNKNOWN).toBe('UNKNOWN');
      expect(ErrorCodes.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.BOOTSTRAP_ERROR).toBe('BOOTSTRAP_ERROR');
    });
  });

  describe('Errors factory', () => {
    describe('unknown', () => {
      it('should create an unknown error', () => {
        // Act
        const error = Errors.unknown('Something unexpected happened');

        // Assert
        expect(error.code).toBe(ErrorCodes.UNKNOWN);
        expect(error.message).toBe('Something unexpected happened');
      });
    });

    describe('invalid_argument', () => {
      it('should create an invalid argument error', () => {
        // Act
        const error = Errors.invalid_argument('count', 'must be positive');

        // Assert
        expect(error.code).toBe(ErrorCodes.INVALID_ARGUMENT);
        expect(error.message).toBe("Invalid argument 'count': must be positive");
      });
    });

    describe('not_found', () => {
      it('should create a not found error', () => {
        // Act
        const error = Errors.not_found('User', '123');

        // Assert
        expect(error.code).toBe(ErrorCodes.NOT_FOUND);
        expect(error.message).toBe("User '123' not found");
      });
    });

    describe('already_exists', () => {
      it('should create an already exists error', () => {
        // Act
        const error = Errors.already_exists('Template', 'nginx');

        // Assert
        expect(error.code).toBe(ErrorCodes.ALREADY_EXISTS);
        expect(error.message).toBe("Template 'nginx' already exists");
      });
    });

    describe('file_not_found', () => {
      it('should create a file not found error', () => {
        // Act
        const error = Errors.file_not_found('/path/to/file.yaml');

        // Assert
        expect(error.code).toBe(ErrorCodes.FILE_NOT_FOUND);
        expect(error.message).toBe('File not found: /path/to/file.yaml');
      });
    });

    describe('file_read_error', () => {
      it('should create a file read error', () => {
        // Arrange
        const cause = new Error('EACCES');

        // Act
        const error = Errors.file_read_error('/path/to/file.yaml', cause);

        // Assert
        expect(error.code).toBe(ErrorCodes.FILE_READ_ERROR);
        expect(error.message).toBe('Failed to read file: /path/to/file.yaml');
        expect(error.cause).toBe(cause);
      });
    });

    describe('file_write_error', () => {
      it('should create a file write error', () => {
        // Arrange
        const cause = new Error('ENOENT');

        // Act
        const error = Errors.file_write_error('/path/to/file.yaml', cause);

        // Assert
        expect(error.code).toBe(ErrorCodes.FILE_WRITE_ERROR);
        expect(error.message).toBe('Failed to write file: /path/to/file.yaml');
        expect(error.cause).toBe(cause);
      });
    });

    describe('parse_error', () => {
      it('should create a parse error', () => {
        // Act
        const error = Errors.parse_error('YAML', 'Invalid indentation at line 5');

        // Assert
        expect(error.code).toBe(ErrorCodes.PARSE_ERROR);
        expect(error.message).toBe('Failed to parse YAML: Invalid indentation at line 5');
      });
    });

    describe('yaml_parse_error', () => {
      it('should create a YAML parse error', () => {
        // Act
        const error = Errors.yaml_parse_error('Unexpected end of document');

        // Assert
        expect(error.code).toBe(ErrorCodes.YAML_PARSE_ERROR);
        expect(error.message).toBe('YAML parse error: Unexpected end of document');
      });
    });

    describe('validation_error', () => {
      it('should create a validation error', () => {
        // Act
        const error = Errors.validation_error('Name is required');

        // Assert
        expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
        expect(error.message).toBe('Name is required');
      });
    });

    describe('schema_validation_error', () => {
      it('should create a schema validation error with formatted messages', () => {
        // Arrange
        const errors = ['Missing required field: name', 'Invalid type for replicas'];

        // Act
        const error = Errors.schema_validation_error(errors);

        // Assert
        expect(error.code).toBe(ErrorCodes.SCHEMA_VALIDATION_ERROR);
        expect(error.message).toContain('Schema validation failed:');
        expect(error.message).toContain('- Missing required field: name');
        expect(error.message).toContain('- Invalid type for replicas');
      });
    });

    describe('config_not_found', () => {
      it('should create a config not found error', () => {
        // Act
        const error = Errors.config_not_found('Cluster', '/clusters/prod/cluster.yaml');

        // Assert
        expect(error.code).toBe(ErrorCodes.CONFIG_NOT_FOUND);
        expect(error.message).toBe(
          'Cluster configuration not found at: /clusters/prod/cluster.yaml',
        );
      });
    });

    describe('template_not_found', () => {
      it('should create a template not found error', () => {
        // Act
        const error = Errors.template_not_found('nginx');

        // Assert
        expect(error.code).toBe(ErrorCodes.TEMPLATE_NOT_FOUND);
        expect(error.message).toBe("Template 'nginx' not found");
      });
    });

    describe('cluster_not_found', () => {
      it('should create a cluster not found error', () => {
        // Act
        const error = Errors.cluster_not_found('production');

        // Assert
        expect(error.code).toBe(ErrorCodes.CLUSTER_NOT_FOUND);
        expect(error.message).toBe("Cluster 'production' not found");
      });
    });

    describe('ssh_connection_error', () => {
      it('should create an SSH connection error', () => {
        // Act
        const error = Errors.ssh_connection_error('node-1.example.com');

        // Assert
        expect(error.code).toBe(ErrorCodes.SSH_CONNECTION_ERROR);
        expect(error.message).toBe('Failed to connect to node-1.example.com via SSH');
      });
    });

    describe('ssh_auth_error', () => {
      it('should create an SSH auth error', () => {
        // Act
        const error = Errors.ssh_auth_error('node-1.example.com');

        // Assert
        expect(error.code).toBe(ErrorCodes.SSH_AUTH_ERROR);
        expect(error.message).toBe('SSH authentication failed for node-1.example.com');
      });
    });

    describe('bootstrap_error', () => {
      it('should create a bootstrap error', () => {
        // Arrange
        const cause = new Error('k0sctl failed');

        // Act
        const error = Errors.bootstrap_error('Cluster installation failed', cause);

        // Assert
        expect(error.code).toBe(ErrorCodes.BOOTSTRAP_ERROR);
        expect(error.message).toBe('Bootstrap failed: Cluster installation failed');
        expect(error.cause).toBe(cause);
      });
    });

    describe('plugin_not_found', () => {
      it('should create a plugin not found error', () => {
        // Act
        const error = Errors.plugin_not_found('authentik');

        // Assert
        expect(error.code).toBe(ErrorCodes.PLUGIN_NOT_FOUND);
        expect(error.message).toBe("Plugin 'authentik' not found");
      });
    });

    describe('plugin_load_error', () => {
      it('should create a plugin load error', () => {
        // Arrange
        const cause = new Error('Module not found');

        // Act
        const error = Errors.plugin_load_error('doppler', cause);

        // Assert
        expect(error.code).toBe(ErrorCodes.PLUGIN_LOAD_ERROR);
        expect(error.message).toBe("Failed to load plugin 'doppler'");
        expect(error.cause).toBe(cause);
      });
    });
  });

  describe('format_error', () => {
    it('should format an error without cause', () => {
      // Arrange
      const error = create_error('TEST', 'Test message');

      // Act
      const formatted = format_error(error);

      // Assert
      expect(formatted).toBe('[TEST] Test message');
    });

    it('should format an error with cause', () => {
      // Arrange
      const cause = new Error('Root cause');
      const error = create_error('TEST', 'Test message', cause);

      // Act
      const formatted = format_error(error);

      // Assert
      expect(formatted).toBe('[TEST] Test message\nCaused by: Error: Root cause');
    });
  });

  describe('is_kustodian_error', () => {
    it('should return true for valid kustodian errors', () => {
      // Arrange
      const error = create_error('TEST', 'Test message');

      // Act & Assert
      expect(is_kustodian_error(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      // Arrange
      const error = new Error('Regular error');

      // Act & Assert
      expect(is_kustodian_error(error)).toBe(false);
    });

    it('should return false for null', () => {
      // Act & Assert
      expect(is_kustodian_error(null)).toBe(false);
    });

    it('should return false for objects missing code', () => {
      // Arrange
      const error = { message: 'Only message' };

      // Act & Assert
      expect(is_kustodian_error(error)).toBe(false);
    });

    it('should return false for objects missing message', () => {
      // Arrange
      const error = { code: 'ONLY_CODE' };

      // Act & Assert
      expect(is_kustodian_error(error)).toBe(false);
    });
  });
});
