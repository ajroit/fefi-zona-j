import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating...")
        await page.goto("https://www.futsala.ar/torneo-joma-liga-de-honor-b-zona-1/t225/partidos?d=3&p=930&g=1428", wait_until="networkidle")
        
        print("Waiting for content to load...")
        try:
            # Wait for some text to appear, like 'BROWN' or 'Fecha 9'
            await page.wait_for_selector("text='Fecha 9'", timeout=15000)
            print("Found Fecha 9")
            await page.wait_for_timeout(2000)
        except Exception as e:
            print("Timeout waiting for content:", e)
            
        await page.screenshot(path="screenshot2.png", full_page=True)
        html = await page.content()
        with open("final2.html", "w") as f:
            f.write(html)
        print("Saved screenshot2.png and final2.html")
        await browser.close()

asyncio.run(main())
