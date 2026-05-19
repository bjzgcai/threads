---
name: zgcy-forum-write
description: Token-owned write access to the Zhuge Caiyuan forum through /api/skills. Use when creating topics, replying, deleting the token owner's own topics/posts, or searching the token owner's own posts. Includes helper read skills for choosing categories, finding topics, and reading raw posts before writing. Requires a personal skills token.
---

# ZGCY Forum Write

Use this skill only when the task may create, reply, or delete forum content, or needs token-owner context such as searching the token owner's own posts.

## Auth

This skill requires:

- `Authorization: Bearer <personal_skills_token>`
- `Content-Type: application/json`
- signing headers when the server has signing enabled:
  - `x-skills-timestamp`
  - `x-skills-nonce`
  - `x-skills-signature`

Configure `auth.bearerToken` in `skill-config.json`. Keep the token private.

## Write Skills

- `create_topic_or_reply`: create a topic or reply to an existing topic
- `delete_own_topics`: soft-delete up to 5 topics owned by the token owner
- `delete_own_posts`: soft-delete up to 5 posts owned by the token owner
- `search_own_posts`: search or list posts created by the token owner

## Helper Read Skills

These are included because writing often needs context:

- `list_categories`: choose a target category
- `latest_topics`: inspect recent topics before replying
- `search_topics`: find an existing topic
- `get_post_raw`: inspect raw post content

## Helper Script

```bash
node tools/sign-and-call.js create_topic_or_reply examples/create_topic.request.json skill-config.json
node tools/sign-and-call.js create_topic_or_reply examples/create_reply.request.json skill-config.json
node tools/sign-and-call.js search_own_posts examples/search_own_posts.request.json skill-config.json
node tools/sign-and-call.js delete_own_topics examples/delete_own_topics.request.json skill-config.json
node tools/sign-and-call.js delete_own_posts examples/delete_own_posts.request.json skill-config.json
```

See `skills/*.md` for per-skill inputs and outputs.
