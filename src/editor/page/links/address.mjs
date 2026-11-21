// A web address written as text (pure), kept in one place so that one address becomes one link wherever
// it comes from: pasted, a bare address in a line of Markdown, or typed into the link card. A www.
// address is given http://: the scheme every site answers (a browser goes on to https:// by itself
// where the site has it), the one the user chose because it works everywhere. The card completes a
// host written alone with the same scheme: a name ending in a common top-level name (a list of them,
// those common on Chinese sites among them; none that is also a file's ending, so that README.md
// stays words), localhost, an IP address, or any name with a port, with a path if it
// is given. It also keeps what names a place in its own way (another scheme, an anchor, a path); any
// other words are no address.

const WWW_SCHEME = "http://";
const ADDRESS = /^(https?:\/\/|www\.)\S+$/i;
const TLD = "com|org|net|io|dev|app|ai|co|cn|me|so|xyz|edu|gov|info|tech|site|page|link|cc|tv|us|uk|jp|de|fr|ru|top|vip|shop|store|online|club|wang|ltd|biz|pro|fun|icu|live|news|blog|cloud|museum|mobi|hk|tw|sg|kr|eu|ca|au";
const HOST = String.raw`[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLD})|localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]`;
const HOST_ALONE = new RegExp(String.raw`^(?:(?:${HOST})(?::\d+)?|[a-z0-9-]+:\d+)(?:[/?#]\S*)?$`, "i");
const PLACE = /^(?:#|\.{0,2}\/|assets\/|[a-z][a-z0-9+.-]*:\/\/\S|(?:mailto|tel|sms):\S)/i;

/**
 * The href of `text` when it is a web address alone (no spaces; http:// or https://, or www., which
 * gets http://), else null.
 */
export function addressOf(text) {
  const address = String(text ?? "").trim();
  if (!ADDRESS.test(address)) return null;
  return /^www\./i.test(address) ? `${WWW_SCHEME}${address}` : address;
}

/**
 * The href the link card makes of what was typed in it, trimmed: an address gets the scheme a pasted
 * one gets, what names a place of its own is as typed, nothing is "" (the link taken away), and words
 * that are none of these are null.
 */
export function typedHref(value) {
  if (!value) return "";
  if (ADDRESS.test(value)) return addressOf(value);
  if (PLACE.test(value)) return value;
  return HOST_ALONE.test(value) ? `${WWW_SCHEME}${value}` : null;
}
