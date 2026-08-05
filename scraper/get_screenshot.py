import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating...")
        await page.goto("https://www.futsala.ar/torneo-joma-liga-de-honor-b-zona-1/t225/partidos?d=3&p=930&g=1428", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        await page.screenshot(path="screenshot.png", full_page=True)
        print("Saved screenshot.png")
        await browser.close()

asyncio.run(main())
