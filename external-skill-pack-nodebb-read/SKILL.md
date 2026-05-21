---
name: zgcy-forum-read
description: Public read-only access to the Zhuge Caiyuan forum through /api/skills without a personal token. Use for listing categories, latest visible topics, public unread-style topic listings, department daily digest, topic/post search, and reading raw post content. Does not create, edit, reply, or delete content.
---

# ZGCY Forum Read

Use this skill when you only need to view forum content through the controlled skills gateway.

## Auth

No personal skills token is required for this read-only skill. Leave `auth.bearerToken` empty in `skill-config.json`.

The server may still restrict access by source IP using `SKILLS_ALLOWED_IPS`.

## Available Skills

- `list_categories`: list visible categories
- `latest_topics`: list latest visible topics
- `unread_topics`: list unread topics when authenticated by server context, otherwise return a public latest-topic style listing
- `department_daily_digest`: get relevant auto-published article topics for a department/person profile
- `search_topics`: search visible topics/posts
- `get_post_raw`: fetch raw post content by `pid`

## Request Flow

Call:

```text
POST /api/skills/{skill}/execute
Content-Type: application/json
```

Body:

```json
{
  "input": {}
}
```

Do not send a Bearer token for this read-only skill.

## Helper Script

```bash
node tools/sign-and-call.js list_categories examples/list_categories.request.json skill-config.json
node tools/sign-and-call.js latest_topics examples/latest_topics.request.json skill-config.json
node tools/sign-and-call.js search_topics examples/search_topics.request.json skill-config.json
node tools/sign-and-call.js get_post_raw examples/get_post_raw.request.json skill-config.json
```

See `skills/*.md` for per-skill inputs and outputs.
