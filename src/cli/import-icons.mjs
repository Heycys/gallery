// Imports the 图标 tab's icons (src/shared/emoji/data/icons.json): two open-source sets of filled
// icons, MingCute Core Filled (Apache-2.0) and Tabler Filled (MIT), as the 443 pairs of icons both
// have for one thing (a reviewed one-to-one list of synonyms), and Tabler's 40 numbers (0–9 in a
// circle, a square, a rounded square and a hexagon), which MingCute has no series of: they stay
// Tabler's whichever set the tab shows. Each icon has a Chinese name and one of 12 categories (the
// tab shows them under these), and search words (English, and Chinese for the numbers). The SVGs
// are kept as they are drawn, their color written #COLOR (src/shared/emoji/glyphs.mjs and
// src/render/emoji.mjs draw them in an icon color).
//
//   node src/cli/import-icons.mjs <icon-subsets-categories.json> <mingcute-subset-categorized> <tabler-subset-categorized>
//
// The list (icon-subsets-categories.json: its "categories", each { id, name }; its "pairs", each
// { category_id, label, mingcute, tabler, keywords, files }; its "tabler_extras", the numbers, each
// the same with mingcute null) and the two sets' subsets as unzipped (mingcute-subset-categorized.zip,
// tabler-subset-categorized.zip: 图标/<category>/…svg, where each icon's "files" says, and LICENSE)
// are the user's, made with another tool. The licenses go next to the data (LICENSE-mingcute.txt,
// LICENSE-tabler.txt).
//
// icons.json: { sets, categories: [Chinese name], icons: [[Chinese name, MingCute name or null,
// Tabler name, MingCute SVG or null, Tabler SVG, category (its index in categories), search words]] },
// in the order the tab shows them: by category, the pairs in the list's order, then the numbers.

import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../shared/paths.mjs";

