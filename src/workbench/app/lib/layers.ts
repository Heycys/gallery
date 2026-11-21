/**
 * 浮层栈：每个打开的浮层（弹出菜单、块菜单、搜索框、移动端抽屉……）入栈一个关闭函数。
 * 按 Esc 时只关闭最上面那一层 —— 例如块菜单开着子菜单时，第一次 Esc 关子菜单，第二次关菜单。
 */
type Layer = { close: () => void };
const stack: Layer[] = [];

export function pushLayer(close: () => void): () => void {
  const layer = { close };
  stack.push(layer);
  return () => {
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 关闭最上层；没有浮层时返回 false */
export function closeTopLayer(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top.close();
  return true;
}
