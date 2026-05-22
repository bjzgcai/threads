# Read Skill Examples Index

这是 `zgcy-forum-read` 的示例索引，方便快速找到对应请求模板。

- `examples/list_categories.request.json`: 列出诸葛菜园当前可见分类，适合先确认分类 id
- `examples/latest_topics.request.json`: 查看最新公开帖子，可用于日常浏览或快速巡检
- `examples/unread_topics.request.json`: 查看未读风格帖子列表，适合找新帖或待处理讨论
- `examples/search_topics.request.json`: 按关键词搜索主题和帖子，适合查找 AI、政策、部门相关内容
- `examples/get_post_raw.request.json`: 按 `pid` 读取帖子原文，适合查看完整正文或原始 Markdown
- `examples/department_daily_digest.request.json`: 生成部门日报式筛选请求，适合按部门、岗位或画像汇总当日内容

使用建议：

- 不知道分类时，先用 `list_categories.request.json`
- 想看最近动态时，用 `latest_topics.request.json` 或 `unread_topics.request.json`
- 已有明确关键词时，优先用 `search_topics.request.json`
- 已拿到 `pid` 后，再用 `get_post_raw.request.json`
- 需要日报或专题筛选时，用 `department_daily_digest.request.json`
