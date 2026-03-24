# 贡献指南

感谢你愿意参与贡献。参与即表示你同意遵守本仓库的 [**CODE_OF_CONDUCT.md**](CODE_OF_CONDUCT.md)。

## 开发流程

1. **Fork** 本仓库，从 `main` 创建分支（建议命名：`feature/…`、`fix/…`）。  
2. 本地安装依赖后，确保 **proxy / dashboard** 的 `type-check` 与 `lint` 通过，**router** 的 `ruff` 与 `mypy --strict` 通过（见 `README.md`「开发与健康检查」）。  
3. 提交信息请使用**中文**说明变更意图（与项目约定一致）。  
4. 发起 **Pull Request** 至 `main`；若有关联 Issue，请在描述中引用（`Fixes #123` 等）。  

## 代码与合规

- **TypeScript**：严格模式；**Python**：类型注解与 `mypy --strict` 一致。  
- **禁止**在提交中包含真实 API Key、密钥、生产数据库连接串、可识别的个人数据或内网地址。  
- **依赖**：新增依赖时请确认其许可证与 **MIT** 本仓库的兼容性；若引入 copyleft 或许可限制较强的依赖，请先在 Issue 中说明。  
- **跨服务变更**：请查阅 `contracts/` 下契约，避免破坏 HTTP API 约定。  

## 知识产权

- 你提交的代码默认在 **与仓库相同的许可证**（见 [LICENSE](LICENSE)）下授权；若包含第三方代码，请说明来源与许可证。  
- 若你不同意将贡献以 MIT 授权，请勿提交 PR。  

## 行为准则

社区互动（Issue、PR、Review）请遵守 [**CODE_OF_CONDUCT.md**](CODE_OF_CONDUCT.md)。若发生骚扰或不当行为，请按 [SECURITY.md](SECURITY.md) 中的指引联系维护者（非漏洞类也可通过 Issue 中公布的社区联系渠道）。
