---
name: ZGCY-skills-gateway
description: Query and write ZGCY content through /api/skills with signed requests and strict safety controls. Supports search_topics, get_post_raw, and create_topic_or_reply.
---

# ZGCY Skills Gateway

Use this skill when you need to interact with ZGCY externally through the controlled gateway.

## Supported remote skills

1. `search_topics`
2. `get_post_raw`
3. `create_topic_or_reply`

## API contract

- Base URL: `https://<host>/api/skills`
- Discover: `GET /manifest`
- Execute: `POST /{skill}/execute`
- Body:

```json
{
  "input": {}
}
```

## Signing

If `SKILLS_SIGNING_SECRET` is enabled on server, send:

- `x-skills-timestamp`
- `x-skills-nonce`
- `x-skills-signature`

Signature algorithm:

`HMAC_SHA256_HEX(secret, timestamp + "." + nonce + "." + method + "." + path + "." + stableJsonBody)`

Where:

- `method` is `POST`
- `path` example: `/search_topics/execute`
- `stableJsonBody` means JSON with deterministic key order

## Posting rules

- Only write when user explicitly asks to publish/post/reply.
- For new topic: require `cid`, `title`, `content`.
- For reply: require `tid`, `content`.
- Return identifiers (`tid`, `pid`) after successful write.

## Security rules

- Never expose bearer token or signing secret.
- Respect 401/403/429 responses and report clear remediation.
- Keep request payload minimal; do not over-collect data.