import { describe, expect, test } from 'bun:test';
import { detect_registry_type, parse_image_reference } from '../src/client.js';

describe('parse_image_reference', () => {
  test('parses simple Docker Hub image', () => {
    const result = parse_image_reference('nginx');
    expect(result).toEqual({
      registry: 'docker.io',
      namespace: 'library',
      repository: 'nginx',
      tag: undefined,
    });
  });

  test('parses Docker Hub image with namespace', () => {
    const result = parse_image_reference('prom/prometheus');
    expect(result).toEqual({
      registry: 'docker.io',
      namespace: 'prom',
      repository: 'prometheus',
      tag: undefined,
    });
  });

  test('parses Docker Hub image with tag', () => {
    const result = parse_image_reference('prom/prometheus:v2.45.0');
    expect(result).toEqual({
      registry: 'docker.io',
      namespace: 'prom',
      repository: 'prometheus',
      tag: 'v2.45.0',
    });
  });

  test('parses GHCR image', () => {
    const result = parse_image_reference('ghcr.io/linuxserver/sonarr');
    expect(result).toEqual({
      registry: 'ghcr.io',
      namespace: 'linuxserver',
      repository: 'sonarr',
      tag: undefined,
    });
  });

  test('parses GHCR image with tag', () => {
    const result = parse_image_reference('ghcr.io/linuxserver/sonarr:4.0.2');
    expect(result).toEqual({
      registry: 'ghcr.io',
      namespace: 'linuxserver',
      repository: 'sonarr',
      tag: '4.0.2',
    });
  });

  test('parses custom registry', () => {
    const result = parse_image_reference('registry.example.com/myorg/myimage:latest');
    expect(result).toEqual({
      registry: 'registry.example.com',
      namespace: 'myorg',
      repository: 'myimage',
      tag: 'latest',
    });
  });
});

describe('detect_registry_type', () => {
  test('detects Docker Hub', () => {
    const image = parse_image_reference('nginx');
    expect(detect_registry_type(image)).toBe('dockerhub');
  });

  test('detects GHCR', () => {
    const image = parse_image_reference('ghcr.io/org/image');
    expect(detect_registry_type(image)).toBe('ghcr');
  });

  test('defaults to dockerhub for unknown registries', () => {
    const image = parse_image_reference('registry.example.com/org/image');
    expect(detect_registry_type(image)).toBe('dockerhub');
  });
});
