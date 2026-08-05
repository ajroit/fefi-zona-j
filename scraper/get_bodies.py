import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        responses = {}
        
        async def handle_response(response):
            if "weball" in response.url:
                try:
                    text = await response.text()
                    responses[response.url] = text
                except:
                    pass
        
        page.on("response", handle_response)
        
        print("Navigating...")
        await page.goto("https://www.futsala.ar/torneo-joma-liga-de-honor-b-zona-1/t225/partidos?d=3&p=930&g=1428")
        
        # Wait 10 seconds for everything to load and render
        print("Waiting 10 seconds...")
        await page.wait_for_timeout(10000)
        
        # Save responses to a file
        with open("responses_bodies.json", "w") as f:
            json.dump(responses, f, indent=2)
            
        print(f"Captured {len(responses)} response bodies. Saved to responses_bodies.json.")
        
        await browser.close()

asyncio.run(main())
