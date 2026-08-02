# 使用受控目录引用

## 状态

Accepted

## 背景

允许 Renderer 提交任意绝对路径会把文件系统权限扩大到不可信边界，也会让业务记录依赖某台机器的目录结构。

## 决定

用户目录由 Main 选择和注册。Main 保存真实根路径并返回 opaque `directoryId`；Renderer 和公共模型只使用 `directoryId + relativePath`。Main 在每次文件操作前重新解析并验证路径仍位于授权根目录。

## 后果

绝对路径不进入公共 binding 或 Renderer 文件访问请求。目录被移动、删除或忘记后必须显式报告不可用；注册表和路径解析成为受信任平台适配职责。
