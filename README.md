# MiSans

MiSans (subsetted) fonts from Xiaomi for free (web) use.

小米发布的 MiSans 字体，可以免费使用，同步 Google Fonts 进行子集化以供 web 使用。

![Fonts Preview](https://raw.githubusercontent.com/dsrkafuu/misans/main/preview.png)

Version: `2.000`

## CDN

- https://unpkg.com/misans/
- https://www.jsdelivr.com/package/npm/misans

## Subset Details

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

- https://web.vip.miui.com/page/info/mio/mio/detail?postId=33935854
- https://cdn.cnbj1.fds.api.mi-img.com/vipmlmodel/font/MiSans/MiSans.zip

## Reference

- fonttools: https://github.com/fonttools/fonttools
- MIUI: https://home.miui.com/
- Xiaomi: https://www.mi.com/

## Copyright (Fonts)

Copyright (c) 2021, Beijing Xiaomi Mobile Software Co., Ltd.

## License (Scripts)

Released under `Apache License 2.0`, for more information read the [LICENSE](https://github.com/dsrkafuu/misans/blob/main/LICENSE).

Copyright (c) 2021-present DSRKafuU (<https://dsrkafuu.net>)
