# @kustodian/core

Core utilities, error handling, and Result type for Kustodian.

## Installation

```bash
bun add @kustodian/core
```

## API Overview

### Result Type

A discriminated union type for type-safe error handling without exceptions.

```typescript
import { success, failure, is_success, unwrap, from_promise } from '@kustodian/core';

// Create results
const ok = success(42);
const err = failure(new Error('Something went wrong'));

// Check and unwrap
if (is_success(ok)) {
  console.log(ok.value); // 42
}

// Transform results
map_result(ok, (n) => n * 2);  // success(84)
flat_map(ok, (n) => success(n + 1));

// Combine multiple results
combine([success(1), success(2), success(3)]); // success([1, 2, 3])

// Convert promises to results
const result = await from_promise(fetch('/api'));
```

### Error Handling

Structured error types with predefined error codes.

```typescript
import { Errors, ErrorCodes, format_error, is_kustodian_error } from '@kustodian/core';

// Create errors using factory functions
const error = Errors.file_not_found('/path/to/file');
const validation = Errors.validation_error('Invalid input');

// Format for display
console.log(format_error(error)); // [FILE_NOT_FOUND] File not found: /path/to/file
```

### Logger

Configurable logging with context support.

```typescript
import { create_console_logger, create_silent_logger } from '@kustodian/core';

const logger = create_console_logger({ level: 'debug' });
logger.info('Starting operation', { userId: 123 });

// Create child loggers with inherited context
const childLogger = logger.child({ module: 'auth' });
```

### Path Utilities

Cross-platform path manipulation functions.

```typescript
import { join_paths, normalize_path, relative_path, matches_pattern } from '@kustodian/core';

join_paths('src', 'components', 'Button.tsx');
normalize_path('./src/../lib/');
matches_pattern('config.yaml', ['*.yaml', '*.yml']);
```

### Type Utilities

TypeScript utility types for deep object manipulation.

```typescript
import type { DeepPartialType, DeepReadonlyType, BrandedType } from '@kustodian/core';

type Config = DeepPartialType<FullConfig>;
type UserId = BrandedType<string, 'UserId'>;
```

## License

MIT

## Links

- [Repository](https://github.com/lucasilverentand/kustodian)
