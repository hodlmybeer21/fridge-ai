import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/root/.openclaw/workspace/fridge-ai/marketing/screens';

// Simulate app states by injecting mock data
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // --- Screen 1: Home / Upload ---
  const page1 = await browser.newPage();
  await page1.setViewportSize({ width: 390, height: 844 });
  await page1.goto('https://fridge.goodbotai.tech', { timeout: 20000 });
  await page1.waitForTimeout(2000);
  await page1.screenshot({ path: `${OUT}/02-upload-flow.png`, fullPage: false });
  console.log('Captured: 02-upload-flow');
  await page1.close();

  // --- Simulate the full flow by injecting mock ingredients and rendering ---
  // This works because the app is a static React app - we can inject state via URL params
  const page2 = await browser.newPage();
  await page2.setViewportSize({ width: 390, height: 844 });

  // Intercept API calls to inject mock data for screenshot purposes
  await page2.route('**/api/recipes', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        recipes: [
          { id: 1, title: 'Chicken Broccoli Cheddar Bake', image: 'https://spoonacular.com/recipeImages/715594-312x231.jpg', usedCount: 4, missedCount: 1, matchPercent: 89, missedIngredients: ['garlic cloves'], usedIngredients: ['chicken', 'broccoli', 'cheddar cheese', 'eggs'] },
          { id: 2, title: '15-Minute Garlic Chicken', image: 'https://spoonacular.com/recipeImages/716426-312x231.jpg', usedCount: 3, missedCount: 2, matchPercent: 75, missedIngredients: ['soy sauce', 'ginger'], usedIngredients: ['chicken', 'eggs', 'rice'] },
          { id: 3, title: 'Cheesy Vegetable Frittata', image: 'https://spoonacular.com/recipeImages/716408-312x231.jpg', usedCount: 4, missedCount: 0, matchPercent: 100, missedIngredients: [], usedIngredients: ['eggs', 'cheddar cheese', 'broccoli', 'milk'] },
          { id: 4, title: 'One-Pan Chicken Rice', image: 'https://spoonacular.com/recipeImages/782585-312x231.jpg', usedCount: 3, missedCount: 3, matchPercent: 62, missedIngredients: ['onion', 'thyme', 'chicken broth'], usedIngredients: ['chicken', 'rice', 'eggs'] },
        ]
      })
    });
  });

  await page2.goto('https://fridge.goodbotai.tech', { timeout: 20000 });
  await page2.waitForTimeout(1000);

  // Inject ingredients into app state via localStorage simulation
  // Since we can't easily do this, just screenshot the home state
  await page2.screenshot({ path: `${OUT}/03-app-home-full.png`, fullPage: false });
  console.log('Captured: 03-app-home-full');

  // Capture the page title area
  const title = await page2.locator('h1').first().textContent().catch(() => 'FridgeAI');
  console.log('App title:', title);
  await page2.close();

  await browser.close();
  console.log('Screenshot session done!');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
