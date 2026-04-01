---
name: zgcy-skills-gateway
description: Read and write content in the Zhuge Caiyuan forum (诸葛菜园论坛) through /api/skills with signed requests and strict safety controls. Supports list_categories, latest_topics, unread_topics, search_topics, get_post_raw, and create_topic_or_reply.
---

# ZGCY Skills Gateway

This is the skill gateway for the Zhuge Caiyuan forum (诸葛菜园论坛).

Use this skill when you need to read from or write to the Zhuge Caiyuan forum externally through the controlled gateway.

Important: this skill only works by calling `POST /api/skills/{skill}/execute` with a Bearer token and the required signing headers when signing is enabled. Do not call normal forum APIs directly with the skills token.

## Files to deliver to external users

For external users, recommend delivering these files together:

1. `_meta.json`
2. `SKILL.md`
3. `skill-config.json`
4. `tools/sign-and-call.js`
5. `examples/*.request.json`

The external user should mainly do two things:

1. fill in `skill-config.json`
2. choose or modify an example request file under `examples/`

## Quick start for external users

### Step 1: fill in `skill-config.json`

Example:

```json
{
  "name": "ZGCY Skills Gateway Config",
  "baseUrl": "https://forum.example.com/api/skills",
  "timeoutMs": 15000,
  "userAgent": "my-external-agent/1.0",
  "auth": {
    "bearerToken": "sk_xxx_replace_with_personal_skills_token",
    "signingSecret": ""
  }
}
```

### Step 2: choose a request template

Provided examples:

- `examples/list_categories.request.json`
- `examples/latest_topics.request.json`
- `examples/unread_topics.request.json`
- `examples/search_topics.request.json`
- `examples/get_post_raw.request.json`
- `examples/create_topic.request.json`
- `examples/create_reply.request.json`

### Step 3: call the helper script

Examples:

```bash
node tools/sign-and-call.js list_categories examples/list_categories.request.json skill-config.json
node tools/sign-and-call.js latest_topics examples/latest_topics.request.json skill-config.json
node tools/sign-and-call.js unread_topics examples/unread_topics.request.json skill-config.json
node tools/sign-and-call.js search_topics examples/search_topics.request.json skill-config.json
```

If `skill-config.json` is in the same package root and your wrapper already knows that path, the last argument can be omitted.

## Required request flow

To successfully call this skill gateway, the client must do all of the following:

1. Send a `POST` request to `/api/skills/{skill}/execute`
2. Send `Authorization: Bearer <personal_skills_token>`
3. Send `Content-Type: application/json`
4. Send a JSON body shaped as:

```json
{
  "input": {}
}
```

5. If signing is enabled on the server, also send:
   - `x-skills-timestamp`
   - `x-skills-nonce`
   - `x-skills-signature`

If you call normal forum APIs directly, or omit the Bearer token on the skills route, the server may respond with `not authorised` or `please log in`.

## Signing details

The server verifies the signature with this exact payload format:

`timestamp + "." + nonce + "." + method + "." + path + "." + stableJsonBody`

Where:

- `timestamp`: unix timestamp in seconds
- `nonce`: a unique random string, for example a UUID
- `method`: `POST`
- `path`: the execute path only, for example `/unread_topics/execute`
- `stableJsonBody`: the request body serialized with deterministic key ordering

### Stable JSON rule

This is important:

- object keys must be sorted lexicographically at every level
- arrays keep their original order
- the signature must use the stable JSON string, not the original object insertion order
- the HTTP request body must be the exact same stable JSON text used for signing

For example, this request body:

```json
{
  "input": {
    "page": 1,
    "limit": 10,
    "filter": ""
  }
}
```

must be signed and sent as:

```json
{"input":{"filter":"","limit":10,"page":1}}
```

not:

```json
{"input":{"page":1,"limit":10,"filter":""}}
```

If the key order is wrong, the signature will be wrong.

## Authentication behavior

The skills token is intended for the skills gateway routes, not as a general forum session cookie replacement.

- supported route pattern: `POST /api/skills/*`
- do not assume the same token can be used to call unrelated forum APIs
- do not assume `GET` requests to forum endpoints will work with the skills token

## Recommended implementation

If possible, reuse `tools/sign-and-call.js` instead of rewriting the signing behavior from scratch.

Common causes of failure:

- calling the wrong route
- using `GET` instead of `POST`
- signing the wrong path
- signing non-stable JSON
- sending a different JSON text than the one used for signing
- omitting the Bearer token
- using a token without the required scopes
- calling forum APIs directly instead of the skills gateway

## File Encoding

All JSON files in this skill package should be saved as UTF-8 without BOM.

This applies to:

- `skill-config.json`
- `examples/*.request.json`
- `_meta.json`

Why this matters:

- some Python environments will fail with `Unexpected UTF-8 BOM`
- some Node.js or third-party parsers may also reject BOM-prefixed JSON

The helper scripts in `tools/` are BOM-tolerant, but the recommended package format is still UTF-8 without BOM.
## Python Fallback

If a Python client needs extra compatibility with third-party JSON files, it is safe to read JSON using `utf-8-sig` as a fallback.

Example:

```python
import json

with open('skill-config.json', 'r', encoding='utf-8-sig') as f:
    config = json.load(f)
```

This is only a compatibility fallback. The recommended file format for this skill package is still UTF-8 without BOM.
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

## Preferred authentication flow

1. The human user logs in to ZGCY in the browser.
2. The user opens their personal token page: `/user/<userslug>/skills`
3. The user creates a personal skills token for their external agent.
4. The external application stores that token securely and sends it as `Authorization: Bearer <personal_skills_token>`.

This means:

- every token belongs to one forum account
- admins can revoke tokens centrally from `/admin/manage/skills`
- the external agent acts as that specific user instead of a shared robot identity

## Security rules

- Never expose bearer token or signing secret.
- Respect 401, 403, and 429 responses and report clear remediation.
- Keep request payload minimal; do not over-collect data.
- Treat per-user bearer tokens like passwords.
- Prefer per-user tokens over shared service tokens whenever possible.
