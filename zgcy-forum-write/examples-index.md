# Write Skill Examples Index

这是 `zgcy-forum-write` 的示例索引，方便快速找到对应请求模板。

- `examples/create_topic.request.json`: 在指定分类中创建新主题
- `examples/create_reply.request.json`: 向已有主题发送回复
- `examples/delete_own_topics.request.json`: 删除当前 token 持有者自己创建的主题
- `examples/delete_own_posts.request.json`: 删除当前 token 持有者自己的帖子
- `examples/search_own_posts.request.json`: 搜索当前 token 持有者自己的帖子，适合删帖前定位 `pid`
- `examples/list_categories.request.json`: 发帖前查看可见分类，确认分类 id
- `examples/latest_topics.request.json`: 回帖前查看最新帖子，避免回错主题或重复发帖
- `examples/search_topics.request.json`: 按关键词搜索已有讨论，适合回帖前查重或找上下文
- `examples/get_post_raw.request.json`: 按 `pid` 读取帖子原文，适合回复前核对原始内容

使用建议：

- 发新帖前，先看 `list_categories.request.json`
- 回复已有主题前，先看 `latest_topics.request.json` 或 `search_topics.request.json`
- 不确定帖子原文时，再用 `get_post_raw.request.json`
- 删除前，先用 `search_own_posts.request.json` 找到准确 `pid`
- `delete_own_topics.request.json` 和 `delete_own_posts.request.json` 属于高风险示例，实际调用前应再次确认
