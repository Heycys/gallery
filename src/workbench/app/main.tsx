import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './components/components.css';
import './state/theme';
import { App } from './App';
import { language } from '../../shared/i18n/index.mjs';
import { startPresence } from './session/presence';
import { guardDrops } from '../../shared/drop-guard.mjs';

document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';

// 这个标签页打开着什么，报给本机的服务（gallery status）
startPresence();

// 文件、链接拖到侧栏、顶栏这些不接的地方松开：浏览器不另开标签页打开它（文档里的由文档页自己处理）
guardDrops(window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 首帧之后再开启过渡动画
setTimeout(() => document.body.classList.remove('preload'), 100);
