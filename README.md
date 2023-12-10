# MiSans

MiSans (subsetted) fonts from Xiaomi for free (web) use.

小米发布的 MiSans 字体，可以免费使用，同步 Google Fonts 进行子集化以供 web 使用。

![Fonts Preview](https://raw.githubusercontent.com/dsrkafuu/misans/main/preview.png)

Version: `4.003`

[有关本字体的博客文章](https://blog.dsrkafuu.net/post/2022/google-fonts-subsetting/)

## CDN

- https://unpkg.com/misans/
- https://www.jsdelivr.com/package/npm/misans

## Usage

- Normal version is subsetted with TTF fonts & Noto Sans SC code ranges
- TC version is subsetted with TTF fonts & Noto Sans TC code ranges
- Other versions are not subsetted, WOFF2 source

- 普通版本使用 TTF 字体 & Noto Sans SC 进行子集化
- TC 版本使用 TTF 字体 & Noto Sans TC 进行子集化
- 其他版本未进行子集化，使用 WOFF2 来源字体

The following examples include only the Normal and Latin versions. For other versions, please refer to the examples and make them yourself.

以下的例子只包含了普通版本和 Latin 版本，其他版本请参照示例自行引入。

### Normal

```html
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@4.0.0/lib/Normal/MiSans-Medium.min.css"
/>
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@4.0.0/lib/Normal/MiSans-Bold.min.css"
/>
```

### Latin

```html
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@4.0.0/lib/Latin/MiSansLatin-Medium.min.css"
/>
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@4.0.0/lib/Latin/MiSansLatin-Bold.min.css"
/>
```

### TC

```html
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@4.0.0/lib/Latin/MiSansTC-Medium.min.css"
/>
<link
  rel="stylesheet"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/npm/misans@4.0.0/lib/Latin/MiSansTC-Bold.min.css"
/>
```

###

## Subset Details

Checkout `config.json` for settings.

使用 `config.json` 修改设置。

Environment requirements:

环境需求：

- Node.js >= 18
- Python >= 3.7

```bash
git clone https://github.com/dsrkafuu/misans.git
cd misans
pip install -r requirements.txt
npm install
npm run fetch
npm run subset
```

Subsetting process:

1. Get Noto Sans SC fonts CSS from Google Fonts
2. Parse unicode ranges from the CSS file
3. Get all supported unicodes from MiSans font files
4. Filter out the unsupported unicodes
5. Use the final unicodes to generate subsetted font files
6. Use the final unicodes to generate subsetted font CSS

子集化流程：

1. 从 Google Fonts 拉取 Noto Sans SC 字体 CSS
2. 解析 CSS 文件中的 unicode 范围
3. 从 MiSans 字体文件中获取所有支持的 unicode
4. 排除不支持的 unicode
5. 使用最终的 unicode 生成子集化的字体
6. 使用最终的 unicode 生成子集化的 CSS

## Fonts Source

- https://hyperos.mi.com/font/download

## Reference

- fonttools: https://github.com/fonttools/fonttools
- MIUI: https://home.miui.com/
- Xiaomi: https://www.mi.com/

## Copyright (Fonts)

Copyright (c), Beijing Xiaomi Mobile Software Co., Ltd.

> 本《MiSans 字体知识产权许可协议》（以下简称“协议”）是您与小米科技有限责任公司（以下简称“小米”或“许可方”）之间有关安装、使> 用 MiSans 字体（以下简称“MiSans”或“MiSans 字体”）的法律协议。您在使用 MiSans 的所有或任何部分前，应接受本协议中规定的> 所有条款和条件。安装、使用 MiSans 的行为表示您同意接受本协议所有条款的约束。否则，请不要安装或使用 MiSans，并应立即销毁和> 删除所有 MiSans 字体包。
>
> 根据本协议的条款和条件，许可方在此授予您一份不可转让的、非独占的、免版税的、可撤销的、全球性的版权许可，使您依照本协议约定使> 用 MiSans 字体，前提是符合下列条件：
>
> - 您应在软件中特别注明使用了 MiSans 字体。
> - 您不得对 MiSans 字体或其任何单独组件进行改编或二次开发。
> - 您不得单独将 MiSans 字体或其组件对外租赁、再许可、给予、出借或进一步分发字体软件或其任何副本以及重新分发或售卖。此限制不适用于您使用 MiSans 字体创作的任何其他作品。如您使用 MiSans 字体创作宣传素材、logo、应用 App 等，您有权分发或出售该作品。

## License (Scripts)

Released under `Apache License 2.0`, for more information read the [LICENSE](https://github.com/dsrkafuu/misans/blob/main/LICENSE).

Copyright (c) 2021-present DSRKafuU (<https://dsrkafuu.net>)
