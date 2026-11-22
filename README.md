# DSH ChatGPT Sign-In

在 **macOS 版 DeepSeek Harness（DSH）** 中登录 ChatGPT，把账号允许使用的订阅模型加入 DSH 的模型选择器。DSH 继续管理会话和本地工具调用，模型请求使用 ChatGPT 套餐中的 Codex / ChatGPT Work 用量。

## 安装和登录

适用于 macOS，已在 DeepSeek Harness 桌面版 **0.2.2-rc.5** 上验证。账号和工作区需要允许第三方应用使用 ChatGPT 套餐。有关授权和用量管理，请参阅 [OpenAI 官方说明](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)。

1. 从 [GitHub Releases](https://github.com/1606835963aa/dsh-chatgpt-sign-in/releases/latest) 下载 `local-dsh-chatgpt-sign-in-*.tgz`。
2. 打开 DSH 的「插件 → 添加插件」，选择下载的压缩包，启用插件并重启 DSH。
3. 打开「设置 → 模型 → ChatGPT 订阅」，点击「使用 ChatGPT 登录」。在浏览器的 OpenAI 页面选择账号，并允许使用套餐额度。
4. 返回 DSH，从模型选择器的「ChatGPT 订阅」分组选择模型。可选项取决于账号和 DSH 适配器共同支持的模型。

在「设置 → 模型 → ChatGPT 订阅」可以刷新模型列表或断开连接。也可以在 ChatGPT 的「设置 → 安全与登录」撤销授权。

## 代理与上下文

需要时，可在桌面版配置文件 `~/.dsh/profiles/desktop/cordis.patch.yml` 里给 `chatgpt-sign-in` 增加如下配置。已有同名段时，把字段加到现有的 `config` 下。

```yaml
- id: chatgpt-sign-in
  name: "@local/dsh-chatgpt-sign-in"
  config:
    stateDir: !!js (process.env.DSH_HOME ?? process.env.HOME + '/.dsh') + '/chatgpt-sign-in'
    proxyUrl: "http://127.0.0.1:8080"
    modelContextWindows:
      gpt-6.2-sol: 500000
```

- `proxyUrl` 使用你自己的 HTTP 或 HTTPS 代理地址。它只处理该插件发往 OpenAI 的后台请求。浏览器里的授权页使用浏览器自己的网络设置。
- `modelContextWindows` 按模型 ID 设置 DSH 的上下文窗口，单位是 token。例子把 GPT‑6.2 Sol 设为 500K。配置值受模型支持的上限约束。

## 从源码构建

使用 Node.js 24 在仓库目录运行以下命令。生成的 `.tgz` 可通过 DSH 的「添加插件」安装。

```sh
npm run build
npm pack
```

## 凭据与许可证

插件使用 OpenAI 的 Sign in with ChatGPT 流程。凭据加密后保存在 DSH 数据目录下的 `chatgpt-sign-in` 文件夹，密钥保存在 macOS 钥匙串。DSH 界面接收登录状态和模型数量。

仓库源码以 **Sign-in with ChatGPT DevKit Noncommercial License v1.0** 发布，允许非商业使用和分发。详见 [LICENSE](LICENSE)。`vendor/siwc` 包含改编自 [OpenAI Sign in with ChatGPT DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit/tree/0a36fefeb913055c8c7a1a29b63d82b96b2e841a) 的代码和[第三方声明](vendor/siwc/THIRD_PARTY_NOTICES.md)。这是独立的 DSH 插件。
