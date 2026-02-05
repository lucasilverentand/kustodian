import { describe, expect, it, mock } from 'bun:test';
import { create_helm_client } from '../../src/registry/helm.js';
import type { ImageReferenceType } from '../../src/registry/types.js';

describe('Helm Client', () => {
  describe('Traditional Helm Repository', () => {
    it('should fetch chart versions from index.yaml', async () => {
      // Mock fetch to return a sample Helm index
      const mockFetch = mock(async (url: string) => {
        if (url.includes('index.yaml')) {
          return {
            ok: true,
            text: async () => `
apiVersion: v1
entries:
  traefik:
    - name: traefik
      version: 32.1.0
      created: 2024-01-15T10:00:00Z
      digest: abc123
    - name: traefik
      version: 32.0.0
      created: 2024-01-14T10:00:00Z
      digest: def456
    - name: traefik
      version: 31.0.0
      created: 2024-01-10T10:00:00Z
`,
          } as Response;
        }
        return { ok: false } as Response;
      });

      global.fetch = mockFetch as unknown as typeof fetch;

      const client = create_helm_client({
        repository: 'https://traefik.github.io/charts',
        chart: 'traefik',
      });

      const result = await client.list_tags(undefined as unknown as ImageReferenceType);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0]?.name).toBe('32.1.0');
        expect(result.value[1]?.name).toBe('32.0.0');
        expect(result.value[2]?.name).toBe('31.0.0');
        expect(result.value[0]?.digest).toBe('abc123');
      }
    });

    it('should handle chart not found', async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        text: async () => `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 1.0.0
`,
      }));

      global.fetch = mockFetch as unknown as typeof fetch;

      const client = create_helm_client({
        repository: 'https://example.com/charts',
        chart: 'missing-chart',
      });

      const result = await client.list_tags(undefined as unknown as ImageReferenceType);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HELM_CHART_NOT_FOUND');
      }
    });

    it('should handle fetch errors', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      global.fetch = mockFetch as unknown as typeof fetch;

      const client = create_helm_client({
        repository: 'https://example.com/charts',
        chart: 'test',
      });

      const result = await client.list_tags(undefined as unknown as ImageReferenceType);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HELM_REPO_ERROR');
      }
    });
  });

  describe('OCI Helm Repository', () => {
    it('should delegate to OCI client for OCI repositories', async () => {
      // This test would require mocking the GHCR client
      // For now, we just verify the client is created
      const client = create_helm_client({
        oci: 'oci://ghcr.io/traefik/helm',
        chart: 'traefik',
      });

      expect(client).toBeDefined();
      expect(client.list_tags).toBeDefined();
    });
  });
});
