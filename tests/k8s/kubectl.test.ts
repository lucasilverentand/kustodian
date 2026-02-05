import { describe, expect, it } from 'bun:test';

import { create_kubectl_client } from '../../src/k8s/kubectl.js';

describe('KubectlClient', () => {
  describe('create_kubectl_client', () => {
    it('should create a client with default options', () => {
      const client = create_kubectl_client();

      expect(client).toBeDefined();
      expect(client.apply).toBeDefined();
      expect(client.get).toBeDefined();
      expect(client.delete).toBeDefined();
      expect(client.label).toBeDefined();
      expect(client.annotate).toBeDefined();
      expect(client.wait).toBeDefined();
      expect(client.logs).toBeDefined();
      expect(client.check).toBeDefined();
    });

    it('should create a client with custom options', () => {
      const client = create_kubectl_client({
        kubeconfig: '/path/to/kubeconfig',
        context: 'my-context',
        timeout: 30000,
      });

      expect(client).toBeDefined();
    });
  });

  describe('check', () => {
    it('should check if kubectl is available', async () => {
      const client = create_kubectl_client();
      const result = await client.check();

      expect(result.success).toBe(true);
      if (result.success) {
        // Result depends on whether kubectl is installed
        expect(typeof result.value).toBe('boolean');
      }
    });
  });
});
