# ZGCY Forum Write Manifest

- package: `zgcy-forum-write`
- local version: `1.1.0`
- remote manifest: `GET https://zgcy.lab.bza.edu.cn/api/skills/manifest`
- remote version path: `packages.zgcy-forum-write.version`

## Agent Update Check

Before calling any write or token-owned helper skill, compare this local version with the remote manifest version.

If the versions differ, tell the user:

```text
zgcy-forum-write local version 1.1.0 differs from the remote version. Please upgrade this local skill package before relying on current behavior.
```

Do not block the call automatically unless the user or local policy asks for strict version enforcement.

The helper script `tools/sign-and-call.js` performs this check automatically when `skill-config.json.updateCheck.enabled` is true.

