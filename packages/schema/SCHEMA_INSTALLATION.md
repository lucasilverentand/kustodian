# Installing Kustodian Schemas in Your Project

This guide shows how to enable Kustodian JSON Schema validation and autocompletion in your VSCode workspace or other repositories.

## Method 1: Direct `$schema` Reference (Recommended)

Add a `$schema` comment at the top of each YAML file:

```yaml
# $schema: https://kustodian.io/schemas/template.json
apiVersion: kustodian.io/v1
kind: Template
metadata:
  name: my-app
```

**Pros:**
- Works in any editor with YAML/JSON Schema support
- Explicit and visible in the file
- No workspace configuration needed

**Cons:**
- Requires schemas to be hosted at a public URL
- Needs to be added to each file

## Method 2: VSCode Workspace Settings (Best for Teams)

Create or edit `.vscode/settings.json` in your project root:

```json
{
  "yaml.schemas": {
    "https://kustodian.io/schemas/template.json": [
      "templates/*/template.yaml",
      "templates/*/template.yml"
    ],
    "https://kustodian.io/schemas/cluster.json": [
      "clusters/*/cluster.yaml",
      "clusters/*/cluster.yml"
    ],
    "https://kustodian.io/schemas/node.json": [
      "clusters/*/nodes/*.yaml",
      "clusters/*/nodes/*.yml"
    ],
    "https://kustodian.io/schemas/node-profile.json": [
      "profiles/*.yaml",
      "profiles/*.yml"
    ]
  }
}
```

**Pros:**
- Automatic schema application based on file location
- No need to add `$schema` to each file
- Shared with entire team via git

**Cons:**
- VSCode-specific (but similar configs exist for other editors)
- Requires schemas to be hosted

## Method 3: Local npm Package Reference

If you have `@kustodian/schema` installed as a dependency:

```bash
bun add -D @kustodian/schema
```

Then in `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "./node_modules/@kustodian/schema/schemas/template.json": [
      "templates/*/template.yaml"
    ],
    "./node_modules/@kustodian/schema/schemas/cluster.json": [
      "clusters/*/cluster.yaml"
    ],
    "./node_modules/@kustodian/schema/schemas/node.json": [
      "clusters/*/nodes/*.yaml"
    ],
    "./node_modules/@kustodian/schema/schemas/node-profile.json": [
      "profiles/*.yaml"
    ]
  }
}
```

**Pros:**
- Works offline
- Schema version locked to package version
- No dependency on external hosting

**Cons:**
- Requires npm package installation
- Path changes if node_modules location changes

## Method 4: Global VSCode User Settings

For personal use across all projects, edit your global VSCode settings:

**macOS/Linux:** `~/.config/Code/User/settings.json`
**Windows:** `%APPDATA%\Code\User\settings.json`

```json
{
  "yaml.schemas": {
    "https://kustodian.io/schemas/template.json": "**/templates/*/template.{yaml,yml}",
    "https://kustodian.io/schemas/cluster.json": "**/clusters/*/cluster.{yaml,yml}",
    "https://kustodian.io/schemas/node.json": "**/clusters/*/nodes/*.{yaml,yml}",
    "https://kustodian.io/schemas/node-profile.json": "**/profiles/*.{yaml,yml}"
  }
}
```

**Pros:**
- Works in all your projects automatically
- No per-project configuration

**Cons:**
- Only affects your local machine
- May conflict with other projects using similar patterns

## Method 5: SchemaStore (Future)

Once schemas are submitted to [schemastore.org](https://www.schemastore.org/), editors will automatically recognize them based on file patterns without any configuration.

## Recommended Setup for Kustodian Projects

Combine methods for the best experience:

1. **Add `.vscode/settings.json`** to your repository with Method 2 (commit it)
2. **Optionally add `$schema` comments** to example/documentation files for clarity
3. **Install `@kustodian/schema`** as a dev dependency for offline validation

### Example `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "https://kustodian.io/schemas/template.json": [
      "templates/*/template.yaml",
      "templates/*/template.yml"
    ],
    "https://kustodian.io/schemas/cluster.json": [
      "clusters/*/cluster.yaml",
      "clusters/*/cluster.yml"
    ],
    "https://kustodian.io/schemas/node.json": [
      "clusters/*/nodes/*.yaml",
      "clusters/*/nodes/*.yml"
    ],
    "https://kustodian.io/schemas/node-profile.json": [
      "profiles/*.yaml",
      "profiles/*.yml"
    ]
  },
  "yaml.customTags": [
    "!ENV scalar",
    "!ENV sequence"
  ],
  "files.associations": {
    "**/templates/*/template.{yaml,yml}": "yaml",
    "**/clusters/*/cluster.{yaml,yml}": "yaml",
    "**/clusters/*/nodes/*.{yaml,yml}": "yaml"
  }
}
```

## Required VSCode Extensions

Install the YAML extension for schema support:

```bash
code --install-extension redhat.vscode-yaml
```

Or search for "YAML" by Red Hat in the VSCode extensions marketplace.

## Troubleshooting

### Schemas not working?

1. **Check the YAML extension is installed**: `Cmd+Shift+P` → "YAML: Show Document Symbols"
2. **Verify schema URL is accessible**: Open the schema URL in a browser
3. **Check output panel**: `View` → `Output` → Select "YAML Support" to see errors
4. **Reload VSCode**: `Cmd+Shift+P` → "Reload Window"

### Schema validation errors?

1. **Update to latest schema version**: Re-run `bun run generate-schemas` in the schema package
2. **Check for schema breaking changes**: See [CHANGELOG.md](../../CHANGELOG.md)
3. **Verify YAML syntax**: Ensure proper indentation and structure

## Schema URLs

When schemas are published, they will be available at:

- Template: `https://kustodian.io/schemas/template.json`
- Cluster: `https://kustodian.io/schemas/cluster.json`
- Node: `https://kustodian.io/schemas/node.json`
- NodeProfile: `https://kustodian.io/schemas/node-profile.json`

**Note:** These URLs require the schemas to be hosted on kustodian.io. Until then, use local file references (Method 3).
