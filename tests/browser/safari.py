"""Smoke-test editing in macOS Safari. See docs/testing.md for setup."""
from contextlib import contextmanager
from pathlib import Path
import signal
import subprocess

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


@contextmanager
def demo_sandbox():
    root = Path(__file__).resolve().parents[2]
    with subprocess.Popen(
        ["node", "src/cli/bin.mjs", "sandbox", "--demo"], cwd=root,
        stdout=subprocess.PIPE, text=True, encoding="utf-8",
    ) as server:
        try:
            address = None
            for line in server.stdout:
                if line.startswith("地址："):
                    address = line.removeprefix("地址：").strip()
                if address and line.startswith("工作区："):
                    yield address, Path(line.removeprefix("工作区：").strip())
                    return
            raise RuntimeError("The Gallery sandbox exited before announcing its workspace")
        finally:
            if server.poll() is None:
                server.send_signal(signal.SIGINT)


with demo_sandbox() as (address, workspace), webdriver.Safari() as browser:
    wait = WebDriverWait(browser, 20)
    frame = (By.CSS_SELECTOR, 'iframe.report-frame[src*="sandbox-notes"]')
    paragraph = (By.CSS_SELECTOR, 'main p[data-ge-block]')
    browser.get(address + "#sandbox-notes")
    wait.until(EC.presence_of_element_located(frame))
    notice = browser.find_element(By.CSS_SELECTOR, ".toast").get_attribute("textContent")
    assert "Chrome" not in notice, notice

    wait.until(EC.frame_to_be_available_and_switch_to_it(frame))
    target = wait.until(EC.element_to_be_clickable(paragraph))
    marker = "Safari autosave"
    target.click()
    second = "Another paragraph"
    ActionChains(browser).send_keys(marker, Keys.ENTER, second).perform()
    source = workspace / "sandbox-notes" / "doc.html"
    wait.until(lambda _: second in source.read_text(encoding="utf-8"), "Edit missing from doc.html")

    browser.switch_to.default_content()
    browser.refresh()
    wait.until(EC.frame_to_be_available_and_switch_to_it(frame))
    wait.until(EC.text_to_be_present_in_element(paragraph, marker), "Edit missing after reload")
    wait.until(EC.text_to_be_present_in_element((By.CSS_SELECTOR, "main p[data-ge-block] + p"), second),
               "Paragraph split missing after reload")
    print(f"Passed editing, autosave and reload in Safari {browser.capabilities['browserVersion']}")
