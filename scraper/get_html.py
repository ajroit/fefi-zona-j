import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        print("Navigating...")
        await page.goto("https://www.futsala.ar/torneo-joma-liga-de-honor-b-zona-1/t225/partidos?d=3&p=930&g=1428", wait_until="networkidle")
        
        # Save HTML
        html = await page.content()
        with open("final.html", "w") as f:
            f.write(html)
            
        print("Saved to final.html.")
        await browser.close()

asyncio.run(main())
