import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        endpoints = []
        
        page.on("response", lambda response: endpoints.append(response.url))
        
        print("Navigating...")
        await page.goto("https://www.futsala.ar/torneo-joma-fecha-de-duelos-masc/t34b/clasificacion?d=2&p=1295&g=1931", wait_until="networkidle")
        
        # Save endpoints to a file
        with open("endpoints_duelos.json", "w") as f:
            json.dump(endpoints, f, indent=2)
            
        print(f"Captured {len(endpoints)} requests. Saved to endpoints_duelos.json.")
        
        await browser.close()

asyncio.run(main())
