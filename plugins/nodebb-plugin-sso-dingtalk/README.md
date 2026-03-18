# NodeBB 钉钉 SSO 插件配置指南

## 概述

这个插件为 NodeBB 提供钉钉（DingTalk）单点登录（SSO）功能。用户可以通过钉钉账号直接登录论坛。

## 配置步骤

### 1. 在钉钉开放平台创建应用

1. 访问 [钉钉开放平台](https://open.dingtalk.com/)
2. 登录你的钉钉开发者账号
3. 创建一个新的应用（或使用现有应用）
4. 在应用配置中：
   - 记录下 **Client ID**（应用的 AppKey 或 ClientId）
   - 记录下 **Client Secret**（应用的 AppSecret 或 ClientSecret）
   - 配置 **回调地址（Redirect URI）**：`http://your-domain.com/auth/dingtalk/callback`
     - 例如：`http://localhost:4567/auth/dingtalk/callback`（开发环境）
     - 或：`https://forum.example.com/auth/dingtalk/callback`（生产环境）

### 2. 配置环境变量

插件需要两个环境变量来连接钉钉：

```bash
DINGTALK_CLIENT_ID=你的钉钉应用ClientID
DINGTALK_CLIENT_SECRET=你的钉钉应用ClientSecret
```

#### Windows 设置方式：

**方式一：临时设置（当前命令行窗口有效）**
```cmd
set DINGTALK_CLIENT_ID=你的ClientID
set DINGTALK_CLIENT_SECRET=你的ClientSecret
node app.js
```

**方式二：使用 .env 文件（推荐）**

1. 在项目根目录创建 `.env` 文件：
```
DINGTALK_CLIENT_ID=你的ClientID
DINGTALK_CLIENT_SECRET=你的ClientSecret
```

2. 安装 dotenv 包（如果还没安装）：
```cmd
npm install dotenv
```

3. 在 `app.js` 开头添加：
```javascript
require('dotenv').config();
```

**方式三：系统环境变量（永久设置）**
1. 右键"此电脑" → "属性" → "高级系统设置"
2. 点击"环境变量"
3. 在"系统变量"或"用户变量"中添加：
   - 变量名：`DINGTALK_CLIENT_ID`，值：你的 Client ID
   - 变量名：`DINGTALK_CLIENT_SECRET`，值：你的 Client Secret

### 3. 激活插件

1. 启动 NodeBB：
```cmd
node app.js
```

2. 访问管理后台：`http://localhost:4567/admin`

3. 进入 **扩展 → 插件（Extend → Plugins）**

4. 找到 `nodebb-plugin-sso-dingtalk` 并点击"激活"

5. 重启 NodeBB 使插件生效

### 4. 验证配置

1. 访问登录页面：`http://localhost:4567/login`
2. 应该能看到"Login with DingTalk"按钮
3. 点击按钮测试钉钉登录流程

## 工作原理

- 用户点击"Login with DingTalk"按钮
- 跳转到钉钉授权页面
- 用户授权后，钉钉回调到 `/auth/dingtalk/callback`
- 插件获取用户信息（unionId、昵称、头像等）
- 如果是新用户，自动创建 NodeBB 账号
- 如果是老用户，直接登录

## 用户数据映射

- **unionId/openId** → 用于关联钉钉账号和 NodeBB 账号
- **nick** → NodeBB 用户名
- **avatarUrl** → 用户头像
- **email** → 邮箱（如果钉钉提供）
- **mobile** → 手机号（如果钉钉提供）

## 故障排查

### 问题：看不到钉钉登录按钮

**解决方案：**
1. 检查环境变量是否正确设置
2. 查看 NodeBB 日志，确认是否有错误信息：
   ```
   [sso-dingtalk] Missing required env vars: DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET
   ```
3. 确认插件已在管理后台激活

### 问题：点击登录按钮后报错

**解决方案：**
1. 检查钉钉开放平台的回调地址配置是否正确
2. 确认 `config.json` 中的 `url` 配置正确
3. 查看浏览器控制台和 NodeBB 日志的错误信息

### 问题：授权后无法登录

**解决方案：**
1. 检查钉钉应用的权限配置，确保有获取用户信息的权限
2. 查看 NodeBB 日志中的详细错误信息
3. 确认数据库连接正常

## API 端点

- **登录发起**：`/auth/dingtalk`
- **回调地址**：`/auth/dingtalk/callback`

## 技术细节

- 使用 Passport.js 实现 OAuth 2.0 认证流程
- 钉钉 API 版本：v1.0
- 授权范围：`openid`
- 使用 `unionId` 作为用户唯一标识（跨应用一致）

## 相关链接

- [钉钉开放平台](https://open.dingtalk.com/)
- [钉钉 OAuth 2.0 文档](https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information)
- [NodeBB 文档](https://docs.nodebb.org/)
