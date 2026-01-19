import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { create_generator } from '../packages/generator/src/index.js';
import { load_project } from '../packages/loader/src/index.js';

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures');
const SILVERSWARM_FEATURES = path.join(FIXTURES_DIR, 'silverswarm-features');

describe('Phase 2: Silverswarm Feature Validation', () => {
  describe('Template Loading', () => {
    it('should load all templates successfully', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      expect(project.templates.length).toBe(3);

      const template_names = project.templates.map((t) => t.template.metadata.name);
      expect(template_names).toContain('secrets');
      expect(template_names).toContain('database');
      expect(template_names).toContain('media');
    });

    it('should parse cluster configuration with secret providers', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0];
      expect(cluster).toBeDefined();

      if (!cluster) return;

      // Verify OCI configuration
      expect(cluster.cluster.spec.oci).toBeDefined();
      expect(cluster.cluster.spec.oci?.registry).toBe('ghcr.io');
      expect(cluster.cluster.spec.oci?.repository).toBe('test-org/kustodian');

      // Verify secret provider configuration
      expect(cluster.cluster.spec.secrets?.doppler).toBeDefined();
      expect(cluster.cluster.spec.secrets?.onepassword).toBeDefined();
    });
  });

  describe('Dependency Resolution', () => {
    it('should resolve within-template dependencies correctly', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find secrets-replicator kustomization
      const replicator = result.value.kustomizations.find((k) => k.name === 'secrets-replicator');
      expect(replicator).toBeDefined();

      if (!replicator) return;

      // Should depend on doppler within same template
      const depends_on = replicator.flux_kustomization.spec.dependsOn;
      expect(depends_on).toBeDefined();
      expect(depends_on?.length).toBeGreaterThan(0);
      expect(depends_on?.some((d) => d.name === 'secrets-doppler')).toBe(true);
    });

    it('should resolve cross-template dependencies correctly', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find media-arr-proxy kustomization
      const arr_proxy = result.value.kustomizations.find((k) => k.name === 'media-arr-proxy');
      expect(arr_proxy).toBeDefined();

      if (!arr_proxy) return;

      // Should depend on secrets/doppler (cross-template)
      const depends_on = arr_proxy.flux_kustomization.spec.dependsOn;
      expect(depends_on).toBeDefined();
      expect(depends_on?.some((d) => d.name === 'secrets-doppler')).toBe(true);
    });

    it('should resolve raw external dependencies correctly', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find database-cnpg kustomization
      const cnpg = result.value.kustomizations.find((k) => k.name === 'database-cnpg');
      expect(cnpg).toBeDefined();

      if (!cnpg) return;

      // Should have raw dependency with explicit name and namespace
      const depends_on = cnpg.flux_kustomization.spec.dependsOn;
      expect(depends_on).toBeDefined();
      expect(
        depends_on?.some((d) => d.name === 'secrets-doppler' && d.namespace === 'flux-system'),
      ).toBe(true);
    });
  });

  describe('Health Check Generation', () => {
    it('should generate standard health checks with custom apiVersion', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find secrets-doppler with HelmRelease health check
      const doppler = result.value.kustomizations.find((k) => k.name === 'secrets-doppler');
      expect(doppler).toBeDefined();

      if (!doppler) return;

      const health_checks = doppler.flux_kustomization.spec.healthChecks;
      expect(health_checks).toBeDefined();
      expect(health_checks?.length).toBeGreaterThan(0);

      const helm_check = health_checks?.find((h) => h.kind === 'Deployment');
      expect(helm_check).toBeDefined();
      expect(helm_check?.apiVersion).toBe('helm.toolkit.fluxcd.io/v2');
    });

    it('should generate CEL health check expressions', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find database-app-db with CEL expressions
      const app_db = result.value.kustomizations.find((k) => k.name === 'database-app-db');
      expect(app_db).toBeDefined();

      if (!app_db) return;

      const custom_health_checks = app_db.flux_kustomization.spec.customHealthChecks;
      expect(custom_health_checks).toBeDefined();
      expect(custom_health_checks?.length).toBeGreaterThan(0);

      const cel_check = custom_health_checks?.[0];
      expect(cel_check).toBeDefined();
      expect(cel_check?.apiVersion).toBe('postgresql.cnpg.io/v1');
      expect(cel_check?.kind).toBe('Cluster');
      expect(cel_check?.current).toContain('status.conditions.filter');
      expect(cel_check?.failed).toContain('status.conditions.filter');
    });

    it('should generate multiple health checks per kustomization', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find media-shared-storage with multiple PVC health checks
      const storage = result.value.kustomizations.find((k) => k.name === 'media-shared-storage');
      expect(storage).toBeDefined();

      if (!storage) return;

      const health_checks = storage.flux_kustomization.spec.healthChecks;
      expect(health_checks).toBeDefined();
      expect(health_checks?.length).toBe(2);
      expect(health_checks?.every((h) => h.kind === 'PersistentVolumeClaim')).toBe(true);
    });
  });

  describe('Substitution Processing', () => {
    it('should process Helm version substitutions', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const secrets_template = project.templates.find(
        (t) => t.template.metadata.name === 'secrets',
      );
      expect(secrets_template).toBeDefined();

      if (!secrets_template) return;

      const doppler_kustomization = secrets_template.template.spec.kustomizations.find(
        (k) => k.name === 'doppler',
      );
      expect(doppler_kustomization).toBeDefined();

      if (!doppler_kustomization) return;

      const helm_sub = doppler_kustomization.substitutions?.find((s) => s.type === 'helm');
      expect(helm_sub).toBeDefined();
      expect(helm_sub?.name).toBe('doppler_version');
      if (helm_sub?.type === 'helm') {
        expect(helm_sub.helm.repository).toBeDefined();
        expect(helm_sub.helm.chart).toBe('doppler-kubernetes-operator');
      }
    });

    it('should process Image version substitutions', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const media_template = project.templates.find((t) => t.template.metadata.name === 'media');
      expect(media_template).toBeDefined();

      if (!media_template) return;

      const qbittorrent_kustomization = media_template.template.spec.kustomizations.find(
        (k) => k.name === 'qbittorrent',
      );
      expect(qbittorrent_kustomization).toBeDefined();

      if (!qbittorrent_kustomization) return;

      const version_subs = qbittorrent_kustomization.substitutions?.filter(
        (s) => s.type === 'version',
      );
      expect(version_subs).toBeDefined();
      expect(version_subs?.length).toBeGreaterThan(0);

      const qbit_version = version_subs?.find((s) => s.name === 'qbittorrent_version');
      expect(qbit_version).toBeDefined();
      if (qbit_version?.type === 'version') {
        expect(qbit_version.registry.type).toBe('dockerhub');
        expect(qbit_version.registry.image).toBe('linuxserver/qbittorrent');
      }
    });

    it('should handle preserveCase substitutions', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const media_template = project.templates.find((t) => t.template.metadata.name === 'media');
      expect(media_template).toBeDefined();

      if (!media_template) return;

      const qbittorrent_kustomization = media_template.template.spec.kustomizations.find(
        (k) => k.name === 'qbittorrent',
      );
      expect(qbittorrent_kustomization).toBeDefined();

      if (!qbittorrent_kustomization) return;

      const timezone_sub = qbittorrent_kustomization.substitutions?.find(
        (s) => s.name === 'default_timezone',
      );
      expect(timezone_sub).toBeDefined();
      if (timezone_sub && 'preserve_case' in timezone_sub) {
        expect(timezone_sub.preserve_case).toBe(true);
      }
    });

    it('should handle 1Password substitutions', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const database_template = project.templates.find(
        (t) => t.template.metadata.name === 'database',
      );
      expect(database_template).toBeDefined();

      if (!database_template) return;

      const app_db_kustomization = database_template.template.spec.kustomizations.find(
        (k) => k.name === 'app-db',
      );
      expect(app_db_kustomization).toBeDefined();

      if (!app_db_kustomization) return;

      const onepassword_sub = app_db_kustomization.substitutions?.find(
        (s) => s.type === '1password',
      );
      expect(onepassword_sub).toBeDefined();
      expect(onepassword_sub?.name).toBe('db_password');
      if (onepassword_sub?.type === '1password') {
        expect(onepassword_sub.ref).toBe('op://infrastructure/postgres-app/password');
      }
    });

    it('should handle Doppler substitutions', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const database_template = project.templates.find(
        (t) => t.template.metadata.name === 'database',
      );
      expect(database_template).toBeDefined();

      if (!database_template) return;

      const app_db_kustomization = database_template.template.spec.kustomizations.find(
        (k) => k.name === 'app-db',
      );
      expect(app_db_kustomization).toBeDefined();

      if (!app_db_kustomization) return;

      const doppler_sub = app_db_kustomization.substitutions?.find((s) => s.type === 'doppler');
      expect(doppler_sub).toBeDefined();
      expect(doppler_sub?.name).toBe('backup_credentials');
      if (doppler_sub?.type === 'doppler') {
        expect(doppler_sub.config).toBe('infrastructure');
        expect(doppler_sub.secret).toBe('POSTGRES_BACKUP_KEY');
      }
    });
  });

  describe('Preservation Modes', () => {
    it('should apply stateful preservation mode', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find secrets-replicator with stateful preservation
      const replicator = result.value.kustomizations.find((k) => k.name === 'secrets-replicator');
      expect(replicator).toBeDefined();

      if (!replicator) return;

      // Should have patches with kustodian.io/preserve label
      const patches = replicator.flux_kustomization.spec.patches;
      expect(patches).toBeDefined();
      expect(patches?.length).toBeGreaterThan(0);

      const pvc_patch = patches?.find((p) => p.target.kind === 'PersistentVolumeClaim');
      expect(pvc_patch).toBeDefined();
      expect(pvc_patch?.patch).toContain('kustodian.io/preserve: "true"');
    });

    it('should apply custom preservation with specific resources', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find database-app-db with custom preservation
      const app_db = result.value.kustomizations.find((k) => k.name === 'database-app-db');
      expect(app_db).toBeDefined();

      if (!app_db) return;

      // Should have patches for specific resources
      const patches = app_db.flux_kustomization.spec.patches;
      expect(patches).toBeDefined();
      expect(patches?.length).toBeGreaterThan(0);
    });
  });

  describe('Per-Kustomization Enablement', () => {
    it('should exclude disabled kustomizations from generation', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // secrets-external-secrets-store should be excluded (disabled in cluster config)
      const external_secrets_store = result.value.kustomizations.find(
        (k) => k.name === 'secrets-external-secrets-store',
      );
      expect(external_secrets_store).toBeUndefined();

      // media-sabnzbd should be excluded (disabled in cluster config)
      const sabnzbd = result.value.kustomizations.find((k) => k.name === 'media-sabnzbd');
      expect(sabnzbd).toBeUndefined();
    });

    it('should include enabled kustomizations', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // All explicitly enabled kustomizations should be present
      const enabled_kustomizations = [
        'secrets-doppler',
        'secrets-replicator',
        'database-cnpg',
        'database-app-db',
        'media-arr-proxy',
        'media-shared-storage',
        'media-qbittorrent',
      ];

      for (const name of enabled_kustomizations) {
        const kustomization = result.value.kustomizations.find((k) => k.name === name);
        expect(kustomization).toBeDefined();
      }
    });
  });

  describe('Auth Configuration', () => {
    it('should include auth configuration in kustomizations', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const media_template = project.templates.find((t) => t.template.metadata.name === 'media');
      expect(media_template).toBeDefined();

      if (!media_template) return;

      const qbittorrent_kustomization = media_template.template.spec.kustomizations.find(
        (k) => k.name === 'qbittorrent',
      );
      expect(qbittorrent_kustomization).toBeDefined();

      if (!qbittorrent_kustomization) return;

      const auth = qbittorrent_kustomization.auth;
      expect(auth).toBeDefined();
      expect(auth?.provider).toBe('authelia');
      expect(auth?.type).toBe('proxy');
      expect(auth?.app_name).toBe('qbittorrent');
      expect(auth?.app_display_name).toBe('qBittorrent');
    });

    it('should support different auth providers', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const media_template = project.templates.find((t) => t.template.metadata.name === 'media');
      expect(media_template).toBeDefined();

      if (!media_template) return;

      // qBittorrent uses authelia
      const qbittorrent = media_template.template.spec.kustomizations.find(
        (k) => k.name === 'qbittorrent',
      );
      expect(qbittorrent?.auth?.provider).toBe('authelia');

      // SABnzbd uses authentik
      const sabnzbd = media_template.template.spec.kustomizations.find((k) => k.name === 'sabnzbd');
      expect(sabnzbd?.auth?.provider).toBe('authentik');
    });
  });

  describe('Node Requirements', () => {
    it('should parse template-level node requirements', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const database_template = project.templates.find(
        (t) => t.template.metadata.name === 'database',
      );
      expect(database_template).toBeDefined();

      if (!database_template) return;

      const requirements = database_template.template.spec.requirements;
      expect(requirements).toBeDefined();
      expect(requirements?.length).toBeGreaterThan(0);

      const db_node_requirement = requirements?.[0];
      expect(db_node_requirement).toBeDefined();
      if (db_node_requirement && db_node_requirement.type === 'nodeLabel') {
        expect(db_node_requirement.key).toBe('silverswarm.io/db');
        expect(db_node_requirement.value).toBe('true');
        expect(db_node_requirement.atLeast).toBe(1);
      }
    });

    it('should support multiple node requirement rules', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const media_template = project.templates.find((t) => t.template.metadata.name === 'media');
      expect(media_template).toBeDefined();

      if (!media_template) return;

      const requirements = media_template.template.spec.requirements;
      expect(requirements).toBeDefined();
      expect(requirements?.length).toBe(2);

      // Should have both media-downloaders and media-vpn requirements
      const downloaders_req = requirements?.find(
        (n) => n.type === 'nodeLabel' && n.key === 'silverswarm.io/media-downloaders',
      );
      expect(downloaders_req).toBeDefined();

      const vpn_req = requirements?.find(
        (n) => n.type === 'nodeLabel' && n.key === 'silverswarm.io/media-vpn',
      );
      expect(vpn_req).toBeDefined();
    });
  });

  describe('Flux Resource Generation', () => {
    it('should generate valid Flux Kustomizations', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verify all kustomizations have valid structure
      for (const kustomization of result.value.kustomizations) {
        expect(kustomization.flux_kustomization.apiVersion).toBe('kustomize.toolkit.fluxcd.io/v1');
        expect(kustomization.flux_kustomization.kind).toBe('Kustomization');
        expect(kustomization.flux_kustomization.metadata.name).toBeTruthy();
        expect(kustomization.flux_kustomization.metadata.namespace).toBe('flux-system');
        expect(kustomization.flux_kustomization.spec.sourceRef).toBeDefined();
        expect(kustomization.flux_kustomization.spec.path).toBeTruthy();
      }
    });

    it('should generate OCIRepository when OCI mode is enabled', async () => {
      const project_result = await load_project(SILVERSWARM_FEATURES);
      expect(project_result.success).toBe(true);

      if (!project_result.success) return;

      const project = project_result.value;
      const cluster = project.clusters[0]?.cluster;
      expect(cluster).toBeDefined();

      if (!cluster) return;

      const templates = project.templates.map((t) => t.template);
      const generator = create_generator({ flux_namespace: 'flux-system' });
      const result = await generator.generate(cluster, templates);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should generate OCIRepository
      expect(result.value.oci_repository).toBeDefined();
      expect(result.value.oci_repository?.apiVersion).toBe('source.toolkit.fluxcd.io/v1');
      expect(result.value.oci_repository?.kind).toBe('OCIRepository');
      expect(result.value.oci_repository?.spec.url).toBe('oci://ghcr.io/test-org/kustodian');
    });
  });
});
