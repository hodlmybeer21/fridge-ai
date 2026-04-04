import express from 'express'
import cors from 'cors'
import axios from 'axios'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Load env
const envFile = readFileSync('/root/.config/openclaw/secrets.env', 'utf8')
envFile.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0 && !line.startsWith('#')) {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
})

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || ''

// ── Vision AI (OpenRouter / GPT-4o-mini) ────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { imageUrl } = req.body
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' })

  try {
    let imageData = imageUrl

    // If it's a data URL (base64 from browser), use as-is
    // If it's an external URL, proxy through our server to avoid CORS
    if (!imageUrl.startsWith('data:')) {
      try {
        const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 })
        const mimeType = imgResponse.headers['content-type'] || 'image/jpeg'
        imageData = `data:${mimeType};base64,${Buffer.from(imgResponse.data).toString('base64')}`
      } catch (proxyErr) {
        // Fall back to passing URL directly (some providers support it)
        console.warn('Image proxy failed, passing URL directly:', proxyErr.message)
      }
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageData } },
              {
                type: 'text',
                text: `You are a fridge inventory assistant. Look at this image and list ALL visible food items as a clean JSON array of ingredient names. Return ONLY a valid JSON array of strings, nothing else. Example: ["eggs","whole milk","cheddar cheese","broccoli","chicken breast"]. Be specific (e.g. "chicken breast" not "chicken", "cheddar cheese" not "cheese"). Include condiments and sauces you can identify.`
              }
            ]
          }
        ],
        max_tokens: 400
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fridgeai.goodbotai.tech',
          'X-Title': 'FridgeAI'
        }
      }
    )

    const text = response.data.choices?.[0]?.message?.content || ''
    const match = text.match(/\[[\s\S]*?\]/s)
    if (!match) return res.status(200).json({ ingredients: [], raw: text })
    const ingredients = JSON.parse(match[0])
    if (!Array.isArray(ingredients)) return res.status(200).json({ ingredients: [], raw: text })
    res.json({ ingredients: ingredients.filter(i => typeof i === 'string') })
  } catch (err: any) {
    console.error('Vision error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Vision analysis failed', detail: err.response?.data?.error?.message || err.message })
  }
})

// ── Spoonacular Recipe Search (with optional filters) ──────────────────────
app.post('/api/recipes', async (req, res) => {
  const { ingredients, cuisine, diet, maxReadyTime } = req.body
  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' })
  }

  // Filter out non-food items that might slip through
  const junk = ['bag', 'shelf', 'door', 'container', 'box', 'bottle', 'nothing', 'visible', 'empty']
  const clean = ingredients.filter(i =>
    typeof i === 'string' &&
    i.length > 2 &&
    !junk.some(j => i.toLowerCase().includes(j))
  )

  if (clean.length === 0) {
    return res.json({ recipes: [], message: 'No valid ingredients found' })
  }

  try {
    // Use complexSearch when filters are present, findByIngredients otherwise
    const hasFilters = cuisine || diet || maxReadyTime

    let response: any

    if (hasFilters) {
      // ── Filtered search via complexSearch ────────────────────────────────
      const params: any = {
        includeIngredients: clean.join(','),
        number: 12,
        ranking: 2,
        ignorePantry: true,
        apiKey: SPOONACULAR_KEY,
        addRecipeInformation: true,
        fillIngredients: true,
      }
      if (cuisine) params.cuisine = cuisine
      if (diet) params.diet = diet
      if (maxReadyTime) params.maxReadyTime = Number(maxReadyTime)

      response = await axios.get(
        'https://api.spoonacular.com/recipes/complexSearch',
        { params }
      )

      const recipes = (response.data.results || []).map((r: any) => {
        const used = (r.usedIngredients || []).map((u: any) => u.original)
        const missed = (r.missedIngredients || []).map((m: any) => m.original)
        const total = used.length + missed.length
        return {
          id: r.id,
          title: r.title,
          image: r.image,
          usedCount: used.length,
          missedCount: missed.length,
          missedIngredients: missed,
          usedIngredients: used,
          matchPercent: total > 0 ? Math.round((used.length / total) * 100) : 0,
          readyInMinutes: r.readyInMinutes,
          servings: r.servings,
          cuisines: r.cuisines,
          diets: r.diets,
        }
      })

      recipes.sort((a: any, b: any) => b.matchPercent - a.matchPercent)
      res.json({ recipes, analyzedIngredients: clean, filterApplied: true })
    } else {
      // ── Standard search via findByIngredients ────────────────────────────
      response = await axios.get(
        'https://api.spoonacular.com/recipes/findByIngredients',
        {
          params: {
            ingredients: clean.join(','),
            number: 8,
            ranking: 2,
            ignorePantry: true,
            apiKey: SPOONACULAR_KEY
          }
        }
      )

      const recipes = response.data.map((r: any) => ({
        id: r.id,
        title: r.title,
        image: r.image,
        usedCount: r.usedIngredientCount,
        missedCount: r.missedIngredientCount,
        missedIngredients: r.missedIngredients.map((m: any) => m.original),
        usedIngredients: r.usedIngredients.map((u: any) => u.original),
        matchPercent: Math.round((r.usedIngredientCount / (r.usedIngredientCount + r.missedIngredientCount)) * 100)
      }))

      recipes.sort((a: any, b: any) => b.matchPercent - a.matchPercent)
      res.json({ recipes, analyzedIngredients: clean, filterApplied: false })
    }
  } catch (err: any) {
    console.error('Spoonacular error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Recipe search failed', detail: err.response?.data })
  }
})

// ── Recipe Detail ────────────────────────────────────────────────────────────
app.get('/api/recipes/:id', async (req, res) => {
  const { id } = req.params
  try {
    const [summaryRes, infoRes] = await Promise.all([
      axios.get(`https://api.spoonacular.com/recipes/${id}/summary`, {
        params: { apiKey: SPOONACULAR_KEY }
      }),
      axios.get(`https://api.spoonacular.com/recipes/${id}/information`, {
        params: { apiKey: SPOONACULAR_KEY, includeNutrition: false }
      })
    ])

    res.json({
      summary: summaryRes.data,
      info: {
        readyInMinutes: infoRes.data.readyInMinutes,
        servings: infoRes.data.servings,
        sourceUrl: infoRes.data.sourceUrl,
        instructions: infoRes.data.instructions,
        extendedIngredients: infoRes.data.extendedIngredients?.map((i: any) => i.original)
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get recipe details' })
  }
})

// ── Serve Static (Production) ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const { default: serveStatic } = await import('serve-static')
  app.use(serveStatic(resolve(__dirname, '../dist/client')))
}

app.listen(PORT, () => {
  console.log(`FridgeAI server running on :${PORT}`)
})