// The Chinese names Gallery gave the pairs before the list had names of its own (by MingCute
// name): a pair whose name changed keeps its earlier one among its search words, so it is still
// found by it (抖音, 推特, 电池一格).
const EARLIER_NAMES = {
  "wheelchair": "无障碍", "ad-rectangle": "广告", "ad-circle": "圆形广告", "settings-2": "调节", "settings-6": "横向调节", "aerial-lift": "缆车",
  "air-balloon": "热气球", "alarm-1": "闹钟", "alert": "警告", "apple-fruit": "苹果", "classify": "应用", "archive": "归档",
  "large-arrow-down": "向下箭头", "large-arrow-left": "向左箭头", "large-arrow-right": "向右箭头", "large-arrow-up": "向上箭头", "artboard": "画板", "news": "文章",
  "aspect-ratio": "宽高比", "science": "原子", "award": "奖章", "baby-carriage": "婴儿车", "delete-back": "退格", "balloon-2": "气球",
  "pen": "圆珠笔", "barbell": "杠铃", "basket": "篮子", "bath": "浴缸", "battery": "电池", "battery-automotive": "汽车电瓶",
  "battery-1": "电池一格", "battery-2": "电池两格", "battery-3": "电池三格", "battery-4": "电池满格", "bed": "床铺", "bed-2": "平躺的床",
  "notification": "通知", "bell-ringing": "响铃", "notification-off": "关闭通知", "bike": "自行车", "flash": "闪电", "bomb": "炸弹",
  "bone": "骨头", "book-6": "书籍", "bookmark": "书签", "bookmarks": "多个书签", "boom": "爆炸", "bottle": "瓶子",
  "toxophily": "弓箭", "bowl": "碗", "dinner": "碗筷", "copy-3": "多份副本", "apple": "苹果标志", "discord": "Discord",
  "dribbble": "Dribbble", "facebook": "Facebook", "github": "GitHub", "google": "谷歌", "instagram": "Instagram", "linkedin": "领英",
  "messenger": "Messenger", "paypal": "PayPal", "pinterest": "Pinterest", "snapchat": "Snapchat", "spotify": "Spotify", "steam": "Steam",
  "stripe": "Stripe", "tiktok": "TikTok 抖音", "twitter": "推特", "weibo": "微博", "whatsapp": "WhatsApp", "windows": "Windows",
  "social-x": "X", "youtube": "YouTube", "bread": "面包", "briefcase": "公文包", "briefcase-2": "手提箱", "brightness": "亮度",
  "bubble": "气泡", "comment": "评论", "bug": "虫子", "bridge-2": "桥", "base-station": "信号塔", "bulb": "灵感",
  "bus": "公交车", "butterfly": "蝴蝶", "cactus": "仙人掌", "counter": "计算器", "calendar-3": "日历", "calendar-month": "月历",
  "calendar-week": "周历", "camera": "相机", "campfire": "篝火", "candle": "蜡烛", "car": "汽车", "four-wheel-drive": "越野车",
  "cardboard-vr": "VR 眼镜", "down-small": "下三角", "left-small": "左三角", "right-small": "右三角", "up-small": "上三角", "cash": "钞票",
  "classify-2": "分类", "charging-pile": "充电桩", "stock": "股票 K 线", "chart-pie": "饼图", "chart-pie-2": "饼图二", "chart-pie-3": "饼图三",
  "check": "对勾", "chef-hat": "厨师帽", "chess": "国际象棋", "round": "圆形", "arrow-down-circle": "圆形下箭头", "arrow-left-down-circle": "圆形左下箭头",
  "arrow-right-down-circle": "圆形右下箭头", "arrow-left-circle": "圆形左箭头", "arrow-right-circle": "圆形右箭头", "arrow-up-circle": "圆形上箭头", "arrow-left-up-circle": "圆形左上箭头", "arrow-right-up-circle": "圆形右上箭头",
  "down": "向下", "left": "向左", "right": "向右", "up": "向上", "check-circle": "完成", "arrows-down": "双箭头向下",
  "arrows-left": "双箭头向左", "arrows-right": "双箭头向右", "arrows-up": "双箭头向上", "radiobox": "单选框", "key-2": "圆形钥匙", "percentage": "百分比",
  "add-circle": "圆形加号", "close-circle": "圆形关闭", "three-circles": "三个圆", "finger-tap": "点击", "clipboard": "剪贴板", "task": "任务完成",
  "task-2": "任务清单", "time": "时钟", "cloud": "云朵", "leaf-3": "四叶草", "clubs": "梅花", "brackets-angle": "尖括号",
  "code": "代码", "coin": "硬币", "currency-bitcoin": "比特币", "currency-euro": "欧元", "monero": "门罗币", "currency-pound": "英镑",
  "currency-rupee": "卢比", "currency-cny": "人民币", "columns-2": "两栏", "columns-3": "三栏", "compass": "指南针", "celebrate": "庆祝",
  "cookie": "饼干", "cookie-man": "姜饼人", "copy": "复制", "copyright": "版权", "bank-card": "银行卡", "cross-2": "十字架",
  "vip-2": "皇冠", "aiming": "瞄准", "dashboard": "仪表盘", "camcorder-2": "监控摄像头", "monitor": "显示器", "save-2": "保存",
  "game-1": "游戏手柄", "game-2": "游戏", "computer": "电脑", "pad": "平板", "cellphone": "手机", "remote-control": "遥控器",
  "speaker": "音箱", "tv-1": "电视", "tv-2": "老式电视", "usb-flash-disk": "U 盘", "vison-pro": "头显", "watch": "手表",
  "diamond": "钻石", "diamond-square": "方块", "direction-arrow": "四向箭头", "directions-2": "方向牌", "directions": "路标", "disc": "光盘",
  "sale": "折扣", "more-1": "更多", "more-2": "竖向更多", "download": "下载", "drop": "水滴", "wet": "潮湿",
  "ease-in-control-point": "缓入", "ease-in-out-control-point": "缓入缓出", "ease-out-control-point": "缓出", "edit": "编辑", "egg": "鸡蛋", "egg-crack": "裂开的蛋",
  "fried-egg": "煎蛋", "engine": "引擎", "escalator-down": "下行扶梯", "escalator-up": "上行扶梯", "transfer": "交换", "warning": "警示",
  "exposure": "曝光", "external-link": "外部链接", "eye": "眼睛", "eyeglass": "眼镜", "face-mask": "口罩", "quill-pen": "羽毛笔",
  "file": "页面", "file-check": "文件已核对", "file-code": "代码文件", "docment": "文件描述", "file-more": "文件更多", "file-download": "下载文件",
  "file-info": "文件信息", "file-music": "音乐文件", "document-3": "编辑文档", "file-star": "收藏文件", "document-2": "文档", "file-unknown": "未知文件",
  "file-upload": "上传文件", "documents": "多个文件", "filter": "筛选", "flag-1": "旗帜", "flag-2": "旗帜二", "flag-4": "旗帜三",
  "flame": "火焰", "flask": "烧瓶", "flask-3": "圆底烧瓶", "flower-2": "花朵", "folder": "文件夹", "folder-open": "打开文件夹",
  "folders": "多个文件夹", "forbid-circle": "禁止", "gas-station": "加油站", "dashboard-3": "仪表", "ghost": "幽灵", "gift": "礼物",
  "gift-card": "礼品卡", "wineglass": "酒杯", "wineglass-2": "满杯", "globe": "地球仪", "chart-line": "折线图", "dot-grid": "网格图案",
  "coathanger": "衣架", "headphone": "耳机", "headphone-2": "头戴耳麦", "heart": "爱心", "heart-crack": "心碎", "question-2": "帮助",
  "question": "问号", "hexagon": "六边形", "minus-circle": "减号", "add": "添加", "home-1": "首页", "home-2": "房子",
  "hospital": "医院", "sandglass": "沙漏", "idcard": "身份证", "information": "信息", "key-1": "钥匙", "keyboard": "键盘",
  "laurel-wreath": "桂冠", "layout": "布局", "layout-10": "四宫格布局", "align-arrow-down": "底部对齐", "align-center": "水平居中", "align-arrow-left": "左对齐",
  "align-vertical-center": "垂直居中", "align-arrow-right": "右对齐", "align-arrow-up": "顶部对齐", "layout-bottom": "底栏布局", "layout-bottom-close": "收起底栏", "layout-bottom-open": "展开底栏",
  "distribute-spacing-vertical": "水平分布", "distribute-spacing-horizontal": "垂直分布", "layout-grid": "网格布局", "trello-board": "看板", "layout-5": "列表布局", "layout-top": "顶栏布局",
  "layout-top-close": "收起顶栏", "layout-top-open": "展开顶栏", "layout-left": "侧栏布局", "layout-leftbar-close": "收起左栏", "layout-leftbar-open": "展开左栏", "layout-right": "右栏布局",
  "layout-rightbar-close": "收起右栏", "layout-rightbar-open": "展开右栏", "leaf": "叶子", "lifebuoy": "救生圈", "link": "链接", "list-check": "清单",
  "scrollable-list": "详细列表", "live-photo": "实况照片", "lock": "锁", "lungs": "肺", "flower": "微距", "magnet": "磁铁",
  "mail": "邮件", "mail-open": "已读邮件", "map-pin": "定位", "cross": "医疗十字", "menu": "菜单", "message-2": "消息",
  "chat-2": "聊天", "chat-1": "对话", "comment-2": "多条消息", "mickeymouse": "米老鼠", "mic": "麦克风", "microscope": "显微镜",
  "angry": "生气", "confused": "困惑", "laugh": "大笑", "meh": "平淡", "happy": "开心", "baby": "宝宝",
  "sad": "难过", "emoji": "微笑", "moon": "月亮", "mountain-2": "山峰", "mouse": "鼠标", "mushroom": "蘑菇",
  "navigation": "导航", "nurse": "护士", "octagon": "八边形", "minus-circle-dash": "移除", "add-circle-dash": "新增", "paint-2": "涂刷",
  "palette-2": "调色板", "panoramas": "全景", "parking": "停车场", "paw": "爪印", "pencil": "铅笔", "flag-3": "三角旗",
  "pentagon": "五边形", "phone": "电话", "phone-call": "来电", "phone-success": "通话成功", "phone-off": "挂断", "pic-2": "图片",
  "miniplayer": "画中画", "pig": "小猪", "capsule": "胶囊", "pin-2": "大头针", "pin": "图钉", "pizza": "披萨",
  "airplane": "飞机", "flight-land": "降落", "flight-takeoff": "起飞", "flight-inflight": "飞行中", "pause": "暂停", "play": "播放",
  "stop": "停止", "skip-forward": "下一首", "skip-previous": "上一首", "playlist-2": "播放列表", "plus": "加号", "cursor": "指针",
  "presentation-2": "演示", "presentation-1": "数据演示", "quote-right": "引号", "bill": "账单", "rectangle": "矩形", "rectangle-vertical": "竖矩形",
  "registered": "注册商标", "certificate": "认证徽章", "balance": "天平", "mortarboard": "学位帽", "search": "搜索", "section": "章节符号",
  "send": "发送", "settings-1": "设置", "shield-shape": "盾牌", "safety-certificate": "安全认证", "safe-shield-2": "半盾", "safe-lock": "安全锁",
  "t-shirt": "衣服", "shopping-cart-1": "购物车", "sitemap": "结构图", "sort-ascending": "升序", "sort-descending": "降序", "soup-pot": "汤锅",
  "spade": "黑桃", "sparkles": "闪光", "sparkles-2": "闪光二", "square-arrow-down": "方形下箭头", "square-arrow-left": "方形左箭头", "square-arrow-right": "方形右箭头",
  "square-arrow-up": "方形上箭头", "asterisk": "星号", "checkbox": "复选框", "minus-square": "方形减号", "square": "圆角方形", "arrow-down": "下箭头",
  "arrow-left": "左箭头", "arrow-right": "右箭头", "arrow-up": "上箭头", "check-2": "已勾选", "add-square": "方形加号", "close-square": "方形关闭",
  "close-circle-dash": "叉号", "copy-2": "重叠方块", "layer": "图层", "layers": "多图层", "star-2": "星标", "star-half": "半星",
  "steering-wheel": "方向盘", "sun-2": "太阳", "sunrise": "日出", "sunset": "日落", "report-forms": "数据表", "tag": "标签",
  "tag-2": "多个标签", "layout-3": "模板", "test-tube": "试管", "thumb-down": "点踩", "thumb-up": "点赞", "ticket": "票券",
  "timeline": "时间线", "toggle-left-2": "开关关", "toggle-right-2": "开关开", "fork-knife": "刀叉", "train": "火车", "transformation": "变换",
  "delete": "删除", "triangle": "三角形", "trophy": "奖杯", "truck": "卡车", "ufo": "飞碟", "umbrella-2": "雨伞",
  "user-2": "用户", "version": "版本", "video-camera": "摄像机", "dutch-windmill": "风车", "world": "世界", "pencil-2": "书写",
  "signature": "签名", "close": "关闭", "yinyang": "太极", "zoom-in": "放大", "zoom-out": "缩小",
};

