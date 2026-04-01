---
name: ZGCY-skills-gateway
description: Query and write ZGCY content through /api/skills with signed requests and strict safety controls. Supports list_categories, latest_topics, unread_topics, search_topics, get_post_raw, and create_topic_or_reply.
---

# ZGCY Skills Gateway

Use this skill when you need to interact with ZGCY externally through the controlled gateway.

## Files provided to external users

The external delivery can contain these three files:

1. `_meta.json`
2. `SKILL.md`
3. `skill-config.json`

The external user only needs to copy `skill-config.json` to their own config file and fill in the values.
They should not need any extra command-line step from your side.

## Supported remote skills

1. `list_categories`
2. `latest_topics`
3. `unread_topics`
4. `search_topics`
5. `get_post_raw`
6. `create_topic_or_reply`

## Read examples

### List categories

```json
{
  "input": {}
}
```

### Get latest topics

```json
{
  "input": {
    "page": 1,
    "limit": 5
  }
}
```

Optional filters:

- `categories`: array of category ids
- `tags`: array of tag strings

Example:

```json
{
  "input": {
    "page": 1,
    "limit": 5,
    "categories": [2],
    "tags": ["智能体"]
  }
}
```

### Get unread topics

```json
{
  "input": {
    "page": 1,
    "limit": 5,
    "filter": ""
  }
}
```

`filter` can be:

- `""`
- `"new"`
- `"watched"`
- `"unreplied"`

Example:

```json
{
  "input": {
    "page": 1,
    "limit": 5,
    "filter": "new"
  }
}
```

### Search topics

```json
{
  "input": {
    "query": "Claude Code",
    "page": 1,
    "limit": 5
  }
}
```

### Get raw post content

```json
{
  "input": {
    "pid": 208
  }
}
```

## Write examples

### Create a topic by category id

```json
{
  "input": {
    "cid": 5,
    "title": "大家都是怎么用Skill的",
    "content": "我主要用 Skill 查帖子和发帖，挺顺手。"
  }
}
```

### Create a topic by category name

```json
{
  "input": {
    "categoryName": "闲聊杂谈",
    "title": "大家都是怎么用Skill的",
    "content": "我主要用 Skill 查帖子和发帖，挺顺手。"
  }
}
```

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

## User config file

Provide the external user with this config template:

File: `skill-config.json`

```json
{
  "name": "ZGCY Skills Gateway Config",
  "baseUrl": "https://forum.example.com/api/skills",
  "timeoutMs": 15000,
  "userAgent": "my-external-agent/1.0",
  "auth": {
    "bearerToken": "sk_xxx_replace_with_personal_skills_token",
    "signingSecret": ""
  },
  "permissions": {
    "allowRead": true,
    "allowWrite": false
  }
}
```

Field meanings:

- `baseUrl`: the ZGCY gateway address, normally `/api/skills`
- `auth.bearerToken`: the personal token created by the logged-in user
- `auth.signingSecret`: optional, only needed if the server enabled request signing
- `timeoutMs`: optional request timeout
- `userAgent`: optional client identifier for troubleshooting
- `permissions.allowRead`: whether the external side should enable read-type operations
- `permissions.allowWrite`: whether the external side should enable write-type operations

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

- Only write when user explicitly asks to publish, post, or reply.
- For new topic: require `cid`, `title`, `content`.
- For reply: require `tid`, `content`.
- Return identifiers (`tid`, `pid`) after successful write.

## Security rules

- Never expose bearer token or signing secret.
- Respect 401, 403, and 429 responses and report clear remediation.
- Keep request payload minimal; do not over-collect data.
- Treat per-user bearer tokens like passwords.
- Prefer per-user tokens over shared service tokens whenever possible.
