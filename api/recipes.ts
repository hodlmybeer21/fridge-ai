import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' })
    return
  }

  const { ingredients } = req.body || {}
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' })
  }

  const junk = ['bag', 'shelf', 'door', 'container', 'box', 'bottle', 'nothing', 'visible', 'empty', 'fridge', 'freezer']
  const clean = ingredients.filter((i: any) =>
    typeof i === 'string' && i.length > 2 && !junk.some((j: string) => i.toLowerCase().includes(j))
  )
  if (clean.length === 0) return res.json({ recipes: [] })

  try {
    const response = await axios.get(
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
    res.json({ recipes, analyzedIngredients: clean })
  } catch (err: any) {
    console.error('Spoonacular error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Recipe search failed', detail: err.response?.data })
  }
}
