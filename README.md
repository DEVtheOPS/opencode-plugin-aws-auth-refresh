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

OpenCode `plugin` entries can be either a string or a `[pluginName, options]` tuple. To pass options to this plugin, use the tuple form:

```json
{
  "plugin": [
    [
      "@devtheops/opencode-plugin-aws-auth-refresh",
      {
        "profile": "my-aws-profile",
        "maxRetries": 1,
        "ssoLoginCommand": {
          "command": "aws",
          "args": ["sso", "login", "--profile", "my-aws-profile", "--no-browser"]
        }
      }
    ]
  ]
}
```

If you do not need any plugin-specific options, use the string form instead:

```json
{
  "plugin": ["@devtheops/opencode-plugin-aws-auth-refresh"]
}
```

If you prefer not to set `profile` in config, the plugin falls back to `AWS_PROFILE`, then to `default`.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `profile` | `string` | `AWS_PROFILE` env or `"default"` | AWS profile to use |
| `maxRetries` | `number` | `1` | Maximum number of credential refresh attempts |
| `ssoLoginCommand` | `{ "command": string, "args"?: string[] }` | `{ "command": "aws", "args": ["sso", "login", "--profile", "<profile>"] }` | Structured custom SSO login command |

### Migration Notes

- `autoRetry` was removed because current OpenCode server plugin hooks do not expose a supported retry API. After credentials refresh, rerun the failed AWS command if needed.
- Raw string `ssoLoginCommand` values are no longer supported. Use the structured `command` and `args` form so command arguments remain data rather than a precomposed shell string.
- Diagnostics are written through `client.app.log` for troubleshooting and are not presented as clickable or session-visible UI notifications.

## How It Works

1. Hooks into the official `tool.execute.after(input, output)` server plugin hook for `bash` and `task` tools
2. Detects AWS authentication error patterns:
   - `ExpiredToken`
   - `TokenRefreshRequired`
   - `The security token included in the request is expired`
   - `Unable to locate credentials`
   - And more...
3. Reads the hook result from `output.output`
4. Runs `aws sso login` with your configured profile, or the configured structured command and args
5. Logs diagnostics through `client.app.log`; rerun the failed command manually if needed

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
- `RequestId:`

## Requirements

- AWS CLI v2 installed
- Valid SSO configuration in `~/.aws/config`

## Diagnostic Log Example

These messages are written through `client.app.log` for diagnostics. They are not shown as clickable or session-visible UI notifications.

```
[aws-auth-refresh] AWS credentials expired, running: aws sso login --profile default
[aws-auth-refresh] AWS credentials refreshed successfully
```

## License

[Mozilla Public License 2.0](LICENSE)
