// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeRapide from 'starlight-theme-rapide';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			plugins: [starlightThemeRapide()],
			title: 'Kustodian',
			description: 'A GitOps templating framework for Kubernetes with Flux CD',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/lucasilverentand/kustodian' },
			],
			editLink: {
				baseUrl: 'https://github.com/lucasilverentand/kustodian/edit/main/docs/',
			},
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
						{ label: 'Project Structure', slug: 'getting-started/project-structure' },
					],
				},
				{
					label: 'Core Concepts',
					items: [
						{ label: 'Overview', slug: 'concepts/overview' },
						{ label: 'Projects', slug: 'concepts/projects' },
						{ label: 'Clusters', slug: 'concepts/clusters' },
						{ label: 'Templates', slug: 'concepts/templates' },
						{ label: 'Nodes', slug: 'concepts/nodes' },
						{ label: 'Node Profiles', slug: 'concepts/node-profiles' },
						{ label: 'Substitutions', slug: 'concepts/substitutions' },
						{ label: 'Flux Integration', slug: 'concepts/flux-integration' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Creating Templates', slug: 'guides/creating-templates' },
						{ label: 'Defining Nodes', slug: 'guides/defining-nodes' },
						{ label: 'Using Profiles', slug: 'guides/using-profiles' },
						{ label: 'Template Dependencies', slug: 'guides/template-dependencies' },
						{ label: 'Multi-Cluster Setup', slug: 'guides/multi-cluster' },
						{ label: 'CI/CD Integration', slug: 'guides/ci-cd' },
					],
				},
				{
					label: 'Reference',
					items: [
						{
							label: 'CLI Commands',
							collapsed: true,
							items: [
								{ label: 'init', slug: 'reference/cli/init' },
								{ label: 'validate', slug: 'reference/cli/validate' },
								{ label: 'bootstrap', slug: 'reference/cli/bootstrap' },
								{ label: 'apply', slug: 'reference/cli/apply' },
							],
						},
						{
							label: 'Configuration',
							collapsed: true,
							items: [
								{ label: 'Project (kustodian.yaml)', slug: 'reference/config/project' },
								{ label: 'Cluster', slug: 'reference/config/cluster' },
								{ label: 'Template', slug: 'reference/config/template' },
								{ label: 'Node', slug: 'reference/config/node' },
								{ label: 'NodeProfile', slug: 'reference/config/profile' },
							],
						},
					],
				},
				{
					label: 'Plugins',
					items: [
						{ label: 'Overview', slug: 'plugins/overview' },
						{ label: 'k0s Provider', slug: 'plugins/k0s' },
						{ label: 'Creating Plugins', slug: 'plugins/creating-plugins' },
					],
				},
				{
					label: 'Contributing',
					items: [
						{ label: 'Guidelines', slug: 'contributing/guidelines' },
						{ label: 'Development Setup', slug: 'contributing/development' },
						{ label: 'Architecture', slug: 'contributing/architecture' },
					],
				},
			],
		}),
	],
});
