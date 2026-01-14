import { describe, expect, it } from 'bun:test';

import { create_flux_client } from '../src/flux.js';

describe('FluxClient', () => {
  describe('create_flux_client', () => {
    it('should create a client with default options', () => {
      const client = create_flux_client();

      expect(client).toBeDefined();
      expect(client.bootstrap).toBeDefined();
      expect(client.check).toBeDefined();
      expect(client.reconcile).toBeDefined();
      expect(client.get).toBeDefined();
      expect(client.suspend).toBeDefined();
      expect(client.resume).toBeDefined();
      expect(client.uninstall).toBeDefined();
      expect(client.install).toBeDefined();
      expect(client.check_cli).toBeDefined();
    });

    it('should create a client with custom options', () => {
      const client = create_flux_client({
        kubeconfig: '/path/to/kubeconfig',
        context: 'my-context',
        timeout: 60000,
      });

      expect(client).toBeDefined();
    });
  });

  describe('check_cli', () => {
    it('should check if flux CLI is available', async () => {
      const client = create_flux_client();
      const result = await client.check_cli();

      expect(result.success).toBe(true);
      if (result.success) {
        // Result depends on whether flux is installed
        expect(typeof result.value).toBe('boolean');
      }
    });
  });
});
