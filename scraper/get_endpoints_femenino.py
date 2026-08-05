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
        await page.goto("https://www.futsala.ar/torneo-joma-elite-1/t230/clasificacion?d=1&p=935&g=1433", wait_until="networkidle")
        
        # Filter endpoints that match api.weball.me
        api_endpoints = [url for url in endpoints if "api.weball.me" in url]
        
        with open("endpoints_femenino.json", "w") as f:
            json.dump(api_endpoints, f, indent=2)
            
        print(f"Captured {len(api_endpoints)} API requests. Saved to endpoints_femenino.json.")
        
        await browser.close()

asyncio.run(main())
