# opencode-plugin-aws-auth-refresh

An OpenCode plugin that automatically detects AWS authentication errors and refreshes credentials via `aws sso login`.

[![npm version](https://img.shields.io/npm/v/@devtheops/opencode-plugin-aws-auth-refresh.svg)](https://www.npmjs.com/package/@devtheops/opencode-plugin-aws-auth-refresh)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-informational.svg)](https://opensource.org/licenses/MPL-2.0)

## Installation

### From npm

Add to your `opencode.json`:

```json
{
  "plugin": ["@devtheops/opencode-plugin-aws-auth-refresh"]
}
```

### Local Installation

Place in `.opencode/plugins/aws-auth-refresh.ts` or `~/.config/opencode/plugins/`.

## Configuration

Configure in your `opencode.json`:

```json
{
  "plugin": [
    ["@devtheops/opencode-plugin-aws-auth-refresh", {
      "profile": "my-aws-profile",
      "autoRetry": true,
      "maxRetries": 1,
      "ssoLoginCommand": "aws sso login --profile my-profile --no-browser"
    }]
  ]
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `profile` | `string` | `AWS_PROFILE` env or `"default"` | AWS profile to use |
| `autoRetry` | `boolean` | `true` | Automatically retry the failed command after refresh |
| `maxRetries` | `number` | `1` | Maximum number of retry attempts |
| `ssoLoginCommand` | `string` | `aws sso login --profile <profile>` | Custom SSO login command |

## How It Works

1. Hooks into `tool.execute.after` to inspect tool outputs
2. Detects AWS authentication error patterns:
   - `ExpiredToken`
   - `TokenRefreshRequired`
   - `The security token included in the request is expired`
   - `Unable to locate credentials`
   - And more...
3. Runs `aws sso login` with your configured profile
4. Optionally retries the failed command

## Detected Error Patterns

- `ExpiredToken`
- `TokenRefreshRequired`
- `The security token included in the request is expired`
- `credentials expired`
- `Unable to locate credentials`
- `Missing credentials`
- `credentials could not be found`
- `Error retrieving credentials`
- `EC2MetadataServiceError`

## Requirements

- AWS CLI v2 installed
- Valid SSO configuration in `~/.aws/config`

## Example Output

```
[aws-auth-refresh] AWS credentials expired, running: aws sso login --profile default
[aws-auth-refresh] AWS credentials refreshed successfully
[aws-auth-refresh] Retrying tool after credential refresh
```

## License

[Mozilla Public License 2.0](LICENSE)