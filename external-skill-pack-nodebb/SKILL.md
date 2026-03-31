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

## Preferred authentication flow

1. The human user logs in to ZGCY in the browser.
2. The user opens their personal token page: `/user/<userslug>/skills`
3. The user creates a personal skills token for their external agent.
4. The external application stores that token securely and sends it as `Authorization: Bearer <personal_skills_token>`.

This means:

- every token belongs to one forum account
- admins can revoke tokens centrally from `/admin/manage/skills`
- the external agent acts as that specific user instead of a shared robot identity

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
- Treat per-user bearer tokens like passwords.
- Prefer per-user tokens over shared service tokens whenever possible.
