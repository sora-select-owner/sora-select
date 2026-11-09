# SORA SELECT — ZIP 商品导入增强版

此版本基于用户提供的 GitHub 仓库 `sora-select-main (1).zip` 原样扩展，保留 `index.html`、`account.html`、原有 `admin.html` 的商品、订单、登录和旧版 JSON 导入功能。

## 新功能

管理后台 `admin.html` 增加「拼多多 ZIP 一键导入 · 商品审核」。

1. 在拼多多采集器中导出 ZIP（`product.json` + `images/`）；ZIP 内照片是真实文件，无须复制单张链接。
2. 登录管理后台，选择 ZIP，点击「读取 ZIP / JSON 并预览」。支持 SORA 3.3.x、inline-safe 和旧版 JSON。
3. 在预览中编辑商品名、查看人民币价格线索、勾选照片、选择主图、为每种规格填写日元售价和照片。
4. 勾选图片使用权确认，点击「填入下方商品表单」。这一步仅填表，不会上传图片或保存数据库。
5. 在原有商品表单核对后，点击「商品を保存」。通过现有 Supabase `product-images` 存储和 `products` 表保存，默认 **非公开** 且 **停售**。只有管理员明确勾选公开并再次保存才可能上架。

价格不会自动宣称为真实成交价。缺失售价以 ¥0 非公开草稿保存，需要手动核实后修改。ZIP 中误采集的其他商品照片由管理员在审核中取消选择。

## 部署

将本文件夹的全部文件上传到原 GitHub Pages 仓库，**包括新增的 `sora-zip-core.js` 和 `sora-zip-import.js`**。不要只替换 `admin.html`。本包未包含任何 Supabase service_role 密钥，原 publishable key 保留不变。部署前请备份原仓库；未经用户确认不要公开部署。

## 兼容性与限制

- Chrome/Edge 新版：支持 ZIP STORE（采集器常用）和 DEFLATE（通过浏览器 DecompressionStream）。
- 预览不联网；只在最终点击原有保存按钮时将所选图片上传 Supabase。
- ZIP 限制 160MB、最多 180 项、解压总计 130MB；单张图片上传限制 5MB，JPEG/PNG/WebP。过大的图片会被跳过并给出提示。
- 只有 ZIP 内真实图片可直接上传；纯 JSON 的远程图片仅供预览，不会自动绕过跨域限制。
- 采集器对商品名、规格和图片归属可能识别错误，必须人工核对；不自动把未知规格价格与图片强行配对。
- 真实 Supabase 写入仍受原项目权限策略、网络和存储配额影响，无法在离线环境中保证成功。
