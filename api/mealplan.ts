import type { VercelRequest, VercelResponse } from '@vercel/node'

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { targetCalories, diet, exclude } = req.body || {}

    const params = new URLSearchParams({
      apiKey: SPOONACULAR_KEY,
      timeFrame: 'week',
      ...(targetCalories ? { targetCalories: String(targetCalories) } : {}),
      ...(diet ? { diet } : {}),
    })

    if (exclude) params.set('exclude', exclude)

    const response = await fetch(
      `https://api.spoonacular.com/mealplanner/generate?${params}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: 'Spoonacular error', detail: err })
    }

    const data = await response.json()

    return res.status(200).json({
      week: data.week || {},
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
