// The emojis a document reaches for most, in the order Gallery puts them. First the marks a document is written
// with (done, not done, warning, question, an idea, a pin, the status dots, the arrows), then what a document is
// about (notes, dates, charts, files, tools, messages, money, prizes), then the common faces, hands and hearts,
// and after them weather and plants, food and drink, animals, places and pastimes; the seasonal ones (a Christmas
// tree, a red envelope) come last. Four hundred in all. The order is a choice made for documents: change it
// where it reads wrong.
//
// What it is for: the emoji data (data/README.md) says what each emoji is called, never which one people mean, so
// for "love" or 爱 it finds a love letter, a love hotel or a face as readily as the red heart. The 表情符号 tab's
// search (editor/page/emoji-picker/emoji-search.mjs) uses this list only between the emojis its other rules rank
// alike (one on it before one that is not, then its order); it never lifts an emoji past a better match, and the
// tab without a filter keeps the Unicode order.
// Each is written as the data writes it (fully qualified); tests/unit/icons.mjs holds each to being offered, once.

export const EVERYDAY_EMOJIS = `
✅ ❌ ⚠️ ❓ ❗ 💡 📌 ⭐ 🔥 🎯 🚀 🎉 👍 👎 👀 ❤️ ✨ 💯 🔴 🟡 🟢 🔵 ⚫ ⚪
✔️ ☑️ ❎ ⛔ 🚫 ‼️ ➡️ ⬅️ ⬆️ ⬇️ 🔄 ➕ ➖ ✖️ 🆕 🆗 🆒 🔝 ♻️ 📍
🏠 📝 📅 📆 🗓️ 📊 📈 📉 📋 📎 📁 📂 📄 🗒️ 📚 📖 📓 📒 📕 📗 📘 📙 📰 ✏️ 🖊️
🔗 🔍 🔎 🔒 🔓 🔑 🔔 ⚙️ 🔧 🔨 🛠️ 💻 🖥️ ⌨️ 📱 ⏰ ⏳ ⌛ ⌚ ⏱️
🏆 🥇 🏅 🎓 🎁 🎊 🌟 📧 ✉️ 📩 📦 📢 📣 💬 💭 🧠 💰 💵 💸 💳 💼 🗑️
😀 😃 😄 😁 😊 🙂 😉 😂 🤣 😆 😅 ☺️ 😍 🥰 😘 😎 🤔 🥳 🤩 🤗
😋 😜 😛 😝 🤪 😇 🙃 😌 😏 🙄 😐 😑 😶 😬 🤭 🤫 🤐 😴 🥱 😳
😢 😭 😔 😞 😟 😕 🙁 ☹️ 🥺 🥹 🥲 😩 😫 😮 😱 😨 😰 😤 😠 😡
🤬 🤯 🥵 🥶 😷 🤒 🤢 🤮 🤓 🧐 😒 😈 💀 👻 👽 🤖 💩 🤡 🙈 🙉 🙊
👏 🙏 💪 👌 ✌️ 🙌 🤝 👋 🤞 👊 ✊ ☝️ 👆 👇 👉 👈 ✋ 🖐️ 🤟 🤙 🫶 ✍️ 💅 🫡
🤦 🤷 🙋 🙅 👶 🧑‍💻
💕 💖 💗 💓 💞 💘 💝 💜 💙 💚 💛 🧡 🖤 🤍 ♥️ 💔 ❣️ 💋 💌
☀️ 🌙 🌈 ☁️ ⛅ ❄️ 🌧️ ☔ 🌦️ ⛈️ 🌨️ ☃️ ⛄ ⚡ 🌊 💧 🌍 🌎 🌏 ⛰️ 🏔️
🌕 🌑 🌛 🌝 🌚 🌠 🌸 🌹 🌺 🌻 🌷 🌼 💐 🍀 🌱 🌿 🍁 🍂 🌲 🌳 🌴 🌵
☕ 🍵 🧋 🥤 🥛 🍹 🍺 🍻 🍷 🥂 🍾 🎂 🍰 🧁 🍫 🍩 🍪 🍦 🍿
🍕 🍔 🍟 🍜 🍣 🍚 🍞 🥐 🥚 🍳 🧀 🍎 🍏 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥑 🍅 🥕 🌶️
🐶 🐱 🐕 🐈 🐻 🐼 🐰 🦊 🐸 🐷 🐵 🦄 🐝 🦋 🐞 🐛 🐢 🐍
🐟 🐳 🐬 🐧 🐔 🐦 🦁 🐯 🐮 🐴 🐭
🏡 🏢 🏫 🏥 🚗 🚕 🚌 🚲 🚆 ✈️ ⚽ 🏀 🎾 🎨 🎵 🎶 🎧 🎤 🎸 🎹 🎬 🎮
📷 📸 📞 ☎️ 🎲 🧩 🎈 👑 💍 💎 🎒 💤 💢 💥 💫 💦 💨
🎄 🎃 🎅 🧧
`.trim().split(/\s+/);
