# skill: delete_own_posts

中文说明：删除当前 token 持有者自己的帖子，适合在确认 `pid` 后执行。

## Purpose
Soft-delete posts created by the current token owner.

Use `search_own_posts` before deletion when the correct `pid` is not already known.

Deleted posts are hidden from other users. The original author can still use normal page controls to restore or permanently purge them.

## Endpoint
`POST /api/skills/delete_own_posts/execute`

## Input

```json
{
  "input": {
    "pids": [200, 201]
  }
}
```

输出说明：`mode` 表示当前删除方式，`deletedCount` 表示本次成功软删除的帖子数量。

参数说明：`pids` 是帖子 id 数组，只能填写当前 token 持有者本人创建的帖子。

## Limits

- `pids` is required and must be an array.
- A single request can include at most 5 post ids.
- Every post must belong to the token owner.
- Already-deleted posts are rejected.

Confirm with the user before calling this skill because it changes live forum content.

## Output (simplified)

```json
{
  "status": { "code": "ok" },
  "response": {
    "skill": "delete_own_posts",
    "response": {
      "mode": "soft_delete",
      "deletedCount": 2
    }
  }
}
```
