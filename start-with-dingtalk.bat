@echo off
REM NodeBB 钉钉登录启动脚本
REM 使用前请先编辑此文件，填入你的钉钉应用凭证

echo ========================================
echo NodeBB 钉钉登录启动脚本
echo ========================================
echo.

REM 设置钉钉应用凭证
REM 请将下面的值替换为你从钉钉开放平台获取的实际值
set DINGTALK_CLIENT_ID=dingucihpgomszeyk99t
set DINGTALK_CLIENT_SECRET=iZAA0E-qVjJgGGYWovR7nbNVfeM9HMHSJqTKTNlj_1XhdHFZXxSlmjd8xNSCx270

REM 检查是否已配置
if "%DINGTALK_CLIENT_ID%"=="你的钉钉ClientID" (
    echo [警告] 未配置钉钉应用凭证
    echo        登录页面将显示钉钉登录选项，但点击后会提示错误
    echo        请编辑 start-with-dingtalk.bat 文件填入你的钉钉应用凭证
    echo.
    echo 获取方式：
    echo 1. 访问 https://open.dingtalk.com/
    echo 2. 创建或选择一个应用
    echo 3. 获取 Client ID 和 Client Secret
    echo 4. 配置回调地址：http://localhost:4567/auth/dingtalk/callback
    echo.
)

echo [信息] 钉钉配置已加载
echo Client ID: %DINGTALK_CLIENT_ID%
echo.

echo [信息] 启动 NodeBB...
node app.js

pause
