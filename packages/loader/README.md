# @kustodian/loader

YAML file loading and validation utilities for Kustodian projects. This package provides type-safe functions to load, parse, and validate Kustodian configuration files including projects, clusters, templates, and node profiles.

## Installation

```bash
bun add @kustodian/loader
```

## API Overview

### YAML Utilities

- `parse_yaml<T>(content)` - Parse a YAML string into a typed object
- `parse_multi_yaml<T>(content)` - Parse multi-document YAML (separated by `---`)
- `stringify_yaml<T>(data)` - Convert an object to a YAML string

### File Operations

- `file_exists(path)` - Check if a file exists
- `is_directory(path)` - Check if a path is a directory
- `read_file(path)` - Read file contents as string
- `write_file(path, content)` - Write content to file (creates directories as needed)
- `read_yaml_file<T>(path)` - Read and parse a YAML file
- `read_multi_yaml_file<T>(path)` - Read and parse a multi-document YAML file
- `write_yaml_file<T>(path, data)` - Write an object as YAML to file
- `list_files(dir, extension?)` - List files in directory with optional extension filter
- `list_directories(dir)` - List subdirectories in a directory

### Project Loading

- `find_project_root(startPath)` - Find project root by locating `kustodian.yaml`
- `load_project(projectRoot)` - Load a complete Kustodian project with all resources
- `load_template(templateDir)` - Load a single template
- `load_all_templates(projectRoot)` - Load all templates from `templates/` directory
- `load_cluster(clusterDir)` - Load a single cluster with its nodes
- `load_all_clusters(projectRoot)` - Load all clusters from `clusters/` directory
- `load_cluster_nodes(clusterDir, paths?)` - Load node definitions from files or directories

### Profile Loading

- `load_all_profiles(projectRoot)` - Load all node profiles from `profiles/` directory
- `get_profile(profiles, name)` - Get a profile by name from a profiles map

### Constants

- `StandardFiles` - Standard file names (`template.yaml`, `cluster.yaml`, `nodes.yaml`, `kustodian.yaml`)
- `StandardDirs` - Standard directory names (`templates`, `clusters`, `nodes`, `profiles`)

All functions return `ResultType<T, KustodianErrorType>` for type-safe error handling.

## License

MIT

## Repository

[https://github.com/lucasilverentand/kustodian](https://github.com/lucasilverentand/kustodian)