// An SVG as one line, drawn in #COLOR: its own attributes but its 24-unit view dropped, Tabler's
// empty frame path (M0 0h24v24H0z) gone, every currentColor (a fill, a line's stroke) #COLOR.
function drawing(file) {
  const source = fs.readFileSync(file, "utf8");
  const inner = source.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "")
    .replace(/<path\s+stroke="none"\s+d="M0 0h24v24H0z"\s+fill="none"\s*\/>/g, "")
    .replace(/\s*\n\s*/g, " ").replace(/\s+\/>/g, "/>").replace(/>\s+</g, "><").trim();
  if (!/viewBox="0 0 24 24"/.test(source)) throw new Error(`${file}: not on a 24-unit view`);
  if (/<(?:defs|clipPath|mask|use|image|style|script)\b|\bid=|url\(/.test(inner)) throw new Error(`${file}: holds more than paths`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#COLOR">${inner.replaceAll("currentColor", "#COLOR")}</svg>`;
}

const [list, mingcute, tabler] = process.argv.slice(2);
if (!list || !mingcute || !tabler) {
  console.error("Usage: node src/cli/import-icons.mjs <icon-subsets-categories.json> <mingcute-subset-categorized> <tabler-subset-categorized>");
  process.exit(1);
}
const folders = { mingcute, tabler };
const { categories, pairs, tabler_extras: extras } = JSON.parse(fs.readFileSync(list, "utf8"));
const order = [...categories].sort((a, b) => a.id.localeCompare(b.id));
const categoryAt = new Map(order.map((category, index) => [category.id, index]));
const icons = [...pairs, ...extras].map((icon, at) => {
  const category = categoryAt.get(icon.category_id);
  if (category === undefined) throw new Error(`${icon.label}: no category ${icon.category_id}`);
  if (!icon.label || !icon.tabler || (at < pairs.length) !== Boolean(icon.mingcute)) throw new Error(`${icon.label ?? at}: a pair has both sets' names, a number Tabler's alone`);
  const svg = (set) => icon[set] ? drawing(path.join(folders[set], icon.files?.[set] ?? `${icon[set]}.svg`)) : null;
  // Its search words: the list's (lower case, once), its earlier name, none that is already its name or a set's.
  const earlier = EARLIER_NAMES[icon.mingcute];
  const own = new Set([icon.label, icon.mingcute, icon.tabler].filter(Boolean).map((word) => word.toLowerCase()));
  const words = [...new Set([...(icon.keywords ?? []), ...(earlier ? [earlier] : [])].map((word) => String(word).toLowerCase().trim()))].filter((word) => word && !own.has(word));
  return { category, at, row: [icon.label, icon.mingcute ?? null, icon.tabler, svg("mingcute"), svg("tabler"), category, words] };
}).sort((a, b) => a.category - b.category || a.at - b.at).map((icon) => icon.row);
for (const at of [0, 1, 2]) {
  const names = icons.map((icon) => icon[at]).filter(Boolean);
  const twice = names.filter((name, index) => names.indexOf(name) !== index);
  if (twice.length > 0) throw new Error(`named twice: ${twice.join(", ")}`);
}
const data = path.join(projectRoot, "src", "shared", "emoji", "data");
fs.writeFileSync(path.join(data, "icons.json"), `${JSON.stringify({
  sets: { mingcute: { name: "MingCute", version: "3.0.2", license: "Apache-2.0" }, tabler: { name: "Tabler", version: "3.49.0", license: "MIT" } },
  categories: order.map((category) => category.name),
  icons,
})}\n`);
fs.copyFileSync(path.join(mingcute, "LICENSE"), path.join(data, "LICENSE-mingcute.txt"));
fs.copyFileSync(path.join(tabler, "LICENSE"), path.join(data, "LICENSE-tabler.txt"));
console.log(`${pairs.length} pairs and ${extras.length} icons of Tabler's alone, in ${order.length} categories, written to src/shared/emoji/data/icons.json`);
